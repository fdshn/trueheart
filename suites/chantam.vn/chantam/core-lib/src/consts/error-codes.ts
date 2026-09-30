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

  // 0x02 — Yêu cầu xin đồ (FSM Module 5)
  GIFT_REQUEST_NOT_FOUND = 0x02_01,
  GIFT_REQUEST_DUPLICATED = 0x02_02,
  CANNOT_REQUEST_OWN_POST = 0x02_03,
  POST_NOT_ACCEPTING_REQUESTS = 0x02_04,
  /**
   * Người này đang giữ quá nhiều yêu cầu chưa ngã ngũ.
   *
   * Từ khi mỗi yêu cầu đầu tiên mở một đồng hồ 7 ngày, xin bừa hàng loạt là khoá
   * hàng loạt bài — kể cả khi người xin không bao giờ quay lại.
   */
  OPEN_REQUEST_QUOTA_EXCEEDED = 0x02_05,
  /** Bài không ở trạng thái cho đổi bằng điểm — hết đồng hồ, hoặc đã có chủ. */
  REDEMPTION_NOT_AVAILABLE = 0x02_06,
  /** Bài không khai giá trị tham khảo, nên không quy ra điểm được. */
  REDEMPTION_PRICE_UNAVAILABLE = 0x02_07,
  /** Điểm đang có không đủ để đổi. */
  REDEMPTION_INSUFFICIENT_POINTS = 0x02_08,

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
  /** Chưa hoàn tất các nhiệm vụ onboarding bắt buộc. */
  ONBOARDING_INCOMPLETE = 0x03_0b,

  /**
   * Số này đã từng được xác minh cho một tài khoản khác.
   *
   * KHÁC `PHONE_TAKEN`: cái kia nói "đang có tài khoản khác giữ số này", cái
   * này nói "đã từng có" — kể cả tài khoản đó nay đã xoá. Phân biệt vì cách xử
   * lý khác nhau: cái kia đổi số là xong, cái này phải nhờ Admin giải phóng.
   */
  PHONE_ALREADY_VERIFIED = 0x03_0c,

  /** Số chưa từng được xác minh, nên không có gì để giải phóng. */
  VERIFIED_PHONE_NOT_FOUND = 0x03_0d,
  /**
   * Số đang do một tài khoản CÒN SỐNG giữ và vẫn đang xác minh.
   *
   * Giải phóng lúc này là để hai tài khoản cùng mang dấu "đã xác minh" cho một
   * SIM — đúng thứ cả cơ chế này dựng ra để chặn.
   */
  VERIFIED_PHONE_IN_USE = 0x03_0e,

  // 0x05 — Danh mục
  CATEGORY_NOT_FOUND = 0x05_01,
  CATEGORY_SLUG_TAKEN = 0x05_02,
  CATEGORY_PARENT_CYCLE = 0x05_03,
  CATEGORY_IN_USE = 0x05_04,
  CATEGORY_DEPTH_EXCEEDED = 0x05_05,
  CATEGORY_POST_TYPE_NOT_ALLOWED = 0x05_06,
  CATEGORY_MERGE_INVALID = 0x05_07,
  CATEGORY_MERGED_CANNOT_REOPEN = 0x05_08,

  // 0x06 — Canonical bài đăng M2
  POST_NOT_FOUND = 0x06_01,
  POST_QUOTA_EXCEEDED = 0x06_02,
  POST_INVALID_STATE = 0x06_03,
  POST_MEDIA_LIMIT_EXCEEDED = 0x06_04,
  POST_MEDIA_ORDER_INVALID = 0x06_05,
  POST_NOT_RENEWABLE = 0x06_06,
  POST_RENEWAL_LIMIT_REACHED = 0x06_07,
  POST_SOS_NOT_ALLOWED = 0x06_08,
  POST_CHARITY_TRANSFER_INVALID_STATE = 0x06_09,
  DISCOVERY_ORIGIN_UNAVAILABLE = 0x06_0a,
  /** selectionMode không phải INSTANT/OPTIMAL/EXTENDED hoặc áp dụng sai loại bài. */
  POST_SELECTION_MODE_INVALID = 0x06_0b,
  // 0x06_0c và 0x06_0d đã nghỉ: thích/bỏ thích nay là thao tác bình thái trên
  // `content_reactions`, không còn trạng thái nào để mà xung đột.
  /** Thông tin liên lạc chỉ tiết lộ cho receiver đã được chọn. */
  POST_CONTACT_INFO_RESTRICTED = 0x06_0e,
  /**
   * Bài đang có lượt trao sống — không sửa, không xoá.
   *
   * Khác `POST_INVALID_STATE` ở chỗ nói rõ VÌ SAO: người dùng cần biết mình
   * phải đóng lượt trao trước, chứ không phải "trạng thái không cho phép".
   */
  POST_HAS_LIVE_TRANSACTION = 0x06_0f,

  // 0x07 — Point / Rank / Referral M4
  POINT_RULE_UNAVAILABLE = 0x07_01,
  RANK_TIER_UNAVAILABLE = 0x07_02,
  POINT_DAILY_CAP_REACHED = 0x07_03,
  /** Bút toán không tồn tại, đã hoàn rồi, hoặc chính nó là bút toán hoàn. */
  POINT_ENTRY_NOT_REVERSIBLE = 0x07_04,

  // 0x08 — Giao dịch tặng/nhận M3
  GIFT_TRANSACTION_NOT_FOUND = 0x08_01,
  GIFT_TRANSACTION_INVALID_STATE = 0x08_02,
  GIFT_TRANSACTION_NOT_PARTICIPANT = 0x08_03,
  GIFT_TRANSACTION_OUT_OF_STOCK = 0x08_04,
  GIFT_TRANSACTION_DUPLICATE_REQUEST = 0x08_05,
  SHIP_PAYER_NOT_RECEIVER = 0x08_06,
  GIFT_HANDOVER_EVIDENCE_REQUIRED = 0x08_07,
  /** Lượt trao chưa hoàn tất thì chưa đánh giá được (F42). */
  REVIEW_TRANSACTION_NOT_COMPLETED = 0x08_08,
  /** Mỗi người đánh giá một lượt trao đúng một lần. */
  REVIEW_ALREADY_SUBMITTED = 0x08_09,

  // 0x0E — Tuong tac bang tin
  CONTENT_BLOCKED_TERMS = 0x0e_01,
  CONTENT_COMMENT_NOT_FOUND = 0x0e_02,
  CONTENT_EDIT_WINDOW_CLOSED = 0x0e_03,

  // 0x09 — Quản trị RBAC
  ADMIN_LAST_SUPER_ADMIN = 0x09_01,
  ADMIN_SELF_ROLE_CHANGE = 0x09_02,
  /** Không có mẫu thông báo cho loại này. */
  NOTIFICATION_TEMPLATE_NOT_FOUND = 0x09_03,

  // 0x0A — Chính sách quyền/quota theo rank
  ENTITLEMENT_POLICY_UNAVAILABLE = 0x0a_01,
  ENTITLEMENT_CAPABILITY_UNKNOWN = 0x0a_02,

  // Chat & thông báo
  CHAT_ROOM_NOT_FOUND = 0x0b_01,
  CHAT_ROOM_READ_ONLY = 0x0b_02,
  NOTIFICATION_NOT_FOUND = 0x0b_03,
  CHAT_MESSAGE_NOT_FOUND = 0x0b_04,
  CHAT_RECALL_WINDOW_CLOSED = 0x0b_05,

  // 0x0F — Báo cáo vi phạm
  REPORT_NOT_FOUND = 0x0f_01,
  REPORT_DUPLICATED = 0x0f_02,
  REPORT_INVALID_STATE = 0x0f_03,

  // 0x04 — Phiên đăng nhập, OTP, đặt lại mật khẩu
  SESSION_NOT_FOUND = 0x04_01,
  REFRESH_TOKEN_INVALID = 0x04_02,
  REFRESH_TOKEN_EXPIRED = 0x04_03,
  OTP_INVALID = 0x04_04,
  OTP_EXPIRED = 0x04_05,
  /** Gửi OTP quá dày — chống dùng endpoint quên mật khẩu để spam tin nhắn. */
  OTP_TOO_SOON = 0x04_06,
  /**
   * Gọi quá dày từ một địa chỉ IP.
   *
   * Khác `LOGIN_THROTTLED` ở chỗ đếm theo NGUỒN GỌI chứ không theo tài khoản:
   * rải một mật khẩu phổ biến qua mười nghìn username thì mỗi tài khoản chỉ sai
   * một lần, không tài khoản nào chạm trần của riêng nó.
   */
  TOO_MANY_REQUESTS = 0x04_07,

  // 0x10 — Group, Sub-team và Affiliate (M5)
  /** Chưa đặt Vị trí mặc định — tâm nhóm chụp từ đó (BR-GRP-03). */
  GROUP_DEFAULT_LOCATION_REQUIRED = 0x10_01,
  /** Mỗi người sở hữu tối đa một nhóm, và thuộc tối đa một nhóm (BR-GRP-01). */
  GROUP_ALREADY_MEMBER = 0x10_02,
  /** Rank chưa đủ để tạo nhóm. */
  GROUP_CREATE_NOT_ALLOWED = 0x10_03,
  /** Mã mời sai, hoặc nhóm đã giải tán. Cố ý KHÔNG phân biệt hai ca. */
  GROUP_INVITE_INVALID = 0x10_04,
  GROUP_NOT_FOUND = 0x10_05,
}

export const ErrorOrigin = 'chantam/core';
