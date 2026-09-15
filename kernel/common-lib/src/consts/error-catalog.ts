import { HttpStatus } from '@nestjs/common';
import { defineErrorCatalog } from '../exception/error-catalog';
import { ErrorCodes, ErrorOrigin } from './error-codes';

/**
 * Toàn bộ lỗi cấp nền tảng: mã, mã HTTP và thông điệp, ở đúng một chỗ.
 *
 * CHỈ đặt ở đây lỗi thuộc giao thức HTTP / vòng đời request. Lỗi nghiệp vụ
 * thuộc danh mục của package sở hữu nghiệp vụ đó (INVARIANTS.md mục 8).
 */
export const PlatformErrors = defineErrorCatalog(ErrorOrigin, {
  UNKNOWN_ERROR: {
    code: ErrorCodes.UNKNOWN_ERROR,
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    message: () => 'Đã có lỗi xảy ra, vui lòng thử lại',
  },

  BAD_REQUEST: {
    code: ErrorCodes.BAD_REQUEST,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: (detail?: string) => detail ?? 'Yêu cầu không hợp lệ',
    explains: (_detail?: string, explains?: string[]) => explains,
    sample: ['Thiếu tham số bắt buộc'],
  },

  UNAUTHORIZED: {
    code: ErrorCodes.UNAUTHORIZED,
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: (detail?: string) => detail ?? 'Chưa xác thực',
  },

  FORBIDDEN: {
    code: ErrorCodes.FORBIDDEN,
    httpStatus: HttpStatus.FORBIDDEN,
    message: (detail?: string) =>
      detail ?? 'Không đủ quyền thực hiện thao tác này',
  },

  NOT_FOUND: {
    code: ErrorCodes.NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: (detail?: string) => detail ?? 'Không tìm thấy dữ liệu',
  },

  CONFLICT: {
    code: ErrorCodes.CONFLICT,
    httpStatus: HttpStatus.CONFLICT,
    message: (detail?: string) => detail ?? 'Dữ liệu đã tồn tại',
  },

  VALIDATION_FAILED: {
    code: ErrorCodes.VALIDATION_FAILED,
    httpStatus: HttpStatus.BAD_REQUEST,
    // ValidationPipe trải lỗi của từng trường thành danh sách phẳng. Dòng đầu
    // làm thông điệp chính, phần còn lại nằm ở `explains`.
    message: (messages: string[]) =>
      messages[0] ?? 'Dữ liệu gửi lên không hợp lệ',
    explains: (messages: string[]) => messages.slice(1),
    sample: [
      [
        'registration.password: password must be longer than or equal to 8 characters',
      ],
    ],
  },

  INVALID_PAGINATION: {
    code: ErrorCodes.INVALID_PAGINATION,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: () => 'Tham số phân trang không hợp lệ',
  },

  RATE_LIMITED: {
    code: ErrorCodes.RATE_LIMITED,
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    message: (retryAfterSeconds: number) =>
      `Bạn thao tác quá nhanh, vui lòng thử lại sau ${retryAfterSeconds} giây`,
    sample: [30],
  },

  FEATURE_NOT_SUPPORTED: {
    code: ErrorCodes.FEATURE_NOT_SUPPORTED,
    httpStatus: HttpStatus.NOT_IMPLEMENTED,
    message: (feature?: string) =>
      feature ? `Chưa hỗ trợ: ${feature}` : 'Tính năng chưa được hỗ trợ',
    sample: ['đăng nhập bằng Google'],
  },

  NOT_IMPLEMENTED: {
    code: ErrorCodes.NOT_IMPLEMENTED,
    httpStatus: HttpStatus.NOT_IMPLEMENTED,
    message: (feature: string) => `Tính năng chưa được hiện thực: ${feature}`,
    sample: ['xuất báo cáo PDF'],
  },
});
