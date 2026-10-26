import { PresenceSurfaces } from '../../consts';
import { IPublicAuthorSummaryDto } from '../author';

export interface IPresenceHeartbeatDto {
  surface: PresenceSurfaces;
  /** UUID do app sinh mỗi lần khởi động — phân biệt nhiều thiết bị của cùng một người. */
  sessionId: string;
}

export interface IPresenceHeartbeatBodyDto {
  presence: IPresenceHeartbeatDto;
}

export interface IPresenceHeartbeatResultDto {
  surface: PresenceSurfaces;
  sessionId: string;
  expiresInSeconds: number;
  /**
   * `false` khi heartbeat bị bỏ qua: lặp cùng surface quá sớm, hoặc Redis không trả lời.
   * Không phải lỗi — app cứ gửi tiếp theo nhịp thường.
   */
  refreshed: boolean;
}

export interface IPresenceHeartbeatResponseDto {
  presence: IPresenceHeartbeatResultDto;
}

export interface IPresenceSurfaceParamsDto {
  surface: PresenceSurfaces;
}

export interface IPresenceSurfaceQueryDto {
  limit?: number;
}

export interface ISurfacePresenceDto {
  surface: PresenceSurfaces;
  /** Số NGƯỜI (đã gộp nhiều thiết bị) còn heartbeat trong 120 giây qua. */
  onlineCount: number;
  /** Phase 1 luôn rỗng — chưa có cài đặt `showOnlineStatus` để công khai danh tính. */
  visibleUsers: IPublicAuthorSummaryDto[];
}

export interface ISurfacePresenceResponseDto {
  presence: ISurfacePresenceDto;
}
