/**
 * Lỗi do DỮ LIỆU người dùng gửi lên, không phải do hệ thống hỏng.
 *
 * Tách ra một lớp riêng để tầng ứng dụng đổi được thành 400. Trước đây mọi phép
 * kiểm ở đây ném `Error` trần, và `Error` trần đi thẳng thành 500 — người dùng
 * gửi nhầm một key nhận "lỗi hệ thống" và không biết phải sửa gì.
 */
export class StorageValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

export function isStorageValidationError(
  error: unknown,
): error is StorageValidationError {
  return error instanceof StorageValidationError;
}
