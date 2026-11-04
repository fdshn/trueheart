import {
  CharityCampaignNotFoundException,
  CharityPostNotFoundException,
} from '@/domain/exceptions';
import {
  ICharityCampaignRepository,
  ICharityEventRepository,
} from '@/domain/ports/repository';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { isPubliclyVisibleProject } from '@chantam.vn/chantam.core-lib/models';
import { InternalServerErrorException } from '@nestjs/common';

export interface ICharitySubjectDeps {
  readonly campaigns?: ICharityCampaignRepository;
  readonly events?: ICharityEventRepository;
}

/**
 * Dự án từ thiện và bài ảnh/clip của nó là chủ thể của thích/bình luận
 * (CHARITY-PROJECT-LIFECYCLE §3.5, §3.7).
 *
 * Dự án phải đang hiện ra ngoài — đã duyệt, chưa xoá, đang chạy hoặc đã đóng bình thường —
 * thì mới đọc/ghi được tương tác của nó. Nháp, chờ duyệt, bị đình chỉ: 404 như chính trang
 * dự án, để sự TỒN TẠI của nó cũng không lộ qua đường bình luận. Bài phải chưa xoá, chưa bị
 * Admin ẩn, và thuộc một dự án như vậy.
 *
 * Trả `null` với chủ thể khác — nơi gọi đi nhánh cũ của nó.
 */
export async function assertCharitySubjectVisible(
  deps: ICharitySubjectDeps,
  subjectType: ContentSubjectTypes,
  subjectId: string,
): Promise<{ authorId: string | null } | null> {
  if (
    subjectType !== ContentSubjectTypes.CHARITY_CAMPAIGN &&
    subjectType !== ContentSubjectTypes.CHARITY_CAMPAIGN_POST
  )
    return null;
  if (!deps.campaigns || !deps.events)
    throw new InternalServerErrorException(
      'Repository dự án từ thiện chưa được tiêm vào use case tương tác',
    );
  if (subjectType === ContentSubjectTypes.CHARITY_CAMPAIGN_POST) {
    const post = await deps.events.findPost(subjectId);
    if (!post || post.deletedAt || post.hiddenAt)
      throw new CharityPostNotFoundException();
    const campaign = await deps.campaigns.findByGlobalId(post.campaignId);
    if (!campaign || !isPubliclyVisibleProject(campaign, new Date()))
      throw new CharityPostNotFoundException();
    return { authorId: post.author.userId };
  }
  const campaign = await deps.campaigns.findByGlobalId(subjectId);
  if (!campaign || !isPubliclyVisibleProject(campaign, new Date()))
    throw new CharityCampaignNotFoundException();
  return { authorId: campaign.createdBy };
}
