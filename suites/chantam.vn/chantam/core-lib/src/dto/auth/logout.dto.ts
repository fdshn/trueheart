export interface ILogoutDto {
  refreshToken: string;
}

export interface ILogoutBodyDto {
  session: ILogoutDto;
}

export interface ILogoutResponseDto {
  loggedOutAt: Date;
}
