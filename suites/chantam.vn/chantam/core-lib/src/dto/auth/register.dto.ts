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
   * Mã sai hay nhóm đã giải tán thì đăng ký VẪN thành công, chỉ là không vào
   * nhóm nào — bắt đăng ký lại vì một mã hỏng là phạt người dùng cho lỗi của
   * người gửi link.
   */
  inviteCode?: string;
}

export interface IRegisterBodyDto {
  registration: IRegisterDto;
}

/** Đăng ký xong tự đăng nhập luôn (F01) nên trả về sẵn cặp token. */
export interface IRegisterResponseDto extends IAuthResultDto {}
