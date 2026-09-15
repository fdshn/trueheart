import { defineErrorCatalog } from '@chantam/service.common-lib/exception';
import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from './error-codes';

/** Toàn bộ lỗi tầng xác thực: mã, mã HTTP và thông điệp, ở đúng một chỗ. */
export const AuthErrors = defineErrorCatalog(ErrorOrigin, {
  TOKEN_MISSING: {
    code: ErrorCodes.TOKEN_MISSING,
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: () => 'Thiếu access token',
  },

  TOKEN_INVALID: {
    code: ErrorCodes.TOKEN_INVALID,
    httpStatus: HttpStatus.UNAUTHORIZED,
    // Cố ý KHÔNG nói rõ sai ở đâu (chữ ký? định dạng? người dùng không tồn
    // tại?). Thông báo chi tiết giúp kẻ tấn công dò nhanh hơn.
    message: () => 'Access token không hợp lệ',
  },

  TOKEN_EXPIRED: {
    code: ErrorCodes.TOKEN_EXPIRED,
    httpStatus: HttpStatus.UNAUTHORIZED,
    // Tách riêng khỏi TOKEN_INVALID để client biết khi nào nên tự refresh thay
    // vì đá người dùng ra màn đăng nhập.
    message: () => 'Access token đã hết hạn',
  },

  TOKEN_REVOKED: {
    code: ErrorCodes.TOKEN_REVOKED,
    httpStatus: HttpStatus.UNAUTHORIZED,
    // Tách khỏi TOKEN_EXPIRED: token này chưa hết hạn nhưng đã bị thu hồi, nên
    // refresh cũng vô ích — client phải đưa người dùng về màn đăng nhập.
    message: () => 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại',
  },
});
