import {
  IGetSurfacePresenceCommand,
  IGetSurfacePresenceUseCase,
  IPresenceHeartbeatCommand,
  IPresenceHeartbeatUseCase,
} from '@/application/contracts/presence';
import { IPresenceStore } from '@/domain/ports/cache';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  PresenceHeartbeatsPerUserPerMinute,
  PresenceTtlSeconds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IPresenceHeartbeatResponseDto,
  ISurfacePresenceResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

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

    const refreshed = await this.store.heartbeat({
      userId: command.userId,
      sessionId: command.sessionId,
      surface: command.surface,
      nowMs: Date.now(),
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

/**
 * Số người đang ở một surface (PR #46 §10.4). Phase 1 KHÔNG trả danh tính: chưa có cài đặt
 * `showOnlineStatus`, nên `visibleUsers` luôn rỗng và không cần hỏi bảng người dùng.
 */
@Injectable()
export class GetSurfacePresenceUseCase implements IGetSurfacePresenceUseCase {
  public constructor(
    @Inject(IPresenceStore) private readonly store: IPresenceStore,
  ) {}

  public async handle(
    command: IGetSurfacePresenceCommand,
  ): Promise<ISurfacePresenceResponseDto> {
    // Redis không trả lời thì hiện 0 thay vì làm hỏng cả tab chỉ vì một con số trang trí.
    const onlineCount =
      (await this.store.countOnline(command.surface, Date.now())) ?? 0;

    return {
      presence: { surface: command.surface, onlineCount, visibleUsers: [] },
    };
  }
}
