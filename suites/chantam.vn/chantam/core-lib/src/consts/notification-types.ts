/**
 * Loại thông báo trong app (F44).
 *
 * Là chuỗi chứ không phải số: giá trị này đi vào payload đẩy xuống thiết bị và
 * lộ ra API, nên đọc được mà không cần tra bảng.
 */
export enum NotificationTypes {
  /** Có tin nhắn mới trong phòng chat của một giao dịch. */
  NEW_CHAT_MESSAGE = 'NEW_CHAT_MESSAGE',
  /**
   * Có người vừa xin nhận đồ của bạn.
   *
   * Thông báo quan trọng nhất của cả luồng, và là thông báo duy nhất từng
   * thiếu: đồng hồ 7 ngày giả định chủ bài BIẾT có ứng viên để mà chốt sớm.
   * Không báo thì họ chỉ biết nếu tự mở bài ra xem.
   */
  GIFT_REQUEST_CREATED = 'GIFT_REQUEST_CREATED',
  /** Yêu cầu xin nhận được duyệt — chat vừa mở. */
  GIFT_REQUEST_ACCEPTED = 'GIFT_REQUEST_ACCEPTED',
  /** Chủ bài chủ động từ chối một yêu cầu. */
  GIFT_REQUEST_REJECTED = 'GIFT_REQUEST_REJECTED',
  /**
   * Yêu cầu bị đóng vì BÀI đóng lại — hết hạn, bị gỡ, hoặc Admin hậu kiểm.
   *
   * Tách khỏi `GIFT_REQUEST_REJECTED` vì lý do khác hẳn: không ai từ chối họ
   * cả, món đồ chỉ là không còn nữa.
   */
  GIFT_REQUEST_CLOSED = 'GIFT_REQUEST_CLOSED',
  /**
   * Người tặng vừa báo đã bàn giao.
   *
   * Đây cũng là lúc đồng hồ tự hoàn tất 5 ngày được đặt lại
   * (`COALESCE(handed_over_at, accepted_at)`), nên người nhận cần biết để còn
   * kịp xác nhận hoặc khiếu nại trước khi hệ thống tự khép.
   */
  GIFT_TRANSACTION_HANDED_OVER = 'GIFT_TRANSACTION_HANDED_OVER',
  /** Giao dịch bị huỷ hoặc từ chối. */
  GIFT_TRANSACTION_CLOSED = 'GIFT_TRANSACTION_CLOSED',
  /** Admin mở lại một lượt trao đã đóng nhầm. */
  GIFT_TRANSACTION_REOPENED = 'GIFT_TRANSACTION_REOPENED',
  /** Người nhận đã xác nhận nhận được vật phẩm. */
  GIFT_TRANSACTION_COMPLETED = 'GIFT_TRANSACTION_COMPLETED',
  /**
   * Phòng chat vừa khoá và sẽ bị xoá vào một ngày cụ thể.
   *
   * Báo một lần lúc khoá, kèm ngày ĐÃ CHỐT — không phải "sau 1 tuần" chung
   * chung, vì Admin đổi cấu hình sau đó cũng không đổi ngày của phòng này.
   */
  CHAT_ROOM_SCHEDULED_FOR_PURGE = 'CHAT_ROOM_SCHEDULED_FOR_PURGE',
  /** Có người bình luận vào bài của mình. Báo từng cái. */
  CONTENT_COMMENT_CREATED = 'CONTENT_COMMENT_CREATED',
  /** Có người trả lời bình luận của mình. Báo từng cái. */
  CONTENT_COMMENT_REPLIED = 'CONTENT_COMMENT_REPLIED',
  /**
   * Hôm nay có người bày tỏ cảm xúc với bài của mình.
   *
   * Chỉ báo LẦN ĐẦU trong ngày cho mỗi bài. Một bài 200 lượt mà báo 200 lần
   * thì tác giả tắt thông báo, và từ đó mất luôn thông báo về lượt xin nhận —
   * thứ thật sự quan trọng.
   */
  CONTENT_REACTION_FIRST_OF_DAY = 'CONTENT_REACTION_FIRST_OF_DAY',

  /**
   * Điểm đang có đã xuống dưới mốc cảnh báo của bậc hiện tại.
   *
   * Bắt buộc phải có từ khi hạng do balance quyết (chốt 2026-09-24): không báo
   * thì người dùng đổi một vật phẩm rồi sáng hôm sau phát hiện mình đã xuống
   * Bạc mà không ai nói trước.
   */
  RANK_DEMOTION_WARNING = 'RANK_DEMOTION_WARNING',
  /** Đã tụt hạng. */
  RANK_DEMOTED = 'RANK_DEMOTED',

  /**
   * Nhắc người nhận đánh giá lượt trao đã hoàn tất.
   *
   * Không nhắc thì phần lớn không đánh giá, và nhánh "áp mức mặc định sau 7
   * ngày" thành đường chạy chính chứ không phải ngoại lệ — tức chỉ số Giver
   * Accuracy chỉ còn mẫu của người chịu khó chấm.
   */
  REVIEW_REMINDER = 'REVIEW_REMINDER',
  /**
   * Nhắc nhiệm vụ duy trì hạng, trước khi chu kỳ hết (SRS BR-PROF-RANK-03).
   *
   * Trượt chu kỳ nay bị trừ điểm và có thể tụt hạng, nên báo muộn hơn thời điểm
   * còn kịp làm là báo vô nghĩa.
   */
  RANK_MAINTENANCE_REMINDER = 'RANK_MAINTENANCE_REMINDER',
  /** Báo xấu của bạn đã được Admin xử lý. */
  REPORT_REVIEWED = 'REPORT_REVIEWED',
  /** Nội dung của bạn bị Admin xử lý sau khi có báo xấu. */
  CONTENT_MODERATED = 'CONTENT_MODERATED',
}
