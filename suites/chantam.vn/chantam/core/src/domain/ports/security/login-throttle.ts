/**
 * Chống dò mật khẩu (F02).
 *
 * Đếm theo định danh đăng nhập chứ không theo IP: IP dùng chung (4G, văn phòng,
 * quán cà phê) sẽ khiến một người sai mật khẩu làm khoá cả toà nhà.
 */
export interface ILoginThrottle {
  /** Ném `TooManyLoginAttemptsException` nếu đang bị khoá. */
  assertNotLocked(identifier: string): Promise<void>;

  /** Ghi một lần sai. Vượt ngưỡng thì khoá tạm. */
  registerFailure(identifier: string): Promise<void>;

  /** Xoá bộ đếm sau khi đăng nhập thành công. */
  reset(identifier: string): Promise<void>;
}

export const ILoginThrottle = Symbol('ILoginThrottle');
