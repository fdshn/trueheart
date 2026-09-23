import { defineErrorCatalog } from '@chantam/service.common-lib/exception';
import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from './error-codes';

/**
 * Toàn bộ lỗi nghiệp vụ Chân Tâm: mã, mã HTTP và thông điệp, ở đúng một chỗ.
 *
 * Sửa câu chữ trả về cho người dùng thì sửa ở đây, không đi lục constructor.
 * Thêm lỗi mới thì khai ở đây rồi mới dựng class exception — `defineErrorCatalog`
 * sẽ chặn ngay lúc khởi động nếu lỡ trùng mã với lỗi khác.
 *
 * Mục nào chưa có class exception là đã khai trước cho các milestone sau.
 */
export const CoreErrors = defineErrorCatalog(ErrorOrigin, {
  // ── 0x01 Bài đăng cho tặng ────────────────────────────────────────────────
  GIFT_POST_NOT_FOUND: {
    code: ErrorCodes.GIFT_POST_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: (giftPostId: string) => `Không tìm thấy bài đăng ${giftPostId}`,
    sample: ['4182a141-a5c5-5c25-92ab-0d4488158e8f'],
  },

  GIFT_POST_INVALID_LOCATION: {
    code: ErrorCodes.GIFT_POST_INVALID_LOCATION,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () => 'Toạ độ bài đăng không hợp lệ',
  },

  GIFT_POST_ALREADY_CLOSED: {
    code: ErrorCodes.GIFT_POST_ALREADY_CLOSED,
    httpStatus: HttpStatus.CONFLICT,
    message: (giftPostId: string, status: string) =>
      `Bài đăng ${giftPostId} đang ở trạng thái ${status}, không thể chỉnh sửa`,
    sample: ['4182a141-a5c5-5c25-92ab-0d4488158e8f', 'COMPLETED'],
  },

  GIFT_POST_OUT_OF_STOCK: {
    code: ErrorCodes.GIFT_POST_OUT_OF_STOCK,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bài đăng đã hết số lượng',
  },

  // ── 0x02 Yêu cầu xin đồ (M3) ──────────────────────────────────────────────
  GIFT_REQUEST_NOT_FOUND: {
    code: ErrorCodes.GIFT_REQUEST_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: (giftRequestId: string) =>
      `Không tìm thấy yêu cầu ${giftRequestId}`,
    sample: ['7c3e0b18-2f44-4a91-9d2e-55b0a1f6c8d3'],
  },

  GIFT_REQUEST_DUPLICATED: {
    code: ErrorCodes.GIFT_REQUEST_DUPLICATED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn đã gửi yêu cầu cho bài đăng này rồi',
  },

  CANNOT_REQUEST_OWN_POST: {
    code: ErrorCodes.CANNOT_REQUEST_OWN_POST,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () =>
      'Bạn không thể tự gửi yêu cầu xin đồ cho bài đăng của chính mình',
  },

  POST_NOT_ACCEPTING_REQUESTS: {
    code: ErrorCodes.POST_NOT_ACCEPTING_REQUESTS,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () => 'Bài đăng hiện không ở trạng thái mở nhận yêu cầu',
  },

  // ── 0x03 Người dùng ───────────────────────────────────────────────────────
  USER_NOT_FOUND: {
    code: ErrorCodes.USER_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy tài khoản',
  },

  USER_SUSPENDED: {
    code: ErrorCodes.USER_SUSPENDED,
    httpStatus: HttpStatus.FORBIDDEN,
    message: (until: Date | null) =>
      until
        ? `Tài khoản đang bị tạm khoá tới ${until.toISOString()}`
        : 'Tài khoản đang bị tạm khoá',
    sample: [new Date('2026-10-01T00:00:00.000Z')],
  },

  USER_BANNED: {
    code: ErrorCodes.USER_BANNED,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Tài khoản đã bị khoá vĩnh viễn',
  },

  USERNAME_TAKEN: {
    code: ErrorCodes.USERNAME_TAKEN,
    httpStatus: HttpStatus.CONFLICT,
    message: (username: string) =>
      `Tên đăng nhập "${username}" đã có người dùng`,
    sample: ['nguoidung01'],
  },

  EMAIL_TAKEN: {
    code: ErrorCodes.EMAIL_TAKEN,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Email này đã được dùng cho tài khoản khác',
  },

  PHONE_TAKEN: {
    code: ErrorCodes.PHONE_TAKEN,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Số điện thoại này đã được dùng cho tài khoản khác',
  },

  INVALID_CREDENTIALS: {
    code: ErrorCodes.INVALID_CREDENTIALS,
    httpStatus: HttpStatus.UNAUTHORIZED,
    // Dùng chung cho cả "không có tài khoản này" lẫn "sai mật khẩu". Tách hai
    // trường hợp ra sẽ biến đăng nhập thành công cụ dò xem username hay email
    // nào đang tồn tại.
    message: () => 'Tên đăng nhập hoặc mật khẩu không đúng',
  },

  PROFILE_INCOMPLETE: {
    code: ErrorCodes.PROFILE_INCOMPLETE,
    httpStatus: HttpStatus.FORBIDDEN,
    message: (missing: string[]) =>
      `Cần bổ sung ${missing.join(', ')} trước khi đăng bài`,
    sample: [['Avatar', 'Số điện thoại']],
  },

  USER_HAS_OPEN_TRANSACTIONS: {
    code: ErrorCodes.USER_HAS_OPEN_TRANSACTIONS,
    httpStatus: HttpStatus.CONFLICT,
    message: (count: number) =>
      `Còn ${count} giao dịch chưa hoàn tất, chưa thể xoá tài khoản`,
    sample: [2],
  },

  LOGIN_THROTTLED: {
    code: ErrorCodes.LOGIN_THROTTLED,
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    message: (retryAfterSeconds: number) =>
      `Sai quá nhiều lần. Thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút`,
    sample: [900],
  },

  ONBOARDING_INCOMPLETE: {
    code: ErrorCodes.ONBOARDING_INCOMPLETE,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Cần hoàn tất onboarding trước khi đăng bài',
  },

  // ── 0x05 Danh mục ─────────────────────────────────────────────────────────
  CATEGORY_NOT_FOUND: {
    code: ErrorCodes.CATEGORY_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy danh mục',
  },

  CATEGORY_SLUG_TAKEN: {
    code: ErrorCodes.CATEGORY_SLUG_TAKEN,
    httpStatus: HttpStatus.CONFLICT,
    message: (slug: string) => `Slug danh mục "${slug}" đã tồn tại`,
    sample: ['sach'],
  },

  // ── 0x06 Canonical bài đăng M2 ─────────────────────────────────────────────
  POST_NOT_FOUND: {
    code: ErrorCodes.POST_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: (postId: string) => `Không tìm thấy bài đăng ${postId}`,
    sample: ['4182a141-a5c5-5c25-92ab-0d4488158e8f'],
  },

  POST_QUOTA_EXCEEDED: {
    code: ErrorCodes.POST_QUOTA_EXCEEDED,
    httpStatus: HttpStatus.CONFLICT,
    message: (quota: number) =>
      `Bạn đã đạt giới hạn ${quota} bài đăng đang hoạt động`,
    sample: [3],
  },

  POST_INVALID_STATE: {
    code: ErrorCodes.POST_INVALID_STATE,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Trạng thái bài đăng không cho phép thao tác này',
  },

  POST_MEDIA_LIMIT_EXCEEDED: {
    code: ErrorCodes.POST_MEDIA_LIMIT_EXCEEDED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Một bài đăng chỉ được có tối đa 10 ảnh',
  },

  POST_NOT_RENEWABLE: {
    code: ErrorCodes.POST_NOT_RENEWABLE,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Bài đăng này không gia hạn được: chỉ bài đang hiển thị hoặc đã hết hạn và vẫn còn vật phẩm mới được gia hạn',
  },

  POST_RENEWAL_LIMIT_REACHED: {
    code: ErrorCodes.POST_RENEWAL_LIMIT_REACHED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Mỗi bài đăng chỉ được gia hạn một lần',
  },

  CHAT_ROOM_NOT_FOUND: {
    code: ErrorCodes.CHAT_ROOM_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy phòng chat',
  },

  CHAT_ROOM_READ_ONLY: {
    code: ErrorCodes.CHAT_ROOM_READ_ONLY,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Giao dịch đã kết thúc nên phòng chat chỉ còn đọc được, không gửi thêm tin nhắn',
  },

  NOTIFICATION_NOT_FOUND: {
    code: ErrorCodes.NOTIFICATION_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy thông báo',
  },

  DISCOVERY_ORIGIN_UNAVAILABLE: {
    code: ErrorCodes.DISCOVERY_ORIGIN_UNAVAILABLE,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () =>
      'Không xác định được vị trí để quét: hãy gửi toạ độ, hoặc đặt Vị trí mặc định trong hồ sơ',
  },

  POST_SOS_NOT_ALLOWED: {
    code: ErrorCodes.POST_SOS_NOT_ALLOWED,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Thứ hạng hiện tại của bạn chưa được dùng bài Cần gấp (SOS)',
  },

  POST_CHARITY_TRANSFER_INVALID_STATE: {
    code: ErrorCodes.POST_CHARITY_TRANSFER_INVALID_STATE,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Bài đăng này không gửi được yêu cầu chuyển về điểm từ thiện: chỉ bài đang hiển thị hoặc đã hết hạn, còn vật phẩm và chưa có yêu cầu nào đang chờ duyệt',
  },

  POST_MEDIA_ORDER_INVALID: {
    code: ErrorCodes.POST_MEDIA_ORDER_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () => 'Danh sách thứ tự ảnh bài đăng không hợp lệ',
  },

  POST_SELECTION_MODE_INVALID: {
    code: ErrorCodes.POST_SELECTION_MODE_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () => 'Chế độ chọn người nhận không hợp lệ',
  },

  POST_ALREADY_LIKED: {
    code: ErrorCodes.POST_ALREADY_LIKED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn đã thích bài đăng này rồi',
  },

  POST_NOT_LIKED: {
    code: ErrorCodes.POST_NOT_LIKED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn chưa thích bài đăng này',
  },

  POST_CONTACT_INFO_RESTRICTED: {
    code: ErrorCodes.POST_CONTACT_INFO_RESTRICTED,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () =>
      'Thông tin liên hệ chỉ hiển thị với người nhận được chọn trong giai đoạn giao nhận',
  },

  // ── 0x07 Point / Rank / Referral M4 ────────────────────────────────────────
  POINT_RULE_UNAVAILABLE: {
    code: ErrorCodes.POINT_RULE_UNAVAILABLE,
    httpStatus: HttpStatus.CONFLICT,
    message: (ruleCode: string) => `Point rule ${ruleCode} không khả dụng`,
    sample: ['PHONE_VERIFIED_FIRST_TIME'],
  },

  RANK_TIER_UNAVAILABLE: {
    code: ErrorCodes.RANK_TIER_UNAVAILABLE,
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    message: (rank: string) => `Không tìm thấy cấu hình tier cho rank ${rank}`,
    sample: ['SILVER'],
  },

  POINT_DAILY_CAP_REACHED: {
    code: ErrorCodes.POINT_DAILY_CAP_REACHED,
    httpStatus: HttpStatus.CONFLICT,
    message: (ruleCode: string, dailyCap: number) =>
      `Đã đạt giới hạn ${dailyCap} lần/ngày cho point rule ${ruleCode}`,
    sample: ['REFERRAL_QUALIFIED', 3],
  },

  // ── 0x08 Giao dịch tặng/nhận M3 ───────────────────────────────────────────
  GIFT_TRANSACTION_NOT_FOUND: {
    code: ErrorCodes.GIFT_TRANSACTION_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy lượt tặng/nhận',
  },

  GIFT_TRANSACTION_INVALID_STATE: {
    code: ErrorCodes.GIFT_TRANSACTION_INVALID_STATE,
    httpStatus: HttpStatus.CONFLICT,
    message: (status: string) =>
      `Lượt tặng/nhận đang ở trạng thái ${status} nên không thực hiện được thao tác này`,
    sample: ['COMPLETED'],
  },

  GIFT_TRANSACTION_NOT_PARTICIPANT: {
    code: ErrorCodes.GIFT_TRANSACTION_NOT_PARTICIPANT,
    httpStatus: HttpStatus.FORBIDDEN,
    // Không nói rõ "bạn không phải người tặng" hay "không phải người nhận":
    // cả hai đều dẫn tới cùng một hành động, và tách ra là lộ vai trò người khác.
    message: () => 'Bạn không có quyền thao tác trên lượt tặng/nhận này',
  },

  GIFT_TRANSACTION_OUT_OF_STOCK: {
    code: ErrorCodes.GIFT_TRANSACTION_OUT_OF_STOCK,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bài đăng đã hết số lượng để trao',
  },

  SHIP_PAYER_NOT_RECEIVER: {
    code: ErrorCodes.SHIP_PAYER_NOT_RECEIVER,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Bài đăng này không khai người nhận trả phí ship, nên không có khoản nào để báo chưa thanh toán',
  },

  CONTENT_BLOCKED_TERMS: {
    code: ErrorCodes.CONTENT_BLOCKED_TERMS,
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: () => 'Nội dung có từ ngữ không được phép. Vui lòng viết lại',
  },

  CONTENT_COMMENT_NOT_FOUND: {
    code: ErrorCodes.CONTENT_COMMENT_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy bình luận',
  },

  CONTENT_EDIT_WINDOW_CLOSED: {
    code: ErrorCodes.CONTENT_EDIT_WINDOW_CLOSED,
    httpStatus: HttpStatus.CONFLICT,
    message: (minutes: number) =>
      `Chỉ sửa được bình luận trong ${minutes} phút đầu`,
    sample: [15],
  },

  GIFT_HANDOVER_EVIDENCE_REQUIRED: {
    code: ErrorCodes.GIFT_HANDOVER_EVIDENCE_REQUIRED,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Cần ảnh lúc trao đồ và ảnh hàng quay về thì mới báo được — trừ điểm người khác phải dựa trên dấu vết để lại từ trước',
  },

  GIFT_TRANSACTION_DUPLICATE_REQUEST: {
    code: ErrorCodes.GIFT_TRANSACTION_DUPLICATE_REQUEST,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn đã có một yêu cầu đang mở trên bài đăng này',
  },

  // ── 0x09 Quản trị RBAC ────────────────────────────────────────────────────
  ADMIN_LAST_SUPER_ADMIN: {
    code: ErrorCodes.ADMIN_LAST_SUPER_ADMIN,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Không thể thu hồi SUPER_ADMIN cuối cùng: sẽ không còn ai cấp lại quyền được',
  },

  ADMIN_SELF_ROLE_CHANGE: {
    code: ErrorCodes.ADMIN_SELF_ROLE_CHANGE,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Không thể tự thay đổi quyền của chính mình',
  },

  // ── 0x0A Chính sách quyền/quota theo rank ─────────────────────────────────
  ENTITLEMENT_POLICY_UNAVAILABLE: {
    code: ErrorCodes.ENTITLEMENT_POLICY_UNAVAILABLE,
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    // Không có revision nào đang hiệu lực nghĩa là cả hệ thống quota mất đáy
    // tham chiếu. Fail rõ ràng, đừng đoán bừa một giá trị mặc định.
    message: () => 'Chưa có bản chính sách quyền nào đang hiệu lực',
  },

  ENTITLEMENT_CAPABILITY_UNKNOWN: {
    code: ErrorCodes.ENTITLEMENT_CAPABILITY_UNKNOWN,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: (code: string) =>
      `Không có capability nào mang mã ${code} trong bản chính sách hiện hành`,
    sample: ['POST_TELEPATHY'],
  },

  // ── 0x04 Phiên đăng nhập, OTP ─────────────────────────────────────────────
  SESSION_NOT_FOUND: {
    code: ErrorCodes.SESSION_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy phiên đăng nhập',
  },

  REFRESH_TOKEN_INVALID: {
    code: ErrorCodes.REFRESH_TOKEN_INVALID,
    httpStatus: HttpStatus.UNAUTHORIZED,
    // Không phân biệt "không tồn tại" / "đã thu hồi" / "hết hạn": cả ba đều dẫn
    // tới cùng một hành động ở client là đăng nhập lại.
    message: () => 'Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại',
  },

  REFRESH_TOKEN_EXPIRED: {
    code: ErrorCodes.REFRESH_TOKEN_EXPIRED,
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: () => 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
  },

  OTP_INVALID: {
    code: ErrorCodes.OTP_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    // Không phân biệt "sai mã" với "mã đã hết hạn": biết mã còn sống hay không
    // là một mẩu thông tin cho kẻ dò.
    message: () => 'Mã xác minh không đúng hoặc đã hết hạn',
  },

  OTP_EXPIRED: {
    code: ErrorCodes.OTP_EXPIRED,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () => 'Mã xác minh đã hết hạn',
  },

  OTP_TOO_SOON: {
    code: ErrorCodes.OTP_TOO_SOON,
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    message: (retryAfterSeconds: number) =>
      `Vui lòng thử lại sau ${retryAfterSeconds} giây`,
    sample: [42],
  },
});
