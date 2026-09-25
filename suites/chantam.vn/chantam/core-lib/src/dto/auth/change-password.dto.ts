import { IAuthResultDto } from './session.dto';

export interface IChangePasswordDto {
  /** Mật khẩu đang dùng. Bắt nhập lại vì access token có thể đang ở tay người mượn máy. */
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  /** Thiết bị đang gọi, để cấp lại phiên cho chính nó sau khi thu hồi tất cả. */
  deviceId: string;
  fcmToken?: string;
}

export interface IChangePasswordBodyDto {
  password: IChangePasswordDto;
}

/**
 * Trả về cặp token MỚI.
 *
 * Đổi mật khẩu thu hồi sạch mọi phiên, gồm cả phiên vừa gọi endpoint này —
 * không trả lại cặp mới thì người dùng bị đá ra khỏi app ngay sau khi làm đúng
 * một việc nên làm.
 */
export interface IChangePasswordResponseDto extends IAuthResultDto {}
