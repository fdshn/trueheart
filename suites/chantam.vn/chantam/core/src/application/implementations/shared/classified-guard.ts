import { ClassifiedTransactionNotSupportedException } from '@/domain/exceptions';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  ClassifiedLegacyTransactionsConfigKey,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';

/**
 * Rao vặt không tạo yêu cầu xin nhận hay lượt trao MỚI (PR #46 §8) — trừ khi Admin bật lại
 * luồng cũ bằng `classified.legacy_transactions_enabled = 1`.
 *
 * Thiếu cấu hình (hoặc không có `adminConfig`) là CHẶN: mặc định của sản phẩm mới là Rao vặt
 * chỉ đăng tin và liên hệ, nên mở cửa phải là việc có chủ đích.
 */
export async function assertClassifiedTransactionsAllowed(
  post: { postType: string },
  adminConfig: IAdminConfigRepository | undefined,
): Promise<void> {
  if (post.postType !== PostTypes.CLASSIFIED) return;
  const legacy = await adminConfig?.getConfigValue(
    ClassifiedLegacyTransactionsConfigKey,
  );
  if (legacy !== 1) throw new ClassifiedTransactionNotSupportedException();
}
