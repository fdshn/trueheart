export interface IDeleteAccountDto {
  /** Bắt nhập lại mật khẩu: xoá tài khoản là thao tác không hoàn tác được. */
  password: string;
}

export interface IDeleteAccountBodyDto {
  account: IDeleteAccountDto;
}

export interface IDeleteAccountResponseDto {
  deletedAt: Date;
  revokedSessions: number;
}
