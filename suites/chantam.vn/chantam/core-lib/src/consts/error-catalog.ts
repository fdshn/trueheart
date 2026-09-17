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
