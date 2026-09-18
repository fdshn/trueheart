import { IAuthResultDto } from './session.dto';

export interface IRegisterDto {
  username: string;
  password: string;
  confirmPassword: string;
  /** Định danh thiết bị do client sinh, để quản lý phiên theo máy. */
  deviceId: string;
  fcmToken?: string;
  referralCode?: string;
}

export interface IRegisterBodyDto {
  registration: IRegisterDto;
}

/** Đăng ký xong tự đăng nhập luôn (F01) nên trả về sẵn cặp token. */
export interface IRegisterResponseDto extends IAuthResultDto {}
