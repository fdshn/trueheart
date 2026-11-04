import { CharityCampaignNotFoundException } from '@/domain/exceptions';
import { ICharityCampaignRepository } from '@/domain/ports/repository';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { isPubliclyVisibleProject } from '@chantam.vn/chantam.core-lib/models';
import { InternalServerErrorException } from '@nestjs/common';

/**
 * Dự án từ thiện là chủ thể của thích/bình luận (CHARITY-PROJECT-LIFECYCLE §3.7).
 *
 * Dự án phải đang hiện ra ngoài — đã duyệt, chưa xoá, đang chạy hoặc đã đóng bình thường —
 * thì mới đọc/ghi được tương tác của nó. Nháp, chờ duyệt, bị đình chỉ: 404 như chính trang
 * dự án, để sự TỒN TẠI của nó cũng không lộ qua đường bình luận.
 *
 * Trả `null` với chủ thể không phải dự án — nơi gọi đi nhánh cũ của nó.
 */
export async function assertCharitySubjectVisible(
  campaigns: ICharityCampaignRepository | undefined,
  subjectType: ContentSubjectTypes,
  subjectId: string,
): Promise<{ authorId: string | null } | null> {
  if (subjectType !== ContentSubjectTypes.CHARITY_CAMPAIGN) return null;
  if (!campaigns)
    throw new InternalServerErrorException(
      'ICharityCampaignRepository chưa được tiêm vào use case tương tác',
    );
  const campaign = await campaigns.findByGlobalId(subjectId);
  if (!campaign || !isPubliclyVisibleProject(campaign, new Date()))
    throw new CharityCampaignNotFoundException();
  return { authorId: campaign.createdBy };
}
