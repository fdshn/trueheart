import { IAuthResultDto } from './session.dto';

export interface IRegisterDto {
  username: string;
  password: string;
  confirmPassword: string;
  /** Định danh thiết bị do client sinh, để quản lý phiên theo máy. */
  deviceId: string;
  fcmToken?: string;
  referralCode?: string;
  /**
   * Mã mời nhóm (F54/BR-GRP-04).
   *
   * CHỈ dùng được lúc đăng ký: membership không sinh ra từ đường nào khác, và
   * chính ràng buộc đó là hàng rào chặn việc một người nhảy vòng quanh các nhóm
   * để gom affiliate.
   *
   * Mã sai hay nhóm đã giải tán thì đăng ký THẤT BẠI (`GROUP_INVITE_INVALID`) và
   * không tài khoản nào được tạo — quyết định 16/10/2026.
   */
  inviteCode?: string;
  /**
   * Cùng nghĩa với `inviteCode` — tên theo SRS 3.7A. Gửi một trong hai; gửi cả hai
   * mà khác nhau là 400.
   */
  groupInviteToken?: string;
}

export interface IRegisterBodyDto {
  registration: IRegisterDto;
}

/** Đăng ký xong tự đăng nhập luôn (F01) nên trả về sẵn cặp token. */
export interface IRegisterResponseDto extends IAuthResultDto {}
