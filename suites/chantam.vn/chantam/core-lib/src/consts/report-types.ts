export enum ReportTargetTypes {
  POST = 'POST',
  USER = 'USER',
  /** Bình luận trên bảng tin — chung hàng đợi Admin với bài và người dùng. */
  COMMENT = 'COMMENT',
  /**
   * Một tin nhắn cụ thể trong phòng chat.
   *
   * Trước 28/09 người bị quấy rối chỉ báo được cả CON NGƯỜI, và Admin mở hàng
   * đợi ra thì không có gì để xem — họ không phải thành viên phòng. Báo xấu trỏ
   * đúng vào dòng cần đọc mới mở được đường điều tra.
   */
  CHAT_MESSAGE = 'CHAT_MESSAGE',
}

export enum ReportReasons {
  SCAM = 'SCAM',
  PROHIBITED_ITEM = 'PROHIBITED_ITEM',
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  HARASSMENT = 'HARASSMENT',
  MISLEADING = 'MISLEADING',
  OTHER = 'OTHER',
}

export enum ReportStatuses {
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

/**
 * Thưởng cho người báo xấu, CHỈ khi Admin đã xác minh là đúng (F41).
 *
 * Không thưởng lúc gửi: thưởng ngay là trả tiền cho việc bấm nút, và hàng đợi
 * Admin sẽ ngập báo xấu vu vơ trong một tuần.
 *
 * Seed TẮT sẵn như hai rule tương tác còn lại, và `affects_lifetime = false`
 * để việc báo xấu không đẩy được thứ hạng.
 */
export const ReportUpheldRuleCode = 'REPORT_UPHELD';

/**
 * Phạt chủ bài khi Admin xác nhận một report nhắm vào bài đăng là đúng.
 *
 * Khoản phạt đi qua point rule để Admin đổi mức mà không cần deploy và không
 * làm giảm lifetime — vi phạm là một sự kiện mới, không xoá đóng góp cũ.
 */
export const ContentViolationPenaltyRuleCode = 'CONTENT_VIOLATION_PENALTY';
