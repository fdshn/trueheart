import { v5 as uuidV5 } from 'uuid';
import { AppId } from '../consts';

/**
 * Sinh định danh công khai ổn định từ một đường dẫn logic.
 *
 * Cùng một `path` luôn cho cùng một UUID, nên thao tác tạo bản ghi trở thành
 * idempotent — client retry không tạo ra bản ghi trùng.
 *
 * @example makeGlobalId(`/gift-posts/${giverId}/${slug}`)
 */
export function makeGlobalId(path: string): string {
  return uuidV5(path, AppId);
}
