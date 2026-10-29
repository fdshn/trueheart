import { PresenceSurfaces } from '@chantam.vn/chantam.core-lib/consts';
import {
  IPresenceHeartbeatResponseDto,
  ISurfacePresenceResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IPresenceHeartbeatCommand {
  userId: string;
  sessionId: string;
  surface: PresenceSurfaces;
}

export interface IPresenceHeartbeatUseCase extends IUseCase<
  IPresenceHeartbeatCommand,
  IPresenceHeartbeatResponseDto
> {}

export const IPresenceHeartbeatUseCase = Symbol('IPresenceHeartbeatUseCase');

export interface IGetSurfacePresenceCommand {
  surface: PresenceSurfaces;
  /** Người gọi (nếu đã đăng nhập) — không bao giờ nằm trong `visibleUsers` của chính họ. */
  currentUserId?: string;
  /** Số người tối đa trong `visibleUsers`, 1–50; mặc định 10. */
  limit?: number;
}

export interface IGetSurfacePresenceUseCase extends IUseCase<
  IGetSurfacePresenceCommand,
  ISurfacePresenceResponseDto
> {}

export const IGetSurfacePresenceUseCase = Symbol('IGetSurfacePresenceUseCase');
