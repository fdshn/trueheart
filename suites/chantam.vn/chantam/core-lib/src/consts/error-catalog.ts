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

  REDEMPTION_NOT_AVAILABLE: {
    code: ErrorCodes.REDEMPTION_NOT_AVAILABLE,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () =>
      'Vật phẩm này hiện không đổi được bằng điểm. Đồng hồ chọn người nhận đã kết thúc hoặc bài đã có chủ.',
  },

  REDEMPTION_PRICE_UNAVAILABLE: {
    code: ErrorCodes.REDEMPTION_PRICE_UNAVAILABLE,
    httpStatus: HttpStatus.BAD_REQUEST,
    // Nói rõ lý do thuộc về BÀI chứ không phải về người đổi: họ không làm gì sai
    // và cũng không sửa được, nên câu chung chung sẽ khiến họ thử lại vô ích.
    message: () =>
      'Người tặng chưa khai giá trị tham khảo cho vật phẩm này, nên không quy ra điểm được.',
  },

  REDEMPTION_QUOTE_STALE: {
    code: ErrorCodes.REDEMPTION_QUOTE_STALE,
    // 409 chứ không 400: người dùng không gửi gì sai. Họ xác nhận một con số
    // đúng ở thời điểm họ thấy nó, và thế giới đổi dưới chân họ. 400 nói "sửa
    // dữ liệu đi", còn ở đây việc cần làm là XEM LẠI giá rồi quyết lần nữa.
    httpStatus: HttpStatus.CONFLICT,
    // Nói cả hai con số: thiếu con số mới thì client phải gọi lại báo giá chỉ để
    // dựng được câu thông báo, và người dùng nhìn một màn hình trống giữa hai
    // lượt gọi.
    message: (confirmed?: number, current?: number) =>
      `Giá đã đổi từ ${confirmed ?? 0} điểm thành ${current ?? 0} điểm. Xem lại rồi xác nhận giúp mình nhé.`,
  },

  REDEMPTION_INSUFFICIENT_POINTS: {
    code: ErrorCodes.REDEMPTION_INSUFFICIENT_POINTS,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: (required?: number, available?: number) =>
      `Vật phẩm này cần ${required ?? 0} điểm, bạn đang có ${available ?? 0}.`,
  },

  OPEN_REQUEST_QUOTA_EXCEEDED: {
    code: ErrorCodes.OPEN_REQUEST_QUOTA_EXCEEDED,
    httpStatus: HttpStatus.FORBIDDEN,
    // Nói rõ con số: "bạn đang xin quá nhiều" bắt người dùng đoán bao nhiêu là
    // đủ, và họ không có cách nào biết mình còn bao nhiêu chỗ.
    message: (current?: number, quota?: number) =>
      `Bạn đang có ${current ?? 0}/${quota ?? 0} yêu cầu chưa ngã ngũ. ` +
      'Hãy rút bớt hoặc chờ người tặng trả lời trước khi xin thêm.',
  },

  OFFER_GIFT_TARGET_NOT_WANTED: {
    code: ErrorCodes.OFFER_GIFT_TARGET_NOT_WANTED,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () =>
      'Chỉ gửi lời tặng được cho bài Muốn Nhận. Với bài Muốn Tặng, hãy gửi yêu cầu xin nhận.',
  },

  OFFER_GIFT_SOURCE_INVALID: {
    code: ErrorCodes.OFFER_GIFT_SOURCE_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    // Nói rõ cả ba điều kiện: người dùng chọn bài từ danh sách bài của chính họ,
    // nên khi bị từ chối họ cần biết là do loại bài hay do bài đã đóng.
    message: () =>
      'Bài mang ra tặng phải là bài Muốn Tặng của chính bạn và đang còn công khai',
  },

  CHECK_IN_ALREADY_RECORDED: {
    code: ErrorCodes.CHECK_IN_ALREADY_RECORDED,
    httpStatus: HttpStatus.CONFLICT,
    message: (date?: string) =>
      `Ngày ${date ?? ''} đã có dấu điểm danh, không cần bù`.replace('  ', ' '),
  },

  CHECK_IN_POLICY_UNAVAILABLE: {
    code: ErrorCodes.CHECK_IN_POLICY_UNAVAILABLE,
    httpStatus: HttpStatus.CONFLICT,
    // Không nói "lỗi hệ thống": tính năng chưa bật là một trạng thái bình thường,
    // và người dùng cần biết là chờ chứ không phải thử lại.
    message: () => 'Tính năng điểm danh chưa được bật',
  },

  CHECK_IN_REPAIR_DATE_INVALID: {
    code: ErrorCodes.CHECK_IN_REPAIR_DATE_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    // Nói rõ cửa sổ: "ngày không hợp lệ" bắt người dùng thử từng ngày để đoán.
    message: (windowDays?: number) =>
      `Chỉ bù được những ngày trong ${windowDays ?? 0} ngày gần nhất, và không bù cho hôm nay`,
  },

  CHECK_IN_REPAIR_CREDIT_INSUFFICIENT: {
    code: ErrorCodes.CHECK_IN_REPAIR_CREDIT_INSUFFICIENT,
    httpStatus: HttpStatus.CONFLICT,
    message: (needed?: number) =>
      `Bạn không còn lượt điểm danh bù. Hoàn tất thêm ${needed ?? 0} lượt tặng/nhận quà để có một lượt`,
  },

  CHECK_IN_REPAIR_UNAVAILABLE: {
    code: ErrorCodes.CHECK_IN_REPAIR_UNAVAILABLE,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Ngày này không nối lại được chuỗi nào, nên bù vào cũng không thay đổi gì',
  },

  CHECK_IN_POLICY_VERSION_CONFLICT: {
    code: ErrorCodes.CHECK_IN_POLICY_VERSION_CONFLICT,
    httpStatus: HttpStatus.CONFLICT,
    message: (currentVersion: number | null, expectedVersion: number | null) =>
      `Policy điểm danh vừa được người khác publish: bản hiện tại là ${currentVersion ?? 'chưa có'}, không phải ${expectedVersion ?? 'chưa có'}. Tải lại rồi sửa trên bản mới`,
    explains: (currentVersion: number | null) => [
      `currentVersion=${currentVersion ?? 'null'}`,
    ],
    sample: [2, 1],
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

  PHONE_ALREADY_VERIFIED: {
    code: ErrorCodes.PHONE_ALREADY_VERIFIED,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Số điện thoại này đã từng được xác minh cho một tài khoản khác. Dùng số khác, hoặc liên hệ hỗ trợ nếu đây đúng là số của bạn.',
  },

  VERIFIED_PHONE_NOT_FOUND: {
    code: ErrorCodes.VERIFIED_PHONE_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Số này chưa từng được xác minh cho tài khoản nào',
  },

  VERIFIED_PHONE_IN_USE: {
    code: ErrorCodes.VERIFIED_PHONE_IN_USE,
    httpStatus: HttpStatus.CONFLICT,
    message: (username: string) =>
      `Số này đang do tài khoản "${username}" giữ và vẫn còn hiệu lực xác minh. Xử lý tài khoản đó trước — đổi số hoặc khoá — rồi mới giải phóng.`,
    sample: ['nguoidung01'],
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

  /**
   * Đổi cha danh mục sẽ tạo VÒNG trong cây.
   *
   * Vì sao phải chặn, không phải chuyện thẩm mỹ: cây dựng từ gốc `parent_id IS NULL`
   * đi xuống, nên một nhánh có vòng thì không nút nào của nó còn là gốc — cả nhánh
   * biến mất khỏi CẢ hai đường đọc, kể cả đường của Admin. Khi đó không lấy lại được
   * `categoryId` qua API để sửa, và chỉ còn đường SQL tay.
   */
  CATEGORY_PARENT_CYCLE: {
    code: ErrorCodes.CATEGORY_PARENT_CYCLE,
    httpStatus: HttpStatus.CONFLICT,
    message: (name: string) =>
      `Không đặt "${name}" làm cha được: nó nằm trong nhánh con của danh mục đang sửa, và làm vậy sẽ tạo vòng khiến cả nhánh biến mất khỏi cây`,
    sample: ['Điện thoại'],
  },

  /**
   * Tắt danh mục đang có bài dùng.
   *
   * Đếm cả NHÁNH CON: tắt một danh mục cha làm cả nhánh biến mất khỏi bộ lọc, nên
   * bài nằm ở nút lá cũng mất chỗ hiện.
   */
  CATEGORY_IN_USE: {
    code: ErrorCodes.CATEGORY_IN_USE,
    httpStatus: HttpStatus.CONFLICT,
    message: (postCount: number) =>
      `Không tắt được: còn ${postCount} bài đang dùng danh mục này hoặc nhánh con của nó. Chuyển bài sang danh mục khác trước`,
    sample: [34],
  },

  CATEGORY_POST_TYPE_IN_USE: {
    code: ErrorCodes.CATEGORY_POST_TYPE_IN_USE,
    httpStatus: HttpStatus.CONFLICT,
    // Bỏ một loại khỏi danh mục còn bài loại đó là để những bài ấy nằm ở chỗ chúng không
    // còn được phép nằm — lọc theo loại sẽ không bao giờ tìm ra chúng nữa.
    message: (types: string, postCount: number) =>
      `Không bỏ được loại ${types}: còn ${postCount} bài loại đó trong danh mục này. Chuyển bài sang danh mục khác trước`,
    sample: ['WANTED', 3],
  },

  CATEGORY_DEPTH_EXCEEDED: {
    code: ErrorCodes.CATEGORY_DEPTH_EXCEEDED,
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: (maxDepth: number) =>
      `Cây danh mục sâu tối đa ${maxDepth} tầng. Sâu hơn thì màn hình chọn danh mục không dùng được`,
    sample: [4],
  },

  CATEGORY_POST_TYPE_NOT_ALLOWED: {
    code: ErrorCodes.CATEGORY_POST_TYPE_NOT_ALLOWED,
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: (postType: string, allowed: string) =>
      `Danh mục này không nhận bài loại ${postType}. Loại được nhận: ${allowed}`,
    sample: ['WANTED', 'OFFER, CLASSIFIED'],
  },

  CATEGORY_MERGE_INVALID: {
    code: ErrorCodes.CATEGORY_MERGE_INVALID,
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: (reason: string) => `Không gộp được: ${reason}`,
    sample: ['không gộp một danh mục vào chính nó'],
  },
  // Tách khỏi CATEGORY_MERGE_INVALID vì đây không phải một lượt gộp bị từ chối, mà
  // là một lượt BẬT LẠI bị từ chối — và hành động tiếp theo khác nhau: tạo danh
  // mục mới, chứ không sửa lại tham số gộp.
  CATEGORY_MERGED_CANNOT_REOPEN: {
    code: ErrorCodes.CATEGORY_MERGED_CANNOT_REOPEN,
    httpStatus: HttpStatus.CONFLICT,
    message: (name: string, target: string) =>
      `"${name}" đã được gộp vào "${target}" nên không bật lại được. Tạo danh mục mới nếu cần tách lại.`,
    sample: ['Đồ gia dụng', 'Gia dụng'],
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

  POST_HAS_LIVE_TRANSACTION: {
    code: ErrorCodes.POST_HAS_LIVE_TRANSACTION,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Bài này đang có lượt trao chưa xong. Đóng lượt trao đó trước rồi mới sửa hoặc gỡ bài được.',
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

  CHAT_MESSAGE_NOT_FOUND: {
    code: ErrorCodes.CHAT_MESSAGE_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    // Gộp cả "không có tin đó" với "tin của người khác": trả lời khác nhau cho
    // hai trường hợp là cho người ta dò được ai đã nhắn gì trong phòng nào.
    message: () => 'Không tìm thấy tin nhắn',
  },

  CHAT_RECALL_WINDOW_CLOSED: {
    code: ErrorCodes.CHAT_RECALL_WINDOW_CLOSED,
    httpStatus: HttpStatus.CONFLICT,
    message: (minutes: number) =>
      `Chỉ thu hồi được tin nhắn trong vòng ${minutes} phút sau khi gửi`,
    sample: [5],
  },

  CHAT_FLAG_ALREADY_REVIEWED: {
    code: ErrorCodes.CHAT_FLAG_ALREADY_REVIEWED,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Cờ này đã có người xử trước. Tải lại hàng đợi để xem quyết định đã chọn',
  },

  NOTIFICATION_BROADCAST_NOT_FOUND: {
    code: ErrorCodes.NOTIFICATION_BROADCAST_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy lượt gửi thông báo hàng loạt',
  },

  NOTIFICATION_BROADCAST_ALREADY_COMPLETED: {
    code: ErrorCodes.NOTIFICATION_BROADCAST_ALREADY_COMPLETED,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Lượt gửi này đã xong. Muốn gửi lại nội dung đó thì tạo một lượt gửi mới',
  },

  NOTIFICATION_BROADCAST_IN_PROGRESS: {
    code: ErrorCodes.NOTIFICATION_BROADCAST_IN_PROGRESS,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Lượt gửi này đang được gửi. Theo dõi tiến độ trong danh sách lượt gửi',
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

  SELECT_REQUESTER_NOT_ALLOWED: {
    code: ErrorCodes.SELECT_REQUESTER_NOT_ALLOWED,
    httpStatus: HttpStatus.FORBIDDEN,
    // Nói rõ hai điều người đọc cần: vì sao bị chặn, và chuyện gì sẽ xảy ra tiếp.
    // Một câu "không có quyền" trơ trọi làm chủ bài tưởng bài mình bị treo.
    message: () =>
      'Thứ hạng hiện tại của bạn chưa được tự chọn người nhận. Hết hạn xét, hệ thống sẽ tự chọn theo tiêu chí Ban quản trị cấu hình; bạn vẫn xem được danh sách và từ chối yêu cầu không hợp lệ',
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

  POINT_ENTRY_NOT_REVERSIBLE: {
    code: ErrorCodes.POINT_ENTRY_NOT_REVERSIBLE,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Bút toán này không hoàn được: không tồn tại, đã hoàn rồi, hoặc chính nó là một bút toán hoàn',
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

  REVIEW_TRANSACTION_NOT_COMPLETED: {
    code: ErrorCodes.REVIEW_TRANSACTION_NOT_COMPLETED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Lượt trao chưa hoàn tất nên chưa đánh giá được',
  },

  REVIEW_ALREADY_SUBMITTED: {
    code: ErrorCodes.REVIEW_ALREADY_SUBMITTED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn đã đánh giá lượt trao này rồi',
  },

  REVIEW_NOT_FOUND: {
    code: ErrorCodes.REVIEW_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    // Nói luôn việc cần làm: đường sửa và đường gửi là hai endpoint khác nhau,
    // nên "không tìm thấy" mà không nói gì thêm sẽ để client đoán.
    message: () => 'Bạn chưa đánh giá lượt trao này, nên chưa có gì để sửa',
  },

  REVIEW_ALREADY_EDITED: {
    code: ErrorCodes.REVIEW_ALREADY_EDITED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Mỗi đánh giá chỉ sửa được một lần, và bạn đã sửa rồi',
  },

  REVIEW_EDIT_WINDOW_CLOSED: {
    code: ErrorCodes.REVIEW_EDIT_WINDOW_CLOSED,
    httpStatus: HttpStatus.CONFLICT,
    // Nói SỐ NGÀY chứ không nói mốc: mốc là một dấu thời gian người dùng phải tự
    // trừ, còn con số ngày là thứ họ đọc một lần là hiểu.
    message: (graceDays?: number) =>
      `Hết hạn sửa đánh giá: chỉ sửa được trong ${graceDays ?? 0} ngày sau khi lượt trao hoàn tất`,
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

  NOTIFICATION_TEMPLATE_NOT_FOUND: {
    code: ErrorCodes.NOTIFICATION_TEMPLATE_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không có mẫu thông báo cho loại này',
  },

  ADMIN_SELF_ROLE_CHANGE: {
    code: ErrorCodes.ADMIN_SELF_ROLE_CHANGE,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Không thể tự thay đổi quyền của chính mình',
  },

  ADMIN_ROLE_NOT_FOUND: {
    code: ErrorCodes.ADMIN_ROLE_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: (roleCode: string) => `Không tìm thấy role ${roleCode}`,
    sample: ['CONTENT_EDITOR'],
  },

  ADMIN_ROLE_CODE_CONFLICT: {
    code: ErrorCodes.ADMIN_ROLE_CODE_CONFLICT,
    httpStatus: HttpStatus.CONFLICT,
    message: (roleCode: string) => `Mã role ${roleCode} đã tồn tại`,
    sample: ['MODERATOR'],
  },

  ADMIN_ROLE_PROTECTED: {
    code: ErrorCodes.ADMIN_ROLE_PROTECTED,
    httpStatus: HttpStatus.CONFLICT,
    // SUPER_ADMIN luôn có đủ quyền, quyền mới được migration gắn cho nó. Cho
    // CMS sửa là mở đường tắt role gốc hoặc rút quyền khỏi người cấp quyền.
    message: (roleCode: string) =>
      `Role ${roleCode} do hệ thống quản lý, không sửa được từ CMS`,
    sample: ['SUPER_ADMIN'],
  },

  ADMIN_PERMISSION_UNKNOWN: {
    code: ErrorCodes.ADMIN_PERMISSION_UNKNOWN,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: (codes: string[]) =>
      `Permission không tồn tại: ${codes.join(', ')}`,
    explains: (codes: string[]) => codes,
    sample: [['post.fly']],
  },

  ADMIN_ROLE_SELF_LOCKOUT: {
    code: ErrorCodes.ADMIN_ROLE_SELF_LOCKOUT,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Thay đổi này làm chính bạn mất quyền admin.manage. Nhờ một quản trị viên khác thực hiện',
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
  // Tách khỏi ENTITLEMENT_CAPABILITY_UNKNOWN vì đây không phải "gõ sai mã" mà là "mã
  // đúng, giá trị tự mâu thuẫn" — và hai cái dẫn tới hai việc sửa khác nhau.
  ENTITLEMENT_LIMIT_INVALID: {
    code: ErrorCodes.ENTITLEMENT_LIMIT_INVALID,
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: (code: string, rank: string, reason: string) =>
      `Hạn mức của ${code} ở bậc ${rank} không dùng được: ${reason}`,
    sample: [
      'POST_OPEN',
      'SILVER',
      'đã cho phép thì phải có hạn mức lớn hơn 0 — ô trống bị đọc thành 0 nên sẽ khoá cả bậc này',
    ],
  },

  // ── 0x0B Báo cáo vi phạm ─────────────────────────────────────────────────
  REPORT_NOT_FOUND: {
    code: ErrorCodes.REPORT_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy báo cáo vi phạm',
  },

  REPORT_DUPLICATED: {
    code: ErrorCodes.REPORT_DUPLICATED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn đã có một báo cáo đang chờ xử lý cho đối tượng này',
  },

  REPORT_INVALID_STATE: {
    code: ErrorCodes.REPORT_INVALID_STATE,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Báo cáo đã được xử lý và không thể thay đổi quyết định',
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

  TOO_MANY_REQUESTS: {
    code: ErrorCodes.TOO_MANY_REQUESTS,
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    message: (retryAfterSeconds: number) =>
      `Bạn thao tác quá nhanh. Thử lại sau ${retryAfterSeconds} giây`,
    sample: [60],
  },

  // ── 0x10 Group ────────────────────────────────────────────────────────────
  GROUP_DEFAULT_LOCATION_REQUIRED: {
    code: ErrorCodes.GROUP_DEFAULT_LOCATION_REQUIRED,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () =>
      'Hãy đặt Vị trí mặc định trước khi tạo nhóm — tâm vùng của nhóm chụp từ đó và không đổi được về sau.',
  },

  GROUP_ALREADY_MEMBER: {
    code: ErrorCodes.GROUP_ALREADY_MEMBER,
    httpStatus: HttpStatus.CONFLICT,
    // Nói luôn hệ quả: Phase 1 không rời và không chuyển nhóm, nên người dùng
    // cần biết đây không phải thứ họ tự gỡ được.
    message: () =>
      'Bạn đã thuộc một nhóm. Mỗi người chỉ thuộc tối đa một nhóm, và không chuyển nhóm được.',
  },

  GROUP_CREATE_NOT_ALLOWED: {
    code: ErrorCodes.GROUP_CREATE_NOT_ALLOWED,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Thứ hạng của bạn chưa đủ điều kiện tạo nhóm.',
  },

  GROUP_INVITE_INVALID: {
    code: ErrorCodes.GROUP_INVITE_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () => 'Link mời không dùng được.',
  },

  GROUP_NOT_FOUND: {
    code: ErrorCodes.GROUP_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy nhóm',
  },

  GROUP_ALREADY_DISSOLVED: {
    code: ErrorCodes.GROUP_ALREADY_DISSOLVED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Nhóm đã giải tán từ trước',
  },

  AFFILIATE_POLICY_VERSION_CONFLICT: {
    code: ErrorCodes.AFFILIATE_POLICY_VERSION_CONFLICT,
    httpStatus: HttpStatus.CONFLICT,
    message: (currentVersion: number | null, expectedVersion: number | null) =>
      `Policy Affiliate vừa được người khác publish: bản hiện tại là ${currentVersion ?? 'chưa có'}, không phải ${expectedVersion ?? 'chưa có'}. Tải lại rồi sửa trên bản mới`,
    explains: (currentVersion: number | null) => [
      `currentVersion=${currentVersion ?? 'null'}`,
    ],
    sample: [2, 1],
  },

  HOME_CAMPAIGN_NOT_FOUND: {
    code: ErrorCodes.HOME_CAMPAIGN_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy chiến dịch',
  },

  HOME_CAMPAIGN_SCHEDULE_CONFLICT: {
    code: ErrorCodes.HOME_CAMPAIGN_SCHEDULE_CONFLICT,
    httpStatus: HttpStatus.CONFLICT,
    // Mỗi thời điểm chỉ một giao diện trang chủ được bật (BR_CAMP_01). Bản nháp
    // (isActive = false) trùng giờ thì vẫn lưu được.
    message: () =>
      'Đã có giao diện trang chủ khác đang bật trùng khung thời gian này — tắt bản kia hoặc đổi thời gian',
  },

  HOME_CAMPAIGN_LIVE: {
    code: ErrorCodes.HOME_CAMPAIGN_LIVE,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Giao diện này đang hiển thị trên trang chủ — tắt (isActive: false) rồi mới xoá được',
  },

  BLOG_NOT_FOUND: {
    code: ErrorCodes.BLOG_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy bài viết',
  },

  BLOG_SLUG_CONFLICT: {
    code: ErrorCodes.BLOG_SLUG_CONFLICT,
    httpStatus: HttpStatus.CONFLICT,
    // Slug giữ chỗ cả khi bài đã xoá mềm — link ngoài vẫn trỏ vào đó.
    message: (slug?: string) =>
      slug
        ? `slug "${slug}" đã có bài khác dùng (kể cả bài đã xoá) — đổi tiêu đề hoặc gửi slug riêng`
        : 'slug đã có bài khác dùng (kể cả bài đã xoá) — đổi tiêu đề hoặc gửi slug riêng',
  },

  CHARITY_CAMPAIGN_NOT_FOUND: {
    code: ErrorCodes.CHARITY_CAMPAIGN_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy hoạt động từ thiện',
  },

  CHARITY_CAMPAIGN_CREATE_NOT_ALLOWED: {
    code: ErrorCodes.CHARITY_CAMPAIGN_CREATE_NOT_ALLOWED,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Hạng của bạn chưa được tạo hoạt động từ thiện',
  },

  CHARITY_PARTICIPATION_CLOSED: {
    code: ErrorCodes.CHARITY_PARTICIPATION_CLOSED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Hoạt động đã đóng đăng ký',
  },

  CHARITY_ALREADY_REGISTERED: {
    code: ErrorCodes.CHARITY_ALREADY_REGISTERED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn đã đăng ký hoạt động này',
  },

  CHARITY_NOT_REGISTERED: {
    code: ErrorCodes.CHARITY_NOT_REGISTERED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn chưa đăng ký hoạt động này',
  },

  CHARITY_CANCEL_TOO_LATE: {
    code: ErrorCodes.CHARITY_CANCEL_TOO_LATE,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Hoạt động đã bắt đầu, không huỷ đăng ký được nữa',
  },

  CHARITY_REVIEW_TOO_EARLY: {
    code: ErrorCodes.CHARITY_REVIEW_TOO_EARLY,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Chỉ đánh giá được sau khi hoạt động kết thúc',
  },

  CHARITY_REVIEW_NOT_PERMITTED: {
    code: ErrorCodes.CHARITY_REVIEW_NOT_PERMITTED,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Bạn không Ở trong hoạt động này nên không đánh giá được',
  },

  CHARITY_REVIEW_DUPLICATE: {
    code: ErrorCodes.CHARITY_REVIEW_DUPLICATE,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Bạn đã đánh giá người này trong hoạt động này',
  },

  CHARITY_NOT_ORGANIZER: {
    code: ErrorCodes.CHARITY_NOT_ORGANIZER,
    httpStatus: HttpStatus.FORBIDDEN,
    message: () => 'Chỉ người tổ chức cập nhật được tiến độ',
  },

  CHARITY_NOT_ACCEPTING_CONTRIBUTIONS: {
    code: ErrorCodes.CHARITY_NOT_ACCEPTING_CONTRIBUTIONS,
    httpStatus: HttpStatus.CONFLICT,
    // Không nói RÕ vì sao (chưa duyệt / đã đóng / đình chỉ): một chiến dịch chưa
    // duyệt hay đang bị đình chỉ là nội dung chưa công khai, và phân biệt ba lý do
    // là cho người ngoài dò được trạng thái kiểm duyệt của nó.
    message: () => 'Hoạt động này hiện không nhận đề nghị đóng góp',
  },

  CHARITY_NEED_ITEM_INVALID: {
    code: ErrorCodes.CHARITY_NEED_ITEM_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () =>
      'Có vật phẩm không thuộc danh sách nhu cầu của hoạt động này, hoặc đã được rút',
  },

  CHARITY_CONTRIBUTION_NOT_FOUND: {
    code: ErrorCodes.CHARITY_CONTRIBUTION_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy đề nghị đóng góp',
  },

  CHARITY_CONTRIBUTION_NOT_EDITABLE: {
    code: ErrorCodes.CHARITY_CONTRIBUTION_NOT_EDITABLE,
    httpStatus: HttpStatus.CONFLICT,
    // Nói việc cần làm: sau khi đã có phần được nhận, đường duy nhất là huỷ lượt
    // giao nhận — không phải sửa ngược đề nghị.
    message: () =>
      'Đề nghị đã được xét nên không sửa hay rút được nữa; thay đổi phải đi qua huỷ lượt giao nhận',
  },

  CHARITY_CONTRIBUTION_ALREADY_DECIDED: {
    code: ErrorCodes.CHARITY_CONTRIBUTION_ALREADY_DECIDED,
    httpStatus: HttpStatus.CONFLICT,
    // Retry CÙNG khoá thì không tới đây — nó nhận lại đúng kết quả cũ. Tới đây là
    // một lượt quyết định KHÁC, ví dụ hai người cùng bấm trên hai thiết bị.
    message: () => 'Đề nghị này không còn chờ xét — đã được xét hoặc đã rút',
  },

  CHARITY_LINES_INVALID: {
    code: ErrorCodes.CHARITY_LINES_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: (detail?: string) => detail ?? 'Các dòng gửi lên không hợp lệ',
  },

  CHARITY_NEED_EXCEEDED: {
    code: ErrorCodes.CHARITY_NEED_EXCEEDED,
    httpStatus: HttpStatus.CONFLICT,
    // Nói cả hai con số: §5 đòi trả phần còn lại MỚI NHẤT, và thiếu nó thì người tổ
    // chức phải tải lại cả bảng nhu cầu chỉ để biết nên sửa thành bao nhiêu.
    message: (itemName?: string, requested?: number, remaining?: number) =>
      `${itemName ?? 'Vật phẩm'}: bạn chọn nhận ${requested ?? 0} nhưng chỉ còn thiếu ${remaining ?? 0}`,
  },

  CHARITY_SELF_CONTRIBUTION: {
    code: ErrorCodes.CHARITY_SELF_CONTRIBUTION,
    httpStatus: HttpStatus.CONFLICT,
    // Chặn ở lượt GỬI chứ không đợi lượt quyết: tới lượt quyết thì
    // CHK_campaign_deliveries_not_self mới bắt, và người dùng nhận một lỗi 500.
    message: () =>
      'Bạn đang tổ chức hoạt động này nên không gửi đề nghị đóng góp vào nó được',
  },

  CHARITY_CAMPAIGN_NOT_CLOSABLE: {
    code: ErrorCodes.CHARITY_CAMPAIGN_NOT_CLOSABLE,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Hoạt động này chưa được duyệt hoặc đã đóng rồi',
  },

  CHARITY_EXTERNAL_CONTRIBUTION_NOT_FOUND: {
    code: ErrorCodes.CHARITY_EXTERNAL_CONTRIBUTION_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy bản ghi đóng góp ngoài app',
  },

  CHARITY_EXTERNAL_CONTRIBUTION_VOIDED: {
    code: ErrorCodes.CHARITY_EXTERNAL_CONTRIBUTION_VOIDED,
    httpStatus: HttpStatus.CONFLICT,
    // Nói việc cần làm: bản đang có hiệu lực là bản THAY THẾ, không phải bản này.
    message: () =>
      'Bản ghi này đã bị huỷ hoặc đã được thay bằng bản điều chỉnh — hãy thao tác trên bản đang có hiệu lực',
  },

  CHARITY_CAMPAIGN_HAS_ACTIVITY: {
    code: ErrorCodes.CHARITY_CAMPAIGN_HAS_ACTIVITY,
    httpStatus: HttpStatus.CONFLICT,
    // Xoá là mất lịch sử của người đã tham gia; đóng hoặc tắt thì không.
    message: () =>
      'Hoạt động đã có người đăng ký, đóng góp, giao nhận hoặc đánh giá — hãy đóng hoặc tắt thay vì xoá',
  },

  CHARITY_CAMPAIGN_NOT_EXTENDABLE: {
    code: ErrorCodes.CHARITY_CAMPAIGN_NOT_EXTENDABLE,
    httpStatus: HttpStatus.CONFLICT,
    // Gộp ba lý do vì cả ba có cùng một việc phải làm: đọc lại trạng thái hoạt động.
    // Rút ngắn thời hạn không đi đường này — nó đi qua đường đóng.
    message: () =>
      'Chỉ gia hạn được hoạt động đang mở, và mốc kết thúc mới phải sau mốc hiện tại',
  },

  CHARITY_COORDINATOR_NOT_ALLOWED: {
    code: ErrorCodes.CHARITY_COORDINATOR_NOT_ALLOWED,
    httpStatus: HttpStatus.CONFLICT,
    // §2 chỉ cho coordinator ở hoạt động CÓ TỔ CHỨC: kêu gọi cho một cá nhân không có
    // ai để điều phối ngoài chính người kêu gọi.
    message: () =>
      'Chỉ hoạt động có tổ chức mới có coordinator, và không giao được cho chính mình',
  },

  CHARITY_BENEFICIARY_NOT_APPLICABLE: {
    code: ErrorCodes.CHARITY_BENEFICIARY_NOT_APPLICABLE,
    httpStatus: HttpStatus.CONFLICT,
    message: () =>
      'Thông tin người thụ hưởng chỉ dành cho kêu gọi cá nhân giúp một người khác',
  },

  CHARITY_BENEFICIARY_CONSENT_REQUIRED: {
    code: ErrorCodes.CHARITY_BENEFICIARY_CONSENT_REQUIRED,
    httpStatus: HttpStatus.CONFLICT,
    // §2: kêu gọi cho NGƯỜI KHÁC phải có đồng ý của họ trước khi ra ngoài. Đăng hình
    // ảnh và hoàn cảnh của một người chưa đồng ý là xâm phạm chính người được giúp.
    message: () =>
      'Kêu gọi giúp người khác cần xác nhận người thụ hưởng đã đồng ý trước khi công khai',
  },

  CHARITY_MEDIA_INVALID: {
    code: ErrorCodes.CHARITY_MEDIA_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    // Trả nguyên danh sách lỗi: người tạo sửa được cả bộ trong một lượt thay vì
    // gửi lại năm lần để lần lượt biết từng chỗ sai.
    message: (detail?: string) => detail ?? 'Bộ ảnh/video gửi lên không hợp lệ',
  },

  CHARITY_MEDIA_NOT_EDITABLE: {
    code: ErrorCodes.CHARITY_MEDIA_NOT_EDITABLE,
    httpStatus: HttpStatus.CONFLICT,
    // Sau khi duyệt thì khoá: Admin duyệt bộ ảnh nào thì công khai đúng bộ ảnh đó.
    message: () => 'Chỉ sửa ảnh/video được khi hồ sơ còn đang chờ duyệt',
  },

  CHARITY_DELIVERY_NOT_FOUND: {
    code: ErrorCodes.CHARITY_DELIVERY_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy lượt giao nhận',
  },

  CHARITY_DELIVERY_INVALID_STATE: {
    code: ErrorCodes.CHARITY_DELIVERY_INVALID_STATE,
    httpStatus: HttpStatus.CONFLICT,
    message: (status?: string) =>
      `Lượt giao nhận đang ở trạng thái ${status ?? 'khác'}, không thực hiện được thao tác này`,
  },

  CHARITY_APPROVAL_ALREADY_DECIDED: {
    code: ErrorCodes.CHARITY_APPROVAL_ALREADY_DECIDED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Hồ sơ này đã được xử lý',
  },

  SPONSOR_BANNER_NOT_FOUND: {
    code: ErrorCodes.SPONSOR_BANNER_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy banner',
  },

  SPONSOR_BANNER_APPROVAL_ALREADY_DECIDED: {
    code: ErrorCodes.SPONSOR_BANNER_APPROVAL_ALREADY_DECIDED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Banner này đã được xử lý',
  },

  SPONSOR_BANNER_NOT_SERVING: {
    code: ErrorCodes.SPONSOR_BANNER_NOT_SERVING,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Banner này không còn được hiển thị',
  },

  MERIT_UNIT_NOT_FOUND: {
    code: ErrorCodes.MERIT_UNIT_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy đơn vị công đức',
  },

  MERIT_DECLARATION_NOT_FOUND: {
    code: ErrorCodes.MERIT_DECLARATION_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy lời khai công đức',
  },

  MERIT_DECLARATION_ALREADY_COMPLETED: {
    code: ErrorCodes.MERIT_DECLARATION_ALREADY_COMPLETED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Lời khai này đã được đánh dấu hoàn tất',
  },

  DHARMA_CONTENT_NOT_FOUND: {
    code: ErrorCodes.DHARMA_CONTENT_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy nội dung Phật Pháp',
  },

  DHARMA_CONTENT_NOT_RECITABLE: {
    code: ErrorCodes.DHARMA_CONTENT_NOT_RECITABLE,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Nội dung này không phải kinh để tụng',
  },

  DHARMA_RECITATION_NOT_FOUND: {
    code: ErrorCodes.DHARMA_RECITATION_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy lượt tụng',
  },

  DHARMA_RECITATION_ALREADY_COMPLETED: {
    code: ErrorCodes.DHARMA_RECITATION_ALREADY_COMPLETED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Lượt tụng này đã được đánh dấu hoàn tất',
  },

  DHARMA_THREAD_NOT_FOUND: {
    code: ErrorCodes.DHARMA_THREAD_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: () => 'Không tìm thấy chủ đề',
  },

  DHARMA_THREAD_LOCKED: {
    code: ErrorCodes.DHARMA_THREAD_LOCKED,
    httpStatus: HttpStatus.CONFLICT,
    message: () => 'Chủ đề này đã khoá bình luận',
  },
});
