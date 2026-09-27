/** Kênh gửi mã xác minh. */
export enum PasswordResetChannels {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  /** Tài khoản không có email lẫn SĐT — phải liên hệ Admin (F05). */
  ADMIN_SUPPORT = 'ADMIN_SUPPORT',
}

export interface IRequestPasswordResetDto {
  /** Username, email hoặc số điện thoại. */
  identifier: string;
}

export interface IRequestPasswordResetBodyDto {
  reset: IRequestPasswordResetDto;
}

export interface IRequestPasswordResetResponseDto {
  channel: PasswordResetChannels;

  /**
   * Đích gửi đã che bớt, ví dụ `ngu***@gmail.com` hoặc `098***4567`.
   *
   * Che vì người yêu cầu có thể không phải chủ tài khoản — hiện đủ để chủ nhận
   * ra email nào của mình, nhưng không đủ để người lạ đọc được địa chỉ.
   * `null` khi kênh là ADMIN_SUPPORT.
   */
  maskedTarget: string | null;

  expiresInSeconds: number | null;
}

export interface IVerifyPasswordResetOtpDto {
  identifier: string;
  otp: string;
}

export interface IVerifyPasswordResetOtpBodyDto {
  reset: IVerifyPasswordResetOtpDto;
}

export interface IVerifyPasswordResetOtpResponseDto {
  resetToken: string;
  expiresInSeconds: number;
}

export interface IConfirmPasswordResetDto {
  identifier?: string;
  otp?: string;
  resetToken?: string;
  newPassword: string;
  confirmPassword: string;
}

export interface IConfirmPasswordResetBodyDto {
  reset: IConfirmPasswordResetDto;
}

export interface IConfirmPasswordResetResponseDto {
  resetAt: Date;
  /** Số phiên bị thu hồi — đổi mật khẩu thì mọi thiết bị phải đăng nhập lại. */
  revokedSessions: number;
}
