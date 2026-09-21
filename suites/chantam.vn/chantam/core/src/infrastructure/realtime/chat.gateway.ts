import { IChatRealtimePublisher } from '@/domain/ports/realtime';
import { IChatRepository } from '@/domain/ports/repository';
import { IChatMessageDto } from '@chantam.vn/chantam.core-lib/dto';
import {
  IAuthPrincipal,
  ITokenDenyList,
  ITokenService,
} from '@chantam/service.auth-lib';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/** Tên phòng Socket.io cho một phòng chat. */
function socketRoom(roomId: string): string {
  return `chat:${roomId}`;
}

interface SocketData {
  principal: IAuthPrincipal;
}

/**
 * Kênh nhận tin nhắn theo thời gian thực (F37).
 *
 * **Gateway chỉ ĐỌC và PHÁT, không ghi.** Gửi tin nhắn đi qua
 * `POST /chat/rooms/:roomId/messages` như mọi thao tác ghi khác. Một đường ghi
 * duy nhất nghĩa là chỉ một chỗ kiểm quyền, kiểm trạng thái phòng và sinh mã
 * lỗi — mở đường ghi thứ hai qua socket là nhân đôi toàn bộ những phép kiểm đó,
 * và bản thứ hai sẽ lệch dần theo thời gian.
 *
 * Người gửi vẫn nhận phản hồi tức thì từ chính response của POST; socket lo
 * việc đẩy tin sang máy của người còn lại.
 */
@WebSocketGateway({
  namespace: 'chat',
  // Tắt CORS mặc định mở: client thật đi qua cùng tên miền hoặc qua cấu hình
  // triển khai, không phải qua `origin: '*'`.
  cors: { origin: false },
})
@Injectable()
export class ChatGateway
  implements OnGatewayConnection, IChatRealtimePublisher
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private server!: Server;

  public constructor(
    @Inject(ITokenService) private readonly tokenService: ITokenService,
    @Inject(ITokenDenyList) private readonly denyList: ITokenDenyList,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  /**
   * Xác thực NGAY lúc bắt tay, và ngắt kết nối nếu không hợp lệ.
   *
   * Làm đủ hai bước như `JwtAuthGuard`: chữ ký hợp lệ vẫn chưa đủ, vì đổi mật
   * khẩu hay xoá tài khoản xong thì token cũ còn hạn nhưng phải chết ngay. Bỏ
   * bước tra danh sách thu hồi ở đây là mở một đường vào mà HTTP đã bịt.
   */
  public async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) return this.reject(client, 'thiếu access token');

      const principal = await this.tokenService.verifyAccessToken(token);

      // Thiếu `issuedAt` thì TỪ CHỐI: không đối chiếu được với danh sách thu
      // hồi nghĩa là không biết token còn hiệu lực hay không.
      if (!principal.issuedAt)
        return this.reject(client, 'token thiếu thời điểm phát hành');

      if (await this.denyList.isRevoked(principal.userId, principal.issuedAt))
        return this.reject(client, 'token đã bị thu hồi');

      (client.data as SocketData).principal = principal;
    } catch {
      // KHÔNG nói rõ lý do ra ngoài: phân biệt "token sai chữ ký" với "token
      // của tài khoản đã xoá" là để lộ thông tin về tài khoản.
      this.reject(client, 'access token không hợp lệ');
    }
  }

  /**
   * Vào một phòng để nhận tin. Chỉ hai bên của giao dịch vào được.
   *
   * Quyền đọc lại từ database mỗi lần join chứ không tin vào token: token mang
   * ảnh chụp lúc phát hành, còn phòng thì có thể vừa đổi chủ do bài bị xoá.
   */
  @SubscribeMessage('room:join')
  public async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId?: unknown },
  ): Promise<{ joined: boolean }> {
    const principal = (client.data as SocketData).principal;
    if (!principal) return { joined: false };

    const roomId = typeof payload?.roomId === 'string' ? payload.roomId : null;
    if (!roomId) return { joined: false };

    const room = await this.chat.findRoomForParticipant(
      roomId,
      principal.userId,
    );
    // Không phải người trong phòng thì chỉ trả `false`, không nói vì sao —
    // giống cách HTTP gộp "không tồn tại" với "không phải của bạn".
    if (!room) return { joined: false };

    await client.join(socketRoom(roomId));
    return { joined: true };
  }

  @SubscribeMessage('room:leave')
  public async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId?: unknown },
  ): Promise<{ left: boolean }> {
    const roomId = typeof payload?.roomId === 'string' ? payload.roomId : null;
    if (!roomId) return { left: false };

    await client.leave(socketRoom(roomId));
    return { left: true };
  }

  public async publishMessage(
    roomId: string,
    message: IChatMessageDto,
  ): Promise<void> {
    // `server` chưa có khi ứng dụng chạy mà không dựng HTTP server (CLI), nên
    // phát tin phải là việc tuỳ chọn — không được làm sập luồng gửi tin.
    if (!this.server) return;

    // `isMine` phụ thuộc người NHẬN, nên không gửi kèm: mỗi client tự so
    // `senderId` với chính mình. Gửi `isMine: true` cho tất cả là nói sai với
    // người còn lại.
    const { isMine: _isMine, ...payload } = message;
    this.server.to(socketRoom(roomId)).emit('message:new', payload);
    return Promise.resolve();
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
    this.logger.debug(`Từ chối kết nối chat: ${reason}`);
    client.emit('connection:rejected', { reason });
    client.disconnect(true);
  }
}
