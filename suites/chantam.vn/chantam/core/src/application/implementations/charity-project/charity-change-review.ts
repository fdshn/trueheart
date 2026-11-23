import {
  IAdminConfigRepository,
  ICharityCampaign,
  IEntitlementRepository,
} from '@/domain/ports/repository';
import { PublishCharityWithoutReviewCapability } from '@chantam.vn/chantam.core-lib/models';

const WritePermission = 'campaign.manage';

/**
 * Sửa trường quan trọng có được áp NGAY không (CR 22/11/2026 §3.17b): chiến dịch chưa duyệt,
 * Admin có `campaign.manage`, hoặc người sửa có quyền đăng không cần duyệt. Còn lại phải đi bản
 * sửa chờ Admin duyệt (`CHARITY_CHANGE_REQUIRES_REVIEW`).
 */
export async function directChangeAllowed(
  deps: {
    entitlements?: IEntitlementRepository;
    admin: IAdminConfigRepository;
  },
  params: {
    campaign: Pick<ICharityCampaign, 'approvalStatus'>;
    actorUserId: string;
    asAdmin: boolean;
  },
): Promise<boolean> {
  if (params.campaign.approvalStatus !== 'APPROVED') return true;
  if (
    params.asAdmin ||
    (await deps.admin.hasPermission(params.actorUserId, WritePermission))
  )
    return true;
  if (!deps.entitlements) return false;
  const capability = await deps.entitlements.getCapability(
    params.actorUserId,
    PublishCharityWithoutReviewCapability,
  );
  return capability?.allowed === true;
}
