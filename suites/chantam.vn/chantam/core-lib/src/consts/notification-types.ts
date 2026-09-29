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
   * Đã LÊN hạng.
   *
   * Thêm 29/09. Trước đó lên hạng hoàn toàn im lặng ở mọi đường, trong khi tụt
   * hạng thì có hai loại thông báo. Lệch đó không cố ý: chính lúc vừa lên hạng là
   * lúc người dùng có thêm quyền — quota bài nhiều hơn, mở SOS ở Bạc, mở tạo Group
   * ở Kim Cương — mà không ai nói thì họ không biết mình đang có gì để dùng.
   */
  RANK_PROMOTED = 'RANK_PROMOTED',

  /**
   * Nhắc người nhận đánh giá lượt trao đã hoàn tất.
   *
   * Không nhắc thì phần lớn không đánh giá, và nhánh "áp mức mặc định sau 7
   * ngày" thành đường chạy chính chứ không phải ngoại lệ — tức chỉ số Giver
   * Accuracy chỉ còn mẫu của người chịu khó chấm.
   */
  REVIEW_REMINDER = 'REVIEW_REMINDER',
  /**
   * Bài sắp hết hạn, còn kịp gia hạn.
   *
   * `POST /posts/:postId/renew` đã có sẵn và cho thêm ba tháng, nhưng trước
   * 29/09 không ai được nhắc để bấm — bài cứ thế hết hạn trong im lặng.
   */
  POST_EXPIRING_SOON = 'POST_EXPIRING_SOON',
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

/**
 * Nhóm thông báo để người dùng tắt/bật.
 *
 * **Nhóm chứ không phải từng loại.** Mười chín công tắc là một màn hình không ai
 * đọc, và người đang bị làm phiền cần tắt nhanh chứ không cần chính xác. Bốn
 * nhóm thì đọc một lượt là hiểu.
 *
 * Vì sao phải có: hiện là tất-cả-hoặc-không, nên người bị làm phiền sẽ tắt
 * thông báo ở mức HỆ ĐIỀU HÀNH — và mất luôn `GIFT_REQUEST_ACCEPTED`, thứ thật
 * sự quan trọng. Đây đúng là lý lẽ đã dùng để thiết kế luật "cảm xúc chỉ báo
 * lần đầu trong ngày".
 */
export enum NotificationGroups {
  /** Yêu cầu xin nhận và vòng đời lượt trao. */
  TRANSACTION = 'TRANSACTION',
  /** Tin nhắn và vòng đời phòng chat. */
  CHAT = 'CHAT',
  /** Bình luận, trả lời, cảm xúc trên nội dung của mình. */
  FEED = 'FEED',
  /** Hạng, nhắc lịch, kết luận báo xấu, hậu kiểm nội dung. */
  SYSTEM = 'SYSTEM',
}

/**
 * Mỗi loại thuộc đúng một nhóm.
 *
 * Khai đủ MỌI loại thay vì có nhánh mặc định: thêm một loại mới mà quên xếp
 * nhóm thì TypeScript báo ngay, thay vì nó lặng lẽ rơi vào nhóm nào đó và không
 * ai tắt được.
 */
export const NotificationGroupOf: Record<
  NotificationTypes,
  NotificationGroups
> = {
  [NotificationTypes.NEW_CHAT_MESSAGE]: NotificationGroups.CHAT,
  [NotificationTypes.CHAT_ROOM_SCHEDULED_FOR_PURGE]: NotificationGroups.CHAT,

  [NotificationTypes.GIFT_REQUEST_CREATED]: NotificationGroups.TRANSACTION,
  [NotificationTypes.GIFT_REQUEST_ACCEPTED]: NotificationGroups.TRANSACTION,
  [NotificationTypes.GIFT_REQUEST_REJECTED]: NotificationGroups.TRANSACTION,
  [NotificationTypes.GIFT_REQUEST_CLOSED]: NotificationGroups.TRANSACTION,
  [NotificationTypes.GIFT_TRANSACTION_HANDED_OVER]:
    NotificationGroups.TRANSACTION,
  [NotificationTypes.GIFT_TRANSACTION_CLOSED]: NotificationGroups.TRANSACTION,
  [NotificationTypes.GIFT_TRANSACTION_COMPLETED]:
    NotificationGroups.TRANSACTION,
  [NotificationTypes.GIFT_TRANSACTION_REOPENED]: NotificationGroups.TRANSACTION,

  [NotificationTypes.CONTENT_COMMENT_CREATED]: NotificationGroups.FEED,
  [NotificationTypes.CONTENT_COMMENT_REPLIED]: NotificationGroups.FEED,
  [NotificationTypes.CONTENT_REACTION_FIRST_OF_DAY]: NotificationGroups.FEED,

  [NotificationTypes.RANK_DEMOTION_WARNING]: NotificationGroups.SYSTEM,
  [NotificationTypes.RANK_DEMOTED]: NotificationGroups.SYSTEM,
  [NotificationTypes.RANK_PROMOTED]: NotificationGroups.SYSTEM,
  [NotificationTypes.RANK_MAINTENANCE_REMINDER]: NotificationGroups.SYSTEM,
  [NotificationTypes.REVIEW_REMINDER]: NotificationGroups.SYSTEM,
  [NotificationTypes.POST_EXPIRING_SOON]: NotificationGroups.SYSTEM,
  [NotificationTypes.REPORT_REVIEWED]: NotificationGroups.SYSTEM,
  [NotificationTypes.CONTENT_MODERATED]: NotificationGroups.SYSTEM,
};
