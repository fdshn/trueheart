export interface IAuthOptions {
  /** Khoá ký JWT. Bắt buộc, tối thiểu 32 ký tự. */
  jwtSecret: string;

  /** Tuổi thọ access token. Ngắn vì không thu hồi được. Mặc định 15 phút. */
  accessTtlSeconds: number;

  /** Tuổi thọ refresh token. Mặc định 30 ngày. */
  refreshTtlSeconds: number;

  /**
   * Số vòng bcrypt. 12 là mức cân bằng hiện nay — khoảng 300ms trên phần cứng
   * phổ thông, đủ chậm để chống dò ngoại tuyến, đủ nhanh để không thành điểm
   * nghẽn lúc đăng nhập.
   */
  bcryptRounds: number;
}

export const IAuthOptions = Symbol('IAuthOptions');
