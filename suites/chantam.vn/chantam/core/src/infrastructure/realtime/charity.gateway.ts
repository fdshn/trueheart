import { ICharityRealtimePublisher } from '@/domain/ports/realtime';
import {
  IAdminConfigRepository,
  ICharityCampaignRepository,
  ICharityProjectRepository,
} from '@/domain/ports/repository';
import {
  CharityRealtimeCoalesceMs,
  CharityRealtimeSection,
  MaxCharitySocketsPerUser,
  charityRealtimeRoom,
} from '@chantam.vn/chantam.core-lib/models';
import {
  IAuthPrincipal,
  ITokenDenyList,
  ITokenService,
} from '@chantam/service.auth-lib';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface SocketData {
  principal?: IAuthPrincipal;
  counted?: boolean;
  /**
   * Lượt xác thực lúc bắt tay. Client gửi `project:join` ngay khi nối — sự kiện đó có thể tới
   * TRƯỚC khi xác thực (bất đồng bộ) xong; `join` chờ cái này thay vì coi là chưa đăng nhập.
   */
  authenticated?: Promise<void>;
}

interface IPendingSignal {
  public: Set<CharityRealtimeSection>;
  workspace: Set<CharityRealtimeSection>;
  timer: NodeJS.Timeout;
}

/**
 * Realtime dự án từ thiện (CHARITY-PROJECT-LIFECYCLE §3.15) — namespace `/charity`.
 *
 * Sáu biện pháp đã chốt:
 * 1. Nhiều instance: Redis adapter gắn ở `main.ts` (`RedisIoAdapter`).
 * 2. Hai phòng mỗi dự án — `charity:{id}:public` và `charity:{id}:workspace`; quyền đọc lại từ
 *    database MỖI lần join. Payload chỉ là tín hiệu `{ campaignId, sections, version }`.
 * 3. Mất tín hiệu thì REST vẫn đúng: client so `version`/nối lại thì gọi lại API.
 * 4. Gộp theo dự án tối đa 1 tín hiệu / giây.
 * 5. Chỉ người đã đăng nhập; tối đa `MaxCharitySocketsPerUser` kết nối / người / instance.
 *    Khách xem trang công khai polling.
 * 6. Phát SAU commit — use case gọi `signal` sau khi repository trả về.
 *
 * Gateway chỉ đọc và phát, không ghi — như chat.
 */
@WebSocketGateway({ namespace: 'charity', cors: { origin: false } })
@Injectable()
export class CharityGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnApplicationShutdown,
    ICharityRealtimePublisher
{
  private readonly logger = new Logger(CharityGateway.name);
  private readonly connections = new Map<string, number>();
  private readonly pending = new Map<string, IPendingSignal>();

  @WebSocketServer()
  private server!: Server;

  public constructor(
    @Inject(ITokenService) private readonly tokenService: ITokenService,
    @Inject(ITokenDenyList) private readonly denyList: ITokenDenyList,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public handleConnection(client: Socket): Promise<void> {
    const data = client.data as SocketData;
    data.authenticated = this.authenticate(client);
    return data.authenticated;
  }

  private async authenticate(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) return this.reject(client, 'thiếu access token');
      const principal = await this.tokenService.verifyAccessToken(token);
      if (!principal.issuedAt)
        return this.reject(client, 'token thiếu thời điểm phát hành');
      if (await this.denyList.isRevoked(principal.userId, principal.issuedAt))
        return this.reject(client, 'token đã bị thu hồi');

      const open = this.connections.get(principal.userId) ?? 0;
      if (open >= MaxCharitySocketsPerUser)
        return this.reject(client, 'quá nhiều kết nối');
      this.connections.set(principal.userId, open + 1);
      const data = client.data as SocketData;
      data.principal = principal;
      data.counted = true;
    } catch {
      this.reject(client, 'access token không hợp lệ');
    }
  }

  public handleDisconnect(client: Socket): void {
    const data = client.data as SocketData;
    if (!data.counted || !data.principal) return;
    const userId = data.principal.userId;
    const open = (this.connections.get(userId) ?? 1) - 1;
    if (open <= 0) this.connections.delete(userId);
    else this.connections.set(userId, open);
  }

  /**
   * Vào phòng của một dự án. `public`: dự án đang hiện ra ngoài. `workspace`: người tạo,
   * coordinator, Admin `campaign.read`. Không đủ quyền thì chỉ `joined: false`, không nói vì sao.
   */
  @SubscribeMessage('project:join')
  public async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { campaignId?: unknown; scope?: unknown },
  ): Promise<{ joined: boolean }> {
    const data = client.data as SocketData;
    await data.authenticated;
    const principal = data.principal;
    const campaignId =
      typeof payload?.campaignId === 'string' ? payload.campaignId : null;
    const scope = payload?.scope === 'workspace' ? 'workspace' : 'public';
    if (!principal || !campaignId) return { joined: false };

    const allowed =
      scope === 'public'
        ? (await this.projects.findVisibleCampaignId(campaignId)) === campaignId
        : await this.canReadWorkspace(campaignId, principal.userId);
    if (!allowed) return { joined: false };
    await client.join(charityRealtimeRoom(campaignId, scope));
    return { joined: true };
  }

  @SubscribeMessage('project:leave')
  public async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { campaignId?: unknown; scope?: unknown },
  ): Promise<{ left: boolean }> {
    const campaignId =
      typeof payload?.campaignId === 'string' ? payload.campaignId : null;
    if (!campaignId) return { left: false };
    const scope = payload?.scope === 'workspace' ? 'workspace' : 'public';
    await client.leave(charityRealtimeRoom(campaignId, scope));
    return { left: true };
  }

  public signal(
    campaignId: string,
    sections: readonly CharityRealtimeSection[],
    audience: 'public' | 'workspace',
  ): void {
    // Không có server (CLI, test) thì bỏ qua — phát tín hiệu không bao giờ được làm hỏng
    // việc chính.
    if (!this.server || sections.length === 0) return;
    let pending = this.pending.get(campaignId);
    if (!pending) {
      pending = {
        public: new Set(),
        workspace: new Set(),
        timer: setTimeout(
          () => this.flush(campaignId),
          CharityRealtimeCoalesceMs,
        ),
      };
      this.pending.set(campaignId, pending);
    }
    for (const section of sections) {
      // Thay đổi công khai thì ban tổ chức cũng cần biết.
      pending.workspace.add(section);
      if (audience === 'public') pending.public.add(section);
    }
  }

  public onApplicationShutdown(): void {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
  }

  private flush(campaignId: string): void {
    const pending = this.pending.get(campaignId);
    this.pending.delete(campaignId);
    if (!pending || !this.server) return;
    const version = Date.now();
    try {
      if (pending.public.size > 0)
        this.server
          .to(charityRealtimeRoom(campaignId, 'public'))
          .emit('project:changed', {
            campaignId,
            sections: [...pending.public],
            version,
          });
      if (pending.workspace.size > 0)
        this.server
          .to(charityRealtimeRoom(campaignId, 'workspace'))
          .emit('project:changed', {
            campaignId,
            sections: [...pending.workspace],
            version,
          });
    } catch (error) {
      this.logger.warn(
        `Không phát được tín hiệu dự án ${campaignId}: ${String(error)}`,
      );
    }
  }

  private async canReadWorkspace(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    const campaign = await this.campaigns.findByGlobalId(campaignId);
    if (!campaign) return false;
    if (campaign.createdBy === userId) return true;
    if (await this.campaigns.isCampaignManager(campaignId, userId)) return true;
    return this.admin.hasPermission(userId, 'campaign.read');
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer '))
      return header.slice('Bearer '.length);
    return null;
  }

  private reject(client: Socket, reason: string): void {
    this.logger.debug(`Từ chối kết nối charity: ${reason}`);
    client.emit('connection:rejected', { reason });
    client.disconnect(true);
  }
}
