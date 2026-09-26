import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { isStorageValidationError } from '@chantam/service.storage-lib';

/**
 * Đổi lỗi chính sách của tầng lưu trữ thành lỗi nhập liệu 400.
 *
 * `StorageValidationError` nói "dữ liệu bạn gửi không dùng được" — key không
 * thuộc bạn, không phải ảnh, quá nặng. Để nó lọt ra nguyên dạng thì bộ lọc
 * ngoại lệ coi là lỗi hệ thống và trả 500: người dùng nhận "có gì đó hỏng" cho
 * một việc họ tự sửa được.
 *
 * Bọc ở tầng ứng dụng chứ không đổi tầng lưu trữ: `storage-lib` là thư viện
 * dùng chung, nó không được biết tới lớp ngoại lệ HTTP của dịch vụ này.
 */
export async function withStorageValidation<T>(
  field: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (!isStorageValidationError(error)) throw error;

    throw new ValidationFailedException([`${field}: ${error.message}`]);
  }
}
