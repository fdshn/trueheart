import {
  ICharityContributorBoard,
  ICharityEventStepView,
  ICharityPostQuotaView,
  ICharityProjectCommand,
  ICreateCharityPostCommand,
  ICreateCharityPostUseCase,
  IDeleteCharityPostCommand,
  IDeleteCharityPostUseCase,
  IGetCharityEventStepsUseCase,
  IGetCharityPostQuotaUseCase,
  IListCharityEventContributorsUseCase,
  IListCharityPostsCommand,
  IListCharityPostsUseCase,
  IRequestCharityPostUploadCommand,
  IRequestCharityPostUploadUseCase,
  ISetCharityEventContributorCommand,
  ISetCharityEventContributorUseCase,
  IUpdateCharityEventStepCommand,
  IUpdateCharityEventStepUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityCampaignNotFoundException,
  CharityEventContributorNotEligibleException,
  CharityEventStepNotFoundException,
  CharityPostForbiddenException,
  CharityPostMediaInvalidException,
  CharityPostNotFoundException,
  CharityPostQuotaExceededException,
  CharityProjectForbiddenException,
  CharityProjectNotApprovedException,
} from '@/domain/exceptions';
import { ICharityRealtimePublisher } from '@/domain/ports/realtime';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityCampaignRepository,
  ICharityEventRepository,
  ICharityEventStep,
  ICharityPost,
  ICharityProjectRepository,
} from '@/domain/ports/repository';
import {
  CharityEventStepLabels,
  CharityPostAuthorRole,
  CharityPostDailyImageQuotaConfigKey,
  CharityPostDailyVideoQuotaConfigKey,
  CharityPostMediaType,
  MaxCharityPostBodyLength,
  MaxCharityPostMedia,
  charityPostMediaTypeOf,
  charityPostRole,
  isSuspendedProject,
  normalizeCharityPostQuota,
  vietnamDayStart,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { withStorageValidation } from '../shared/storage-error';
import { CharityPointsService } from './charity-points.service';
import { CharityProjectAccess } from './charity-project.use-cases';

const WritePermission = 'campaign.manage';

const toStepView = (step: ICharityEventStep): ICharityEventStepView => ({
  ...step,
  label: CharityEventStepLabels[step.stepKey],
});

// ── Timeline tab C ──────────────────────────────────────────────────────────

/**
 * Timeline SỐNG (không phải bản chụp) — người xem theo dõi sự kiện đang diễn ra. Rỗng tới khi
 * ban tổ chức mở timeline lần đầu.
 */
@Injectable()
export class GetCharityEventStepsUseCase implements IGetCharityEventStepsUseCase {
  public constructor(
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
  ) {}

  public async handle(command: {
    idOrSlug: string;
  }): Promise<ICharityEventStepView[]> {
    const id = await this.projects.findVisibleCampaignId(command.idOrSlug);
    if (!id) throw new CharityCampaignNotFoundException();
    return (await this.events.listEventSteps(id)).map(toStepView);
  }
}

@Injectable()
export class UpdateCharityEventStepUseCase implements IUpdateCharityEventStepUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(ICharityRealtimePublisher)
    private readonly realtime: ICharityRealtimePublisher,
  ) {}

  public async handle(
    command: IUpdateCharityEventStepCommand,
  ): Promise<ICharityEventStepView> {
    const { campaign } = await this.access.forOperate(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    await this.events.ensureEventSteps(campaign.globalId);
    const step = await this.events.updateEventStep({
      campaignId: campaign.globalId,
      stepId: command.stepId,
      actorId: command.userId,
      patch: {
        ...command.patch,
        note:
          command.patch.note === undefined
            ? undefined
            : command.patch.note?.trim() || null,
      },
    });
    if (!step) throw new CharityEventStepNotFoundException();
    this.realtime.signal(campaign.globalId, ['TIMELINE'], 'public');
    return toStepView(step);
  }
}

// ── Cộng tác viên sự kiện ───────────────────────────────────────────────────

@Injectable()
export class ListCharityEventContributorsUseCase implements IListCharityEventContributorsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharityContributorBoard> {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const [contributors, candidates] = await Promise.all([
      this.events.listContributors(campaign.globalId),
      this.events.listContributorCandidates(campaign.globalId),
    ]);
    return { contributors, candidates };
  }
}

/**
 * Cấp / thu hồi quyền cộng tác viên sự kiện (§3.5): chỉ người có đóng góp được chấp nhận VÀ
 * đăng ký tham gia hợp lệ. Thu hồi luôn được.
 */
@Injectable()
export class SetCharityEventContributorUseCase implements ISetCharityEventContributorUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(ICharityRealtimePublisher)
    private readonly realtime: ICharityRealtimePublisher,
  ) {}

  public async handle(command: ISetCharityEventContributorCommand) {
    const { campaign } = await this.access.forOperate(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    if (
      command.active &&
      !(await this.events.isEligibleContributor(
        campaign.globalId,
        command.targetUserId,
      ))
    )
      throw new CharityEventContributorNotEligibleException();
    const result = await this.events.setContributor({
      campaignId: campaign.globalId,
      userId: command.targetUserId,
      actorId: command.userId,
      active: command.active,
    });
    // Thu hồi một người chưa từng được cấp: không có gì để trả.
    if (!result) throw new CharityEventContributorNotEligibleException();
    this.realtime.signal(campaign.globalId, ['CONTRIBUTORS'], 'workspace');
    return result;
  }
}

// ── Bài ảnh/clip ────────────────────────────────────────────────────────────

/** Vai đăng bài của một người với một dự án lúc này — `null` là không đăng được. */
@Injectable()
export class CharityPostAccess {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async resolve(
    campaignId: string,
    userId: string,
  ): Promise<{
    campaign: ICharityCampaign;
    role: CharityPostAuthorRole | null;
    isModerator: boolean;
  }> {
    const campaign = await this.campaigns.findByGlobalId(campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    const [isAdminWriter, isCoordinator, isEventContributor] =
      await Promise.all([
        this.admin.hasPermission(userId, WritePermission),
        campaign.createdBy === userId
          ? Promise.resolve(false)
          : this.campaigns.isCampaignManager(campaignId, userId),
        this.events.isActiveContributor(campaignId, userId),
      ]);
    const isOrganizer = campaign.createdBy === userId || isAdminWriter;
    const role = charityPostRole({
      approved: campaign.approvalStatus === 'APPROVED',
      suspended: isSuspendedProject(campaign, new Date()),
      isOrganizer,
      isCoordinator,
      isEventContributor,
      stage: campaign.operationStage,
    });
    // Không có vai gì với một dự án chưa hiện ra ngoài: 404 như trang dự án.
    if (
      !role &&
      !isOrganizer &&
      !isCoordinator &&
      campaign.approvalStatus !== 'APPROVED'
    )
      throw new CharityCampaignNotFoundException();
    return { campaign, role, isModerator: isOrganizer || isCoordinator };
  }
}

async function quotaLimits(
  admin: IAdminConfigRepository,
): Promise<Record<CharityPostMediaType, number>> {
  const [video, image] = await Promise.all([
    admin.getConfigValue(CharityPostDailyVideoQuotaConfigKey),
    admin.getConfigValue(CharityPostDailyImageQuotaConfigKey),
  ]);
  return {
    VIDEO: normalizeCharityPostQuota(video),
    IMAGE: normalizeCharityPostQuota(image),
  };
}

@Injectable()
export class GetCharityPostQuotaUseCase implements IGetCharityPostQuotaUseCase {
  public constructor(
    private readonly postAccess: CharityPostAccess,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharityPostQuotaView> {
    const { campaign, role } = await this.postAccess.resolve(
      command.campaignId,
      command.userId,
    );
    const since = vietnamDayStart(new Date());
    const [limits, used] = await Promise.all([
      quotaLimits(this.admin),
      this.events.usedUploads({
        campaignId: campaign.globalId,
        userId: command.userId,
        since,
      }),
    ]);
    return {
      role,
      canPost: role !== null,
      image: { used: used.IMAGE, limit: limits.IMAGE },
      video: { used: used.VIDEO, limit: limits.VIDEO },
      windowStartsAt: since,
    };
  }
}

/**
 * Ký đường tải ảnh/clip cho bài (§3.5): kiểm quyền đăng TRƯỚC khi ký (như chat), rồi quota
 * 5 clip + 5 ảnh / người / ngày / dự án dưới khoá — lượt ký là lượt tính quota.
 */
@Injectable()
export class RequestCharityPostUploadUseCase implements IRequestCharityPostUploadUseCase {
  public constructor(
    private readonly postAccess: CharityPostAccess,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(command: IRequestCharityPostUploadCommand) {
    const { campaign, role } = await this.postAccess.resolve(
      command.campaignId,
      command.userId,
    );
    if (!role) throw new CharityPostForbiddenException();
    const mediaType = charityPostMediaTypeOf(command.contentType);
    if (!mediaType)
      throw new ValidationFailedException([
        'upload.contentType: chỉ nhận ảnh hoặc video',
      ]);
    const limit = (await quotaLimits(this.admin))[mediaType];
    const reservation = await this.events.reserveUpload({
      campaignId: campaign.globalId,
      userId: command.userId,
      mediaType,
      since: vietnamDayStart(new Date()),
      quota: limit,
      sign: () =>
        withStorageValidation('upload', () =>
          this.storage.createCampaignMediaUpload({
            userId: command.userId,
            contentType: command.contentType,
            contentLength: command.contentLength,
          }),
        ),
    });
    if (reservation.status === 'QUOTA_EXCEEDED')
      throw new CharityPostQuotaExceededException(
        mediaType === 'VIDEO' ? 'clip' : 'ảnh',
        limit,
      );
    const used = await this.events.usedUploads({
      campaignId: campaign.globalId,
      userId: command.userId,
      since: vietnamDayStart(new Date()),
    });
    return {
      upload: reservation.upload,
      quota: { mediaType, used: used[mediaType], limit },
    };
  }
}

@Injectable()
export class CreateCharityPostUseCase implements ICreateCharityPostUseCase {
  public constructor(
    private readonly postAccess: CharityPostAccess,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(ICharityRealtimePublisher)
    private readonly realtime: ICharityRealtimePublisher,
    // Tuỳ chọn để spec dựng tay không phải đổi; Nest luôn tiêm (§3.9).
    @Optional()
    private readonly points?: CharityPointsService,
  ) {}

  public async handle(
    command: ICreateCharityPostCommand,
  ): Promise<ICharityPost> {
    const body = command.body?.trim() || null;
    const keys = [...new Set(command.mediaKeys)];
    const errors: string[] = [];
    if (!body && keys.length === 0)
      errors.push('post: cần nội dung hoặc ít nhất một ảnh/clip');
    if (body && body.length > MaxCharityPostBodyLength)
      errors.push(`post.body: tối đa ${MaxCharityPostBodyLength} ký tự`);
    if (keys.length > MaxCharityPostMedia)
      errors.push(`post.mediaKeys: tối đa ${MaxCharityPostMedia} tệp`);
    if (errors.length > 0) throw new ValidationFailedException(errors);

    const { campaign, role } = await this.postAccess.resolve(
      command.campaignId,
      command.userId,
    );
    if (!role) throw new CharityPostForbiddenException();

    // Xác nhận tệp có thật trên storage và đúng của người này TRƯỚC khi ghi.
    const media: {
      storageKey: string;
      publicUrl: string;
      mediaType: CharityPostMediaType;
    }[] = [];
    for (const key of keys) {
      const confirmed = await withStorageValidation('post.mediaKeys', () =>
        this.storage.confirmCampaignMediaUpload(command.userId, key),
      );
      media.push({
        storageKey: key,
        publicUrl: confirmed.publicUrl,
        mediaType: confirmed.mediaType,
      });
    }

    const post = await this.events.createPost({
      campaignId: campaign.globalId,
      authorId: command.userId,
      authorRole: role,
      stage: campaign.operationStage,
      body,
      media,
    });
    if (post === 'MEDIA_INVALID') throw new CharityPostMediaInvalidException();
    this.realtime.signal(campaign.globalId, ['POSTS'], 'public');
    await this.points?.awardPost({
      postId: post.postId,
      campaignId: campaign.globalId,
      authorId: command.userId,
      authorRole: role,
      videoCount: media.filter((item) => item.mediaType === 'VIDEO').length,
      imageCount: media.filter((item) => item.mediaType === 'IMAGE').length,
    });
    return post;
  }
}

@Injectable()
export class ListCharityPostsUseCase implements IListCharityPostsUseCase {
  public constructor(
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
  ) {}

  public async handle(command: IListCharityPostsCommand) {
    const id = await this.projects.findVisibleCampaignId(command.idOrSlug);
    if (!id) throw new CharityCampaignNotFoundException();
    const limit = Math.min(Math.max(command.limit, 1), 50);
    const rows = await this.events.listPosts({
      campaignId: id,
      beforePostId: command.beforePostId,
      limit: limit + 1,
    });
    const posts = rows.slice(0, limit);
    return {
      posts,
      nextBefore: rows.length > limit ? posts[posts.length - 1].postId : null,
    };
  }
}

/** Tác giả gỡ bài của mình; ban tổ chức, coordinator, Admin gỡ mọi bài của dự án. */
@Injectable()
export class DeleteCharityPostUseCase implements IDeleteCharityPostUseCase {
  public constructor(
    private readonly postAccess: CharityPostAccess,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(ICharityRealtimePublisher)
    private readonly realtime: ICharityRealtimePublisher,
    // Tuỳ chọn để spec dựng tay không phải đổi; Nest luôn tiêm (§3.9).
    @Optional()
    private readonly points?: CharityPointsService,
  ) {}

  public async handle(
    command: IDeleteCharityPostCommand,
  ): Promise<{ deleted: true }> {
    const post = await this.events.findPost(command.postId);
    if (!post || post.campaignId !== command.campaignId || post.deletedAt)
      throw new CharityPostNotFoundException();
    const { isModerator } = await this.postAccess.resolve(
      command.campaignId,
      command.userId,
    );
    if (post.author.userId !== command.userId && !isModerator)
      throw new CharityProjectForbiddenException();
    const deleted = await this.events.deletePost({
      campaignId: command.campaignId,
      postId: command.postId,
      actorId: command.userId,
    });
    if (!deleted) throw new CharityPostNotFoundException();
    this.realtime.signal(command.campaignId, ['POSTS'], 'public');
    await this.points?.revokePost(command.postId);
    return { deleted: true };
  }
}
