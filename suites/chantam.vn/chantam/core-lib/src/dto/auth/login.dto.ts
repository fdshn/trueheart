import { IAuthResultDto } from './session.dto';

export interface ILoginDto {
  /** Username, email hoặc số điện thoại — đăng nhập đa định danh (F02). */
  identifier: string;
  password: string;
  deviceId: string;
  fcmToken?: string;
}

export interface ILoginBodyDto {
  credentials: ILoginDto;
}

export interface ILoginResponseDto extends IAuthResultDto {}
