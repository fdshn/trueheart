import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';

export interface IDispatchNotificationCommand {
  userId: string;
  type: NotificationTypes;
  title: string;
  body: string;
  referenceType?: string | null;
  referenceId?: string | null;
  /** Bỏ trống thì thông báo có thể trùng khi retry — hầu như luôn nên truyền. */
  idempotencyKey?: string | null;
}

export interface IDispatchNotificationResult {
  /** `false` khi trùng `idempotencyKey`, tức thông báo đã có từ trước. */
  created: boolean;
  /** Số thiết bị đã đẩy được. `0` khi chưa cấu hình nhà cung cấp. */
  pushedDevices: number;
}

/**
 * Ghi một thông báo trong app rồi cố đẩy xuống thiết bị (F44).
 *
 * Hai việc **tách rời**: ghi thất bại thì ném lỗi, còn đẩy thất bại thì chỉ làm
 * `pushedDevices` bằng 0. Mất đường đẩy không được làm mất thông báo — người
 * dùng mở app vẫn phải thấy.
 */
export interface IDispatchNotificationUseCase extends IUseCase<
  IDispatchNotificationCommand,
  IDispatchNotificationResult
> {}

export const IDispatchNotificationUseCase = Symbol(
  'IDispatchNotificationUseCase',
);
