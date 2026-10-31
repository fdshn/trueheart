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

/**
 * Một người đang online đã bật `showOnlineStatus`. `userId` CHỈ có khi người gọi đã đăng nhập —
 * để mở phòng chat trực tiếp; khách xem danh sách công khai không nhận id.
 */
export interface IPresenceVisibleUserDto extends IPublicAuthorSummaryDto {
  userId?: string;
}

export interface ISurfacePresenceDto {
  surface: PresenceSurfaces;
  /** Số NGƯỜI (đã gộp nhiều thiết bị) còn heartbeat trong 120 giây qua. */
  onlineCount: number;
  /** Phase 1 luôn rỗng — chưa có cài đặt `showOnlineStatus` để công khai danh tính. */
  visibleUsers: IPresenceVisibleUserDto[];
}

export interface ISurfacePresenceResponseDto {
  presence: ISurfacePresenceDto;
}
