/**
 * Mã lỗi nghiệp vụ của Chân Tâm.
 *
 * Định dạng `0x<ResourceId><ReasonId>`. ResourceId đếm từ `0x01` trong phạm vi
 * package này; ReasonId đếm từ `0x01` trong mỗi nhóm resource. Trùng số với
 * package khác là bình thường — `ErrorOrigin` phân biệt chúng.
 */
export enum ErrorCodes {
  // 0x01 — Bài đăng cho tặng
  GIFT_POST_NOT_FOUND = 0x01_01,
  GIFT_POST_INVALID_LOCATION = 0x01_02,
  GIFT_POST_ALREADY_CLOSED = 0x01_03,
  GIFT_POST_OUT_OF_STOCK = 0x01_04,

  // 0x02 — Yêu cầu xin đồ (dành cho giai đoạn sau)
  GIFT_REQUEST_NOT_FOUND = 0x02_01,
  GIFT_REQUEST_DUPLICATED = 0x02_02,

  // 0x03 — Người dùng
  //
  // Cố ý đặt tên USER_* chứ không phải MEMBER_*: "Member" đã là tên một bậc
  // thứ hạng (F12), dùng lại cho tài khoản sẽ gây nhầm ở mọi chỗ đọc mã lỗi.
  USER_NOT_FOUND = 0x03_01,
  USER_SUSPENDED = 0x03_02,
  USER_BANNED = 0x03_03,
  USERNAME_TAKEN = 0x03_04,
  EMAIL_TAKEN = 0x03_05,
  PHONE_TAKEN = 0x03_06,
  INVALID_CREDENTIALS = 0x03_07,
  /** Chưa đủ Họ tên / Avatar / SĐT / Email để đăng bài (F07). */
  PROFILE_INCOMPLETE = 0x03_08,
  /** Còn giao dịch dở dang nên chưa xoá tài khoản được (F06). */
  USER_HAS_OPEN_TRANSACTIONS = 0x03_09,
  /**
   * Sai mật khẩu quá nhiều lần, tạm khoá đăng nhập (F02).
   *
   * Mã riêng chứ KHÔNG dùng lại INVALID_CREDENTIALS: client cần phân biệt "thử
   * lại đi" với "chờ đã rồi thử". Mã HTTP 429 và thông điệp vốn đã nói rõ đang
   * bị chặn nên dùng chung mã chẳng giấu được gì, chỉ phá tính duy nhất của
   * cặp (origin, code).
   */
  LOGIN_THROTTLED = 0x03_0a,

  // 0x04 — Phiên đăng nhập, OTP, đặt lại mật khẩu
  SESSION_NOT_FOUND = 0x04_01,
  REFRESH_TOKEN_INVALID = 0x04_02,
  REFRESH_TOKEN_EXPIRED = 0x04_03,
  OTP_INVALID = 0x04_04,
  OTP_EXPIRED = 0x04_05,
  /** Gửi OTP quá dày — chống dùng endpoint quên mật khẩu để spam tin nhắn. */
  OTP_TOO_SOON = 0x04_06,
}

export const ErrorOrigin = 'chantam/core';
