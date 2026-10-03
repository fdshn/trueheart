import {
  ICancelCharityParticipationUseCase,
  ICharityCampaignPageResult,
  ICharityCampaignView,
  ICharityCampaignWriteInput,
  ICreateCharityCampaignCommand,
  ICreateCharityCampaignUseCase,
  IDecideCharityApprovalCommand,
  IDecideCharityApprovalUseCase,
  IGetPublicCharityCampaignCommand,
  IGetPublicCharityCampaignResult,
  IGetPublicCharityCampaignUseCase,
  IJoinCharityCampaignCommand,
  IJoinCharityCampaignResult,
  IJoinCharityCampaignUseCase,
  IListAdminCharityCampaignsCommand,
  IListAdminCharityCampaignsUseCase,
  IListJoinedCharityCampaignsUseCase,
  IListMyCharityCampaignsCommand,
  IListMyCharityCampaignsUseCase,
  IListPublicCharityCampaignsCommand,
  IListPublicCharityCampaignsUseCase,
  IReviewCharityCampaignCommand,
  IReviewCharityCampaignResult,
  IReviewCharityCampaignUseCase,
  ISetCharityCampaignActiveCommand,
  ISetCharityCampaignActiveUseCase,
  IUpdateCharityProgressCommand,
  IUpdateCharityProgressUseCase,
} from '@/application/contracts/charity-campaign';
import {
  CharityAlreadyRegisteredException,
  CharityApprovalAlreadyDecidedException,
  CharityCampaignCreateNotAllowedException,
  CharityCampaignNotFoundException,
  CharityCancelTooLateException,
  CharityNotOrganizerException,
  CharityNotRegisteredException,
  CharityParticipationClosedException,
  CharityReviewDuplicateException,
  CharityReviewNotPermittedException,
  CharityReviewTooEarlyException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityCampaignRepository,
  IEntitlementRepository,
} from '@/domain/ports/repository';
import {
  CharityApprovalStatus,
  CreateCharityCampaignCapability,
  MaxCharityDescriptionLength,
  MaxCharityReviewCommentLength,
  MaxCharityTargetItems,
  MaxCharityTitleLength,
  canCancelCharityParticipation,
  canReviewCharityCampaign,
  charityCampaignGaps,
  charityReviewRoleOf,
  isCharityReviewRating,
  normalizeCharitySlug,
  slugifyCharityTitle,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Quyền Admin đọc và quyền Admin ghi.
 *
 * Dùng lại cặp `campaign.*` của F63 thay vì sinh `charity.*` — xem migration
 * `1798400000000` cho lý lẽ và cho cái giá phải trả.
 */
const ReadPermission = 'campaign.read';
const WritePermission = 'campaign.manage';

/** Gắn `isJoined` vào bản ghi repository trả về. */
function toView(
  campaign: ICharityCampaign,
  isJoined: boolean | null,
): ICharityCampaignView {
  return { ...campaign, isJoined };
}

function toPage(
  page: { items: ICharityCampaign[]; total: number },
  isJoined: boolean | null,
): ICharityCampaignPageResult {
  return {
    items: page.items.map((campaign) => toView(campaign, isJoined)),
    total: page.total,
  };
}

/**
 * Đọc và kiểm phần thân chung của một lượt tạo.
 *
 * Tách riêng vì hai đường tạo (thành viên và Admin) chia nhau đúng bộ phép kiểm này, và
 * một bản chép thứ hai là một chỗ để hai đường lệch nhau — đường Admin lỏng hơn đường
 * thành viên là cách tạo ra hoạt động công khai thiếu thông tin.
 */
async function prepareWrite(
  repository: ICharityCampaignRepository,
  input: ICharityCampaignWriteInput,
): Promise<{
  title: string;
  slug: string;
  description: string;
  bannerUrl: string;
  badgeName: string;
  targetItemsCount: number;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
  startTime: Date;
  endTime: Date;
}> {
  const title = (input.title ?? '').trim().slice(0, MaxCharityTitleLength);
  const requested = normalizeCharitySlug(input.slug);
  const slug = requested.length > 0 ? requested : slugifyCharityTitle(title);
  const description = (input.description ?? '')
    .trim()
    .slice(0, MaxCharityDescriptionLength);
  const badgeName = (input.badgeName ?? '').trim();
  const targetItemsCount = input.targetItemsCount ?? 0;
  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);

  const gaps = charityCampaignGaps({
    title,
    slug,
    description,
    bannerUrl: input.bannerUrl,
    badgeName,
    startTime,
    endTime,
    targetItemsCount,
  });

  // Toạ độ phải đủ cặp. Một vĩ độ không kinh độ là một điểm không dựng được, và
  // `ST_MakePoint` với `NULL` cho ra `NULL` — tức hoạt động lặng lẽ mất vị trí thay vì
  // người tạo biết mình gửi thiếu.
  const hasLat = input.lat !== undefined && input.lat !== null;
  const hasLng = input.lng !== undefined && input.lng !== null;
  if (hasLat !== hasLng)
    gaps.push('lat và lng phải gửi cùng nhau, hoặc bỏ cả hai');

  if (gaps.length > 0) throw new ValidationFailedException(gaps);

  // Hỏi trước khi ghi để trả một thông báo đọc được, thay vì để `UQ_campaigns_slug` ném
  // 500. Vẫn còn khe hẹp giữa lượt hỏi và lượt ghi — ràng buộc database là lớp cuối, và
  // nó phải là lớp cuối chứ không phải lớp duy nhất.
  if (await repository.slugTaken(slug))
    throw new ValidationFailedException([
      `slug "${slug}" đã có hoạt động khác dùng — đổi tiêu đề hoặc gửi slug riêng`,
    ]);

  return {
    title,
    slug,
    description,
    bannerUrl: input.bannerUrl,
    badgeName,
    targetItemsCount,
    lat: hasLat ? Number(input.lat) : null,
    lng: hasLng ? Number(input.lng) : null,
    locationLabel: input.locationLabel?.trim() || null,
    startTime,
    endTime,
  };
}

@Injectable()
export class CreateCharityCampaignUseCase implements ICreateCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateCharityCampaignCommand,
  ): Promise<ICharityCampaignView> {
    const approvalStatus = await this.resolveApprovalStatus(command);
    const prepared = await prepareWrite(this.repository, command);

    const campaign = await this.repository.create({
      ...prepared,
      createdBy: command.actorUserId,
      approvalStatus,
      // Admin tạo trực tiếp thì chính họ là người duyệt — `CHK_campaigns_approved_at` đòi
      // `approved_at` khác NULL khi trạng thái không còn chờ, nên để trống `approved_by`
      // sẽ cho một hàng đã duyệt mà không ai chịu trách nhiệm.
      approvedBy: approvalStatus === 'APPROVED' ? command.actorUserId : null,
    });

    return toView(campaign, false);
  }

  /**
   * Ai được tạo, và hồ sơ vào trạng thái nào (BR-CHARITY-01).
   *
   * Hai đường, hai phép kiểm khác hẳn nhau: đường Admin hỏi `admin_role_permissions`,
   * đường thành viên hỏi Rank Config. Không đường nào đọc `users.rank` trực tiếp.
   */
  private async resolveApprovalStatus(
    command: ICreateCharityCampaignCommand,
  ): Promise<CharityApprovalStatus> {
    if (command.asAdmin) {
      if (
        !(await this.admin.hasPermission(command.actorUserId, WritePermission))
      )
        throw new ForbiddenException();
      return 'APPROVED';
    }

    const capability = await this.entitlements.getCapability(
      command.actorUserId,
      CreateCharityCampaignCapability,
    );
    // `null` là KHÔNG cho phép: thiếu hàng trong Rank Config nghĩa là chưa ai quyết định,
    // và mặc định của một quyền chưa quyết định phải là đóng.
    if (!capability?.allowed)
      throw new CharityCampaignCreateNotAllowedException();

    return 'PENDING_APPROVAL';
  }
}

@Injectable()
export class ListPublicCharityCampaignsUseCase implements IListPublicCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListPublicCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    // `isJoined: null` chứ không `false` — đường này công khai, không có ai để hỏi.
    return toPage(await this.repository.listPublic(command), null);
  }
}

@Injectable()
export class GetPublicCharityCampaignUseCase implements IGetPublicCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IGetPublicCharityCampaignCommand,
  ): Promise<IGetPublicCharityCampaignResult> {
    const campaign = await this.repository.findPublicByIdOrSlug(
      command.idOrSlug,
    );
    if (!campaign) throw new CharityCampaignNotFoundException();

    const reviews = await this.repository.listReviews({
      campaignId: campaign.globalId,
      limit: 20,
      offset: 0,
    });

    return {
      campaign: toView(campaign, null),
      reviews: reviews.items,
      reviewTotal: reviews.total,
    };
  }
}

@Injectable()
export class ListMyCharityCampaignsUseCase implements IListMyCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListMyCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    // Đường DUY NHẤT để người tạo thấy hồ sơ còn chờ duyệt hoặc bị từ chối của mình —
    // `findPublicByIdOrSlug` cố tình không trả chúng, kể cả cho chủ hồ sơ.
    return toPage(
      await this.repository.listByCreator({
        userId: command.actorUserId,
        limit: command.limit,
        offset: command.offset,
      }),
      null,
    );
  }
}

@Injectable()
export class ListJoinedCharityCampaignsUseCase implements IListJoinedCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListMyCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    // `isJoined: true` cho cả trang — mọi hàng ở đây đều là hoạt động người gọi đang
    // đăng ký, do chính điều kiện JOIN quyết định.
    return toPage(
      await this.repository.listJoinedByUser({
        userId: command.actorUserId,
        limit: command.limit,
        offset: command.offset,
      }),
      true,
    );
  }
}

/** Phép kiểm chung: hoạt động phải đang hiện ra ngoài mới nhận được tương tác. */
async function loadPublicCampaign(
  repository: ICharityCampaignRepository,
  campaignId: string,
): Promise<ICharityCampaign> {
  const campaign = await repository.findByGlobalId(campaignId);
  // Hồ sơ chưa duyệt trả 404 chứ không 403: nó chưa công khai, nên sự TỒN TẠI của nó cũng
  // chưa công khai.
  if (!campaign || campaign.approvalStatus !== 'APPROVED')
    throw new CharityCampaignNotFoundException();
  return campaign;
}

@Injectable()
export class JoinCharityCampaignUseCase implements IJoinCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IJoinCharityCampaignCommand,
  ): Promise<IJoinCharityCampaignResult> {
    const campaign = await loadPublicCampaign(
      this.repository,
      command.campaignId,
    );

    // Đóng theo `end_time`, KHÔNG theo `start_time`: một hoạt động trao quà kéo dài cả
    // ngày vẫn nhận người đến giữa buổi, và BR-CHARITY-03 chỉ gắn `start_time` vào lượt
    // HUỶ. Chặn ở `start_time` là tự thêm một luật đặc tả không nêu.
    if (!campaign.isActive || campaign.endTime.getTime() <= Date.now())
      throw new CharityParticipationClosedException();

    const { created } = await this.repository.register({
      campaignId: campaign.globalId,
      userId: command.actorUserId,
    });
    if (!created) throw new CharityAlreadyRegisteredException();

    // Đọc lại để `participantCount` trả về đã tính cả lượt vừa rồi. Cộng tay vào bản ghi
    // cũ sẽ ra số sai ngay khi có người khác đăng ký song song.
    const refreshed = await this.repository.findByGlobalId(campaign.globalId);
    return { campaign: toView(refreshed ?? campaign, true) };
  }
}

@Injectable()
export class CancelCharityParticipationUseCase implements ICancelCharityParticipationUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IJoinCharityCampaignCommand,
  ): Promise<IJoinCharityCampaignResult> {
    const campaign = await loadPublicCampaign(
      this.repository,
      command.campaignId,
    );

    const status = await this.repository.findParticipationStatus({
      campaignId: campaign.globalId,
      userId: command.actorUserId,
    });
    if (status !== 'REGISTERED') throw new CharityNotRegisteredException();

    // BR-CHARITY-03: chỉ huỷ được khi CHƯA bắt đầu. Người tổ chức chốt số suất theo danh
    // sách đăng ký trước giờ khai mạc, nên một lượt huỷ giữa buổi không trả lại được gì.
    if (
      !canCancelCharityParticipation({
        startTime: campaign.startTime,
        now: new Date(),
      })
    )
      throw new CharityCancelTooLateException();

    if (
      !(await this.repository.cancelParticipation({
        campaignId: campaign.globalId,
        userId: command.actorUserId,
      }))
    )
      // Tới đây mà không huỷ được nghĩa là có lượt huỷ khác chen vào giữa lượt đọc và lượt
      // ghi. Vẫn báo "chưa đăng ký" — đó đúng là trạng thái hiện tại của họ.
      throw new CharityNotRegisteredException();

    const refreshed = await this.repository.findByGlobalId(campaign.globalId);
    return { campaign: toView(refreshed ?? campaign, false) };
  }
}

@Injectable()
export class ReviewCharityCampaignUseCase implements IReviewCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IReviewCharityCampaignCommand,
  ): Promise<IReviewCharityCampaignResult> {
    if (!isCharityReviewRating(command.rating))
      throw new ValidationFailedException([
        'rating phải là số nguyên từ 1 tới 5',
      ]);

    const campaign = await loadPublicCampaign(
      this.repository,
      command.campaignId,
    );

    // BR-CHARITY-03: đánh giá SAU khi kết thúc. Trước đó thì không ai có gì để đánh giá.
    if (
      !canReviewCharityCampaign({ endTime: campaign.endTime, now: new Date() })
    )
      throw new CharityReviewTooEarlyException();

    const participantIds = await this.repository.listRegisteredUserIds(
      campaign.globalId,
    );
    const role = charityReviewRoleOf({
      organizerId: campaign.createdBy,
      participantIds,
      actorId: command.actorUserId,
    });
    if (!role) throw new CharityReviewNotPermittedException();

    // Hai chiều, và CHỈ hai chiều đó: người tổ chức chấm người tham gia, người tham gia
    // chấm người tổ chức. Thiếu phép kiểm này thì hai người tham gia chấm nhau được —
    // biến một hoạt động thiện nguyện thành chỗ để hai người lạ hạ điểm nhau.
    const allowed =
      role === 'ORGANIZER'
        ? participantIds.includes(command.revieweeId)
        : campaign.createdBy === command.revieweeId;
    if (!allowed) throw new CharityReviewNotPermittedException();

    if (
      await this.repository.reviewExists({
        campaignId: campaign.globalId,
        reviewerId: command.actorUserId,
        revieweeId: command.revieweeId,
      })
    )
      throw new CharityReviewDuplicateException();

    const review = await this.repository.createReview({
      campaignId: campaign.globalId,
      reviewerId: command.actorUserId,
      revieweeId: command.revieweeId,
      reviewerRole: role,
      rating: command.rating,
      comment:
        command.comment?.trim().slice(0, MaxCharityReviewCommentLength) || null,
    });

    return { review };
  }
}

@Injectable()
export class UpdateCharityProgressUseCase implements IUpdateCharityProgressUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateCharityProgressCommand,
  ): Promise<ICharityCampaignView> {
    if (
      !Number.isInteger(command.currentItemsCount) ||
      command.currentItemsCount < 0 ||
      command.currentItemsCount > MaxCharityTargetItems
    )
      throw new ValidationFailedException([
        `currentItemsCount phải là số nguyên từ 0 tới ${MaxCharityTargetItems}`,
      ]);

    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();

    if (command.asAdmin) {
      if (
        !(await this.admin.hasPermission(command.actorUserId, WritePermission))
      )
        throw new ForbiddenException();
    } else if (campaign.createdBy !== command.actorUserId) {
      throw new CharityNotOrganizerException();
    }

    // BR-CHARITY-02: con số này là LỜI KHAI. Không câu nào ở đây đối chiếu nó với
    // `gift_transactions`, và cố ý như vậy — xem docblock đầu `models/charity-campaign.ts`.
    const updated = await this.repository.updateProgress({
      campaignId: campaign.globalId,
      currentItemsCount: command.currentItemsCount,
    });
    if (!updated) throw new CharityCampaignNotFoundException();

    return toView(updated, null);
  }
}

@Injectable()
export class ListAdminCharityCampaignsUseCase implements IListAdminCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, ReadPermission)))
      throw new ForbiddenException();

    return toPage(
      await this.repository.listForAdmin({
        limit: command.limit,
        offset: command.offset,
        approvalStatus: command.approvalStatus,
      }),
      null,
    );
  }
}

@Injectable()
export class DecideCharityApprovalUseCase implements IDecideCharityApprovalUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IDecideCharityApprovalCommand,
  ): Promise<ICharityCampaignView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    if (!(await this.repository.findByGlobalId(command.campaignId)))
      throw new CharityCampaignNotFoundException();

    const decided = await this.repository.decideApproval({
      campaignId: command.campaignId,
      approverId: command.actorUserId,
      approve: command.approve,
      note: command.note?.trim() || null,
    });
    // Hồ sơ tồn tại nhưng `UPDATE` không khớp hàng nào nghĩa là nó không còn
    // `PENDING_APPROVAL` — tức một Admin khác đã xử lý. Người sau phải thấy xung đột, chứ
    // không phải ghi đè quyết định người trước.
    if (!decided) throw new CharityApprovalAlreadyDecidedException();

    return toView(decided, null);
  }
}

@Injectable()
export class SetCharityCampaignActiveUseCase implements ISetCharityCampaignActiveUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISetCharityCampaignActiveCommand,
  ): Promise<ICharityCampaignView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const updated = await this.repository.setActive({
      campaignId: command.campaignId,
      isActive: command.isActive,
    });
    if (!updated) throw new CharityCampaignNotFoundException();

    return toView(updated, null);
  }
}
