import {
  IGetSurfacePresenceCommand,
  IGetSurfacePresenceUseCase,
  IPresenceHeartbeatCommand,
  IPresenceHeartbeatUseCase,
} from '@/application/contracts/presence';
import { IPresenceStore } from '@/domain/ports/cache';
import {
  IUserBlockRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  PresenceHeartbeatsPerUserPerMinute,
  PresenceTtlSeconds,
  UserStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IPresenceHeartbeatResponseDto,
  ISurfacePresenceResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { toPublicAuthorSummary } from '../shared/public-author';

const HeartbeatBucket = 'presence:heartbeat';
const HeartbeatWindowSeconds = 60;

/**
 * Heartbeat presence theo tab (PR #46 §10.3).
 *
 * Hai lớp giới hạn khác nghĩa nhau:
 * - lặp CÙNG surface sớm hơn 30 giây: bỏ qua êm trong Redis (`refreshed: false`) — app gửi
 *   theo nhịp, gửi dư không phải lỗi của người dùng;
 * - trần cứng mỗi người mỗi phút trên mọi session: chặn client hỏng hoặc cố ý bơm, bằng
 *   `TOO_MANY_REQUESTS` như mọi trần khác.
 */
@Injectable()
export class PresenceHeartbeatUseCase implements IPresenceHeartbeatUseCase {
  public constructor(
    @Inject(IPresenceStore) private readonly store: IPresenceStore,
    @Inject(IRequestThrottle) private readonly throttle: IRequestThrottle,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  public async handle(
    command: IPresenceHeartbeatCommand,
  ): Promise<IPresenceHeartbeatResponseDto> {
    await this.throttle.assertWithinLimit({
      bucket: HeartbeatBucket,
      key: command.userId,
      limit: PresenceHeartbeatsPerUserPerMinute,
    });
    await this.throttle.registerHit({
      bucket: HeartbeatBucket,
      key: command.userId,
      windowSeconds: HeartbeatWindowSeconds,
    });

    // Đọc cờ mỗi heartbeat (một truy vấn theo khoá chính mỗi phút mỗi người): bật cờ thì tới
    // nhịp kế tiếp là hiện; tắt cờ thì `PATCH /profile/me` đã xoá ngay, nhịp sau không thêm lại.
    const user = await this.users.findOneBy({ globalId: command.userId });
    const refreshed = await this.store.heartbeat({
      userId: command.userId,
      sessionId: command.sessionId,
      surface: command.surface,
      nowMs: Date.now(),
      visible: user?.showOnlineStatus === true,
    });

    return {
      presence: {
        surface: command.surface,
        sessionId: command.sessionId,
        expiresInSeconds: PresenceTtlSeconds,
        refreshed: refreshed === true,
      },
    };
  }
}

const DefaultVisibleLimit = 10;
const MaxVisibleLimit = 50;

/**
 * Số người đang ở một surface (PR #46 §10.4) và những người trong đó đã bật hiện trạng thái
 * online (§10.5).
 *
 * `onlineCount` đếm MỌI người, bật cờ hay không. `visibleUsers` chỉ gồm người còn bật cờ và
 * tài khoản còn hoạt động — Redis chỉ cho ứng viên, database quyết: cờ vừa tắt hay tài khoản
 * vừa bị khoá giữa hai nhịp heartbeat thì không được lọt ra. Không bao giờ có chính người gọi,
 * không có userId, không có gì về tab nào khác.
 */
@Injectable()
export class GetSurfacePresenceUseCase implements IGetSurfacePresenceUseCase {
  public constructor(
    @Inject(IPresenceStore) private readonly store: IPresenceStore,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IUserBlockRepository)
    private readonly blocks: IUserBlockRepository,
  ) {}

  public async handle(
    command: IGetSurfacePresenceCommand,
  ): Promise<ISurfacePresenceResponseDto> {
    const now = Date.now();
    const limit = Math.min(
      Math.max(Math.trunc(command.limit ?? DefaultVisibleLimit), 1),
      MaxVisibleLimit,
    );
    // Redis không trả lời thì hiện 0 người và danh sách rỗng, thay vì làm hỏng cả tab chỉ vì
    // một phần trang trí.
    const [onlineCount, candidates] = await Promise.all([
      this.store.countOnline(command.surface, now),
      // Lấy dư để bỏ chính người gọi và người có quan hệ chặn ra vẫn đủ `limit`.
      this.store.listVisible(command.surface, now, limit * 2 + 1),
    ]);

    let ids = (candidates ?? []).filter((id) => id !== command.currentUserId);
    // Chặn có hiệu lực HAI chiều: không thấy người mình chặn, cũng không thấy người đã chặn
    // mình — nếu không, người bị chặn suy ra được mình bị chặn khi thấy đối phương online.
    if (command.currentUserId && ids.length > 0) {
      const related = await this.blocks.filterBlockRelations(
        command.currentUserId,
        ids,
      );
      ids = ids.filter((id) => !related.has(id));
    }
    const rows =
      ids.length > 0 ? await this.users.findBy({ globalId: In(ids) }) : [];
    const byId = new Map(rows.map((row) => [row.globalId, row]));
    const visibleUsers = ids
      .map((id) => byId.get(id))
      .filter(
        (row): row is NonNullable<typeof row> =>
          row !== undefined &&
          row.showOnlineStatus === true &&
          row.status === UserStatuses.ACTIVE &&
          !row.deletedAt,
      )
      .slice(0, limit)
      // `userId` chỉ cho người ĐÃ đăng nhập — để mở phòng chat trực tiếp. Khách xem danh sách
      // công khai không nhận id, cùng lối các danh sách công khai khác.
      .map((row) =>
        command.currentUserId
          ? { userId: row.globalId, ...toPublicAuthorSummary(row) }
          : toPublicAuthorSummary(row),
      );

    return {
      presence: {
        surface: command.surface,
        onlineCount: onlineCount ?? 0,
        visibleUsers,
      },
    };
  }
}
