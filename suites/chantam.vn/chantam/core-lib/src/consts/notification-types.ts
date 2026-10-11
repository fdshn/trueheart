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
   * Bài của bạn đã có người nhận mà KHÔNG do bạn chọn.
   *
   * Thêm 29/09. Hai đường chốt người nhận không cần chủ bài bấm gì: job tự chọn khi
   * hết đồng hồ, và người xin dùng điểm đổi thẳng. Trước đó chỉ người NHẬN được
   * báo, nên chủ bài thấy bài mình đột nhiên RESERVED và một phòng chat mở ra, rồi
   * chỉ hiểu chuyện gì xảy ra khi người kia nhắn tin.
   *
   * Đường chủ bài tự duyệt KHÔNG dùng loại này — họ vừa bấm, báo lại là nhắc một
   * việc họ vừa làm.
   */
  GIFT_POST_RECEIVER_SELECTED = 'GIFT_POST_RECEIVER_SELECTED',
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
   * Người mình giới thiệu đã đủ điều kiện, và mình vừa được thưởng.
   *
   * Thêm 30/09. Trước đó đường giới thiệu hoàn toàn im lặng với NGƯỜI MỜI: họ mời
   * xong rồi không biết gì nữa — không biết người kia đã qua onboarding, cũng không
   * biết mình vừa được 56 điểm. Mà đó chính là lúc cần nói, vì nó là thứ khiến họ
   * mời tiếp.
   *
   * Gửi ở nhánh ĐÃ GHI SỔ, không phải lúc người kia đăng ký: điểm chỉ vào khi
   * referee hoàn tất onboarding, và báo sớm hơn là hứa một thứ chưa chắc có.
   */
  REFERRAL_QUALIFIED = 'REFERRAL_QUALIFIED',

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
  /**
   * Nhắc ngày Rằm / Mùng Một và ngày lễ Phật giáo (UC-LUNAR-01, BR-DHARMA-03).
   *
   * Cột `notifications.type` là `varchar(64)`, không phải enum Postgres, nên thêm giá trị
   * KHÔNG cần migration.
   */
  LUNAR_OBSERVANCE = 'LUNAR_OBSERVANCE',
  /**
   * Thông báo Admin gửi hàng loạt (F47, SRS mục 1507).
   *
   * Thuộc nhóm `SYSTEM` nên người dùng tắt được — SRS nói họ quản được *"các nhóm thông
   * báo không bắt buộc"*, và một tấm thông báo sự kiện cộng đồng đúng là không bắt buộc.
   */
  SYSTEM_BROADCAST = 'SYSTEM_BROADCAST',
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
 *
 * ## Tám nhóm, chốt 11/10
 *
 * Tới 10/10 đây là BỐN nhóm (`TRANSACTION`/`CHAT`/`FEED`/`SYSTEM`), gọn hơn tám
 * nhóm mà `BR-NOTI-01` của SRS đặt tên. Bên A chốt theo SRS: tám nhóm.
 *
 * Đánh đổi được ghi nhận, không phải bỏ qua: tám nhóm là tám dòng trong màn hình
 * cài đặt, nhiều hơn bốn. Nhưng nó KHÔNG phải "hai mươi công tắc" — mỗi loại vẫn
 * thuộc đúng một nhóm, và người đang bị làm phiền vẫn tắt được bằng một lần bấm.
 *
 * Một thứ THẬT SỰ mất đi: `CHAT` và `FEED` cũ cùng vào `CONTACT`, nên người dùng
 * không còn tắt riêng tin nhắn với bình luận được nữa. Phân loại của SRS không có
 * chỗ nào khác cho "có người bình luận vào bài của bạn" ngoài *Liên lạc*. Lượt di
 * trú vì thế chọn phía IM LẶNG: ai đã tắt một trong hai thì `CONTACT` bị tắt —
 * ping bất ngờ là thứ làm người ta tắt thông báo ở mức hệ điều hành, còn thiếu một
 * thông báo thì họ vẫn thấy trong hộp thư.
 */
export enum NotificationGroups {
  /**
   * Hướng dẫn dùng ứng dụng, onboarding.
   *
   * **KHÔNG có loại nào hôm nay**, và đó là trạng thái được khai báo chứ không
   * phải bỏ sót — xem `IntentionallyEmptyNotificationGroups`. Nhóm vẫn hiện trong
   * `GET /notifications/me/preferences` để người dùng đặt trước; SRS đặt tên nó
   * nên nó là một phần của không gian phân loại, không phải một ô rỗng tình cờ.
   */
  GUIDE = 'GUIDE',
  /** Tích điểm: điểm được cộng vào sổ. */
  POINT = 'POINT',
  /** Sự kiện: lịch âm, ngày lễ, thông báo toàn hệ thống. */
  EVENT = 'EVENT',
  /** Trạng thái: vòng đời yêu cầu xin nhận và lượt trao. */
  STATUS = 'STATUS',
  /** Thưởng: lên hạng và các mốc đạt được. */
  REWARD = 'REWARD',
  /** Cảnh báo: tụt hạng, kết luận báo xấu, hậu kiểm nội dung. */
  WARNING = 'WARNING',
  /** Liên lạc: tin nhắn, bình luận, cảm xúc — người khác đang tìm đến bạn. */
  CONTACT = 'CONTACT',
  /** Điều kiện: nhắc việc phải làm trước một cái hạn. */
  CONDITION = 'CONDITION',
}

/**
 * Nhóm đã khai mà CHƯA có loại nào — khai tường minh, không để ai đoán.
 *
 * Một nhóm rỗng là một công tắc chưa điều khiển gì, và repo này coi "cái núm
 * không làm gì" là lỗi. Nên nó phải được khai ở đây kèm lý do, và
 * `notification-template.spec.ts` canh rằng MỌI nhóm khác đều có ít nhất một
 * loại. Thêm một nhóm rỗng mà không khai vào đây là phép kiểm đỏ.
 *
 * `GUIDE` rỗng vì chưa có loại thông báo hướng dẫn/onboarding nào được dựng.
 * `BR-NOTI-01` của SRS đặt tên nhóm này, nên nó tồn tại để nhận những loại đó
 * khi chúng ra đời — không phải để làm tròn con số tám.
 */
export const IntentionallyEmptyNotificationGroups: readonly NotificationGroups[] =
  [NotificationGroups.GUIDE];

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
  // ── Liên lạc: có người đang tìm đến bạn ──────────────────────────────────
  [NotificationTypes.NEW_CHAT_MESSAGE]: NotificationGroups.CONTACT,
  // Hạn xoá phòng chat xếp vào LIÊN LẠC chứ không TRẠNG THÁI, và đây là một
  // quyết định có hệ quả di trú: người từng tắt nhóm `CHAT` cũ đã tắt đúng hai
  // loại này. Xếp nó sang TRẠNG THÁI thì lượt di trú phải tắt luôn nhóm đó cho
  // họ — tức tắt cả `GIFT_REQUEST_ACCEPTED`, đúng thứ docblock trên nói là mất
  // mát thật.
  [NotificationTypes.CHAT_ROOM_SCHEDULED_FOR_PURGE]: NotificationGroups.CONTACT,
  [NotificationTypes.CONTENT_COMMENT_CREATED]: NotificationGroups.CONTACT,
  [NotificationTypes.CONTENT_COMMENT_REPLIED]: NotificationGroups.CONTACT,
  [NotificationTypes.CONTENT_REACTION_FIRST_OF_DAY]: NotificationGroups.CONTACT,

  // ── Trạng thái: vòng đời yêu cầu và lượt trao ────────────────────────────
  [NotificationTypes.GIFT_REQUEST_CREATED]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_REQUEST_ACCEPTED]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_REQUEST_REJECTED]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_REQUEST_CLOSED]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_POST_RECEIVER_SELECTED]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_TRANSACTION_HANDED_OVER]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_TRANSACTION_CLOSED]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_TRANSACTION_COMPLETED]: NotificationGroups.STATUS,
  [NotificationTypes.GIFT_TRANSACTION_REOPENED]: NotificationGroups.STATUS,

  // ── Tích điểm: điểm vào sổ ───────────────────────────────────────────────
  // Giới thiệu hợp lệ xếp vào TÍCH ĐIỂM chứ không THƯỞNG: nội dung thông báo là
  // "bạn vừa được cộng điểm", còn THƯỞNG dành cho mốc đạt được.
  [NotificationTypes.REFERRAL_QUALIFIED]: NotificationGroups.POINT,

  // ── Thưởng: mốc đạt được ─────────────────────────────────────────────────
  [NotificationTypes.RANK_PROMOTED]: NotificationGroups.REWARD,

  // ── Cảnh báo: thứ người dùng cần biết vì nó bất lợi cho họ ───────────────
  [NotificationTypes.RANK_DEMOTION_WARNING]: NotificationGroups.WARNING,
  [NotificationTypes.RANK_DEMOTED]: NotificationGroups.WARNING,
  [NotificationTypes.REPORT_REVIEWED]: NotificationGroups.WARNING,
  [NotificationTypes.CONTENT_MODERATED]: NotificationGroups.WARNING,

  // ── Điều kiện: có việc phải làm trước một cái hạn ────────────────────────
  [NotificationTypes.RANK_MAINTENANCE_REMINDER]: NotificationGroups.CONDITION,
  [NotificationTypes.REVIEW_REMINDER]: NotificationGroups.CONDITION,
  [NotificationTypes.POST_EXPIRING_SOON]: NotificationGroups.CONDITION,

  // ── Sự kiện ──────────────────────────────────────────────────────────────
  [NotificationTypes.LUNAR_OBSERVANCE]: NotificationGroups.EVENT,
  [NotificationTypes.SYSTEM_BROADCAST]: NotificationGroups.EVENT,
};
