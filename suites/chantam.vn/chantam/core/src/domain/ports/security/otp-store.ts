/**
 * Kho mã xác minh dùng một lần.
 *
 * Chỉ lưu **bản băm** của mã, không lưu mã gốc: ai đọc được Redis cũng không
 * đặt lại được mật khẩu của người khác.
 */
export interface IOtpStore {
  /**
   * Sinh mã mới cho một chủ thể.
   *
   * Ném `OtpTooSoonException` nếu mã trước đó vẫn còn hiệu lực và chưa hết thời
   * gian chờ — chống dùng endpoint quên mật khẩu để spam tin nhắn tới nạn nhân.
   */
  issue(purpose: string, subject: string): Promise<IOtpIssueResult>;

  /**
   * Kiểm mã. Đúng thì **xoá luôn** — mỗi mã chỉ dùng được một lần.
   *
   * Sai quá số lần cho phép thì mã bị huỷ, buộc phải yêu cầu mã mới. Không có
   * giới hạn này thì mã 6 chữ số bị dò hết trong vài giây.
   */
  verify(purpose: string, subject: string, code: string): Promise<boolean>;
}

export interface IOtpIssueResult {
  /** Mã gốc — CHỈ để gửi đi, không bao giờ ghi log và không bao giờ trả ra API. */
  code: string;
  expiresInSeconds: number;
}

export const IOtpStore = Symbol('IOtpStore');
