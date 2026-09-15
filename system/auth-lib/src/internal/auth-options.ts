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

  /**
   * Tiền tố đường dẫn luôn công khai, không cần `@Public()`.
   *
   * Tồn tại vì các controller ở tầng `kernel/` (ví dụ `/health` của health-lib)
   * KHÔNG được phép phụ thuộc vào `system/auth-lib` để lấy decorator `@Public()`
   * — chiều phụ thuộc đó là sai. Guard nhận danh sách này thay vì bắt kernel
   * biết tới auth.
   */
  publicPathPrefixes: readonly string[];
}

export const IAuthOptions = Symbol('IAuthOptions');
