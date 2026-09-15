import { IAuthResultDto } from './session.dto';

export interface IRefreshSessionDto {
  refreshToken: string;
}

export interface IRefreshSessionBodyDto {
  session: IRefreshSessionDto;
}

/** Refresh xoay vòng token: token cũ bị thu hồi, trả về cặp hoàn toàn mới. */
export interface IRefreshSessionResponseDto extends IAuthResultDto {}
