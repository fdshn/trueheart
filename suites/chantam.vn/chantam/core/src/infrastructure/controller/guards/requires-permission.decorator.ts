import { SetMetadata } from '@nestjs/common';

export const RequiredPermissionKey = 'chantam:required-permission';

/**
 * Khai quyền mà endpoint đòi hỏi.
 *
 * `AdminPermissionGuard` chặn MỌI route dưới `/admin` không khai quyền, nên
 * quên decorator này là endpoint bị khoá chứ không phải bị mở — cùng hướng an
 * toàn với `@Public()` của auth-lib.
 */
export const RequiresPermission = (permission: string) =>
  SetMetadata(RequiredPermissionKey, permission);
