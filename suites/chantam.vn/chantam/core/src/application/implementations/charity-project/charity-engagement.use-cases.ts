import {
  ICharityExportView,
  ICharityNeedTotals,
  ICharityProjectCommand,
  ICharityRevisionPage,
  ICharityShareLink,
  ICharityTaskView,
  ICreateCharityExportCommand,
  ICreateCharityExportUseCase,
  ICreateCharityShareLinkCommand,
  ICreateCharityShareLinkUseCase,
  IFollowCharityProjectCommand,
  IFollowCharityProjectUseCase,
  IGetCharityExportPdfCommand,
  IGetCharityExportPdfUseCase,
  IGetCharityInternalStatsUseCase,
  IGetCharityPublicStatsUseCase,
  IGetCharityStatsCommand,
  IListCharityExportsUseCase,
  IListCharityRevisionsCommand,
  IListCharityRevisionsUseCase,
  IListCharityTasksUseCase,
  IProcessCharityAnnouncementsResult,
  IProcessCharityAnnouncementsUseCase,
  IUpdateCharityTaskCommand,
  IUpdateCharityTaskUseCase,
} from '@/application/contracts/charity-project';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  CharityCampaignNotFoundException,
  CharityExportNotFoundException,
  CharityProjectNotApprovedException,
  CharitySectionNotPublishedException,
  CharityTaskNotFoundException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { ICharityPdfRenderer } from '@/domain/ports/document';
import {
  ICharityAnnouncement,
  ICharityCampaign,
  ICharityCampaignRepository,
  ICharityEngagementRepository,
  ICharityExport,
  ICharityProjectRepository,
  ICharityTask,
  IContentShareRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  ContentSubjectTypes,
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  CharityOperationStageLabels,
  CharityOperationStages,
  CharityPreEventNoticeHours,
  CharityRevisionEntity,
  CharityTaskLabels,
  charityShareLink,
  defaultTaskSchedule,
  isPubliclyVisibleProject,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CharityProjectAccess,
  buildSectionSnapshot,
} from './charity-project.use-cases';

const toTaskView = (task: ICharityTask): ICharityTaskView => ({
  ...task,
  label: CharityTaskLabels[task.taskKey],
});

/** Dự án hiện ra ngoài theo id hoặc slug — dự án đã đóng vẫn hiện (§3.6), đình chỉ thì không. */
async function findVisible(
  projects: ICharityProjectRepository,
  campaigns: ICharityCampaignRepository,
  idOrSlug: string,
): Promise<ICharityCampaign> {
  const id = await projects.findVisibleCampaignId(idOrSlug);
  const campaign = id ? await campaigns.findByGlobalId(id) : null;
  if (!campaign) throw new CharityCampaignNotFoundException();
  return campaign;
}

/** Checklist có từ khi dự án được duyệt — tạo idempotent ở lượt đọc/ghi đầu tiên. */
async function ensureTasks(
  engagement: ICharityEngagementRepository,
  campaign: ICharityCampaign,
): Promise<void> {
  await engagement.ensureTasks({
    campaignId: campaign.globalId,
    schedule: defaultTaskSchedule({
      endTime: campaign.endTime,
      ...(await engagement.taskScheduleInputs(campaign.globalId)),
    }),
  });
}

// ── Checklist tab B (§3.4) ──────────────────────────────────────────────────

@Injectable()
export class ListCharityTasksUseCase implements IListCharityTasksUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharityTaskView[]> {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    if (campaign.approvalStatus !== 'APPROVED') return [];
    await ensureTasks(this.engagement, campaign);
    return (await this.engagement.listTasks(campaign.globalId)).map(toTaskView);
  }
}

/**
 * Cập nhật một việc: ban tổ chức và coordinator (vận hành). Đổi trạng thái/mốc ghi revision
 * `TASK` trong cùng transaction (§3.4).
 */
@Injectable()
export class UpdateCharityTaskUseCase implements IUpdateCharityTaskUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(
    command: IUpdateCharityTaskCommand,
  ): Promise<ICharityTaskView> {
    const { campaign } = await this.access.forOperate(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    await ensureTasks(this.engagement, campaign);
    const trim = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    const task = await this.engagement.updateTask({
      campaignId: campaign.globalId,
      taskId: command.taskId,
      actorId: command.userId,
      patch: {
        ...command.patch,
        workNote: trim(command.patch.workNote),
        remark: trim(command.patch.remark),
        picName: trim(command.patch.picName),
      },
    });
    if (!task) throw new CharityTaskNotFoundException();
    return toTaskView(task);
  }
}

// ── Lịch sử sửa (§3.3) ──────────────────────────────────────────────────────

/**
 * Changelog. `PUBLIC`: ai cũng xem được trên dự án hiện ra ngoài, chỉ revision công khai, không
 * lộ người sửa. `WORKSPACE`: người có vai với dự án, đủ mọi revision.
 */
@Injectable()
export class ListCharityRevisionsUseCase implements IListCharityRevisionsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(
    command: IListCharityRevisionsCommand,
  ): Promise<ICharityRevisionPage> {
    const limit = Math.min(Math.max(command.limit, 1), 100);
    const publicOnly = command.scope === 'PUBLIC';
    const campaignId = publicOnly
      ? (await findVisible(this.projects, this.campaigns, command.idOrSlug))
          .globalId
      : (await this.access.resolve(command.idOrSlug, command.userId ?? ''))
          .campaign.globalId;
    const revisions = await this.engagement.listRevisions({
      campaignId,
      publicOnly,
      beforeRevisionId: command.beforeRevisionId,
      limit: limit + 1,
    });
    const page = revisions
      .slice(0, limit)
      .map((revision) =>
        publicOnly ? { ...revision, changedBy: null } : revision,
      );
    return {
      revisions: page,
      nextBefore:
        revisions.length > limit ? page[page.length - 1].revisionId : null,
    };
  }
}

// ── Quan tâm (§3.7) ─────────────────────────────────────────────────────────

@Injectable()
export class FollowCharityProjectUseCase implements IFollowCharityProjectUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(command: IFollowCharityProjectCommand) {
    const campaign = await findVisible(
      this.projects,
      this.campaigns,
      command.idOrSlug,
    );
    // Bỏ quan tâm luôn được; quan tâm mới chỉ khi dự án còn chạy — dự án đã đóng không còn
    // thay đổi nào để báo.
    if (command.follow && !campaign.isActive)
      throw new CharityCampaignNotFoundException();
    if (command.follow)
      await this.engagement.follow(campaign.globalId, command.userId);
    else await this.engagement.unfollow(campaign.globalId, command.userId);
    const counters = await this.engagement.counters(campaign.globalId);
    return {
      following: command.follow,
      followerCount: counters.followerCount,
    };
  }
}

// ── Thống kê (§3.7) ─────────────────────────────────────────────────────────

async function needTotals(
  projects: ICharityProjectRepository,
  campaignId: string,
): Promise<ICharityNeedTotals> {
  const [items, funding, volunteers] = await Promise.all([
    projects.listItemNeeds(campaignId),
    projects.listFundingNeeds(campaignId),
    projects.listVolunteerNeeds(campaignId),
  ]);
  const sum = <T>(rows: T[], pick: (row: T) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const activeItems = items.filter((item) => item.isActive);
  return {
    items: {
      target: sum(activeItems, (item) => item.targetQuantity),
      registered: sum(activeItems, (item) => item.registeredQuantity),
      approved: sum(activeItems, (item) => item.approvedQuantity),
      receivedInApp: sum(activeItems, (item) => item.receivedInAppQuantity),
      receivedExternal: sum(
        activeItems,
        (item) => item.receivedExternalQuantity,
      ),
      remaining: sum(activeItems, (item) => item.remainingQuantity),
    },
    funding: {
      target: sum(funding, (need) => need.targetAmount),
      confirmed: sum(funding, (need) => need.confirmedAmount),
      external: sum(funding, (need) => need.externalAmount),
      remaining: sum(funding, (need) => need.remainingAmount),
    },
    volunteers: {
      needed: sum(volunteers, (need) => need.neededCount),
      confirmed: sum(volunteers, (need) => need.confirmedCount),
      remaining: sum(volunteers, (need) => need.remainingCount),
    },
  };
}

/** Chỉ số tổng hợp — không có số báo cáo vi phạm, không có số đề nghị bị từ chối. */
@Injectable()
export class GetCharityPublicStatsUseCase implements IGetCharityPublicStatsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(command: IGetCharityStatsCommand) {
    const campaign = await findVisible(
      this.projects,
      this.campaigns,
      command.idOrSlug,
    );
    const [stats, needs] = await Promise.all([
      this.engagement.internalStats(campaign.globalId),
      needTotals(this.projects, campaign.globalId),
    ]);
    return {
      reactionCount: stats.reactionCount,
      commentCount: stats.commentCount,
      followerCount: stats.followerCount,
      supporterCount: stats.contributions.acceptedContributors,
      participantCount:
        stats.participants.registered + stats.volunteers.confirmed,
      needs,
    };
  }
}

@Injectable()
export class GetCharityInternalStatsUseCase implements IGetCharityInternalStatsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const [stats, needs] = await Promise.all([
      this.engagement.internalStats(campaign.globalId),
      needTotals(this.projects, campaign.globalId),
    ]);
    return { ...stats, needs };
  }
}

// ── Bản in và chia sẻ (§3.13) ───────────────────────────────────────────────

const toExportView = (
  campaignId: string,
  row: ICharityExport,
): ICharityExportView => ({
  exportId: row.exportId,
  sectionKey: row.sectionKey,
  lastRevisionId: row.lastRevisionId,
  generatedBy: row.generatedBy,
  generatedAt: row.generatedAt,
  downloadPath: `/charity-campaigns/${campaignId}/exports/${row.exportId}/pdf`,
});

/**
 * Tạo bản in: chụp nội dung CÔNG KHAI của dự án lúc này (cùng luật với công khai mục — không
 * có SĐT người thụ hưởng, không có ghi chú nội bộ), kèm mã revision cuối và người tạo. Bản in
 * là để in/gửi đi, nên nội dung nội bộ không bao giờ nằm trong đó.
 */
@Injectable()
export class CreateCharityExportUseCase implements ICreateCharityExportUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(
    command: ICreateCharityExportCommand,
  ): Promise<ICharityExportView> {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const id = campaign.globalId;
    const keys = command.sectionKey
      ? [command.sectionKey]
      : [...CharityOperationStages];
    const sections: {
      sectionKey: string;
      label: string;
      content: Record<string, unknown> | null;
    }[] = [];
    for (const sectionKey of keys)
      sections.push({
        sectionKey,
        label: CharityOperationStageLabels[sectionKey],
        content: await buildSectionSnapshot(
          this.projects,
          this.engagement,
          id,
          sectionKey,
        ),
      });
    const [items, funding, volunteers, accounts] = await Promise.all([
      this.projects.listItemNeeds(id),
      this.projects.listFundingNeeds(id),
      this.projects.listVolunteerNeeds(id),
      this.projects.listBankAccounts(id),
    ]);
    const snapshot = {
      title: campaign.title,
      slug: campaign.slug,
      description: campaign.description,
      locationLabel: campaign.locationLabel,
      startTime: campaign.startTime,
      endTime: campaign.endTime,
      operationStage: campaign.operationStage,
      stageLabel: CharityOperationStageLabels[campaign.operationStage],
      sections,
      itemNeeds: items
        .filter((item) => item.isActive)
        .map((item) => ({
          itemName: item.itemName,
          unit: item.unit,
          targetQuantity: item.targetQuantity,
          receivedQuantity:
            item.receivedInAppQuantity + item.receivedExternalQuantity,
          remainingQuantity: item.remainingQuantity,
        })),
      fundingNeeds: funding.map((need) => ({
        title: need.title,
        targetAmount: need.targetAmount,
        confirmedAmount: need.confirmedAmount,
        externalAmount: need.externalAmount,
        remainingAmount: need.remainingAmount,
      })),
      volunteerNeeds: volunteers.map((need) => ({
        title: need.title,
        neededCount: need.neededCount,
        confirmedCount: need.confirmedCount,
        remainingCount: need.remainingCount,
      })),
      bankAccounts: accounts
        .filter((account) => account.validTo === null)
        .map((account) => ({
          bankName: account.bankName,
          accountNo: account.accountNo,
          accountName: account.accountName,
          label: account.label,
        })),
    };
    const created = await this.engagement.createExport({
      campaignId: id,
      sectionKey: command.sectionKey,
      snapshot: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>,
      generatedBy: command.userId,
    });
    return toExportView(id, created);
  }
}

@Injectable()
export class ListCharityExportsUseCase implements IListCharityExportsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    return (await this.engagement.listExports(campaign.globalId, 50)).map(
      (row) => toExportView(campaign.globalId, row),
    );
  }
}

@Injectable()
export class GetCharityExportPdfUseCase implements IGetCharityExportPdfUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(ICharityPdfRenderer)
    private readonly renderer: ICharityPdfRenderer,
  ) {}

  public async handle(command: IGetCharityExportPdfCommand) {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const found = await this.engagement.findExport(
      campaign.globalId,
      command.exportId,
    );
    if (!found) throw new CharityExportNotFoundException();
    const [author] = found.generatedBy
      ? await this.users.findByGlobalIds([found.generatedBy])
      : [];
    const pdf = await this.renderer.render({
      exportId: found.exportId,
      generatedAt: found.generatedAt,
      generatedByName: author ? (author.fullName ?? author.username) : null,
      lastRevisionId: found.lastRevisionId,
      snapshot: found.snapshot,
    });
    return {
      fileName: `du-an-${campaign.slug}-${found.exportId.slice(0, 8)}.pdf`,
      pdf,
    };
  }
}

/**
 * Link chia sẻ công khai (§3.13): cả dự án, hoặc một mục ĐÃ công khai. Ai đăng nhập cũng chia
 * sẻ được; mỗi lượt ghi vào `content_shares` để thống kê đếm được.
 */
@Injectable()
export class CreateCharityShareLinkUseCase implements ICreateCharityShareLinkUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(IContentShareRepository)
    private readonly shares: IContentShareRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: ICreateCharityShareLinkCommand,
  ): Promise<ICharityShareLink> {
    const campaign = await findVisible(
      this.projects,
      this.campaigns,
      command.idOrSlug,
    );
    if (command.sectionKey) {
      const states = await this.projects.listSectionStates(campaign.globalId);
      const state = states.find((row) => row.sectionKey === command.sectionKey);
      if (!state?.publishedAt) throw new CharitySectionNotPublishedException();
    }
    await this.shares.recordShare({
      subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN,
      subjectId: campaign.globalId,
      userId: command.userId,
      channel: command.channel?.trim().slice(0, 40) || null,
    });
    return {
      sectionKey: command.sectionKey,
      ...charityShareLink(
        this.config.web.publicBaseUrl,
        campaign.slug,
        command.sectionKey,
      ),
    };
  }
}

// ── Thông báo theo dự án (§3.10) ────────────────────────────────────────────

const ChangeLabels: Readonly<Record<CharityRevisionEntity, string>> = {
  CAMPAIGN: 'lời kêu gọi',
  PARTY: 'bên thụ hưởng',
  TEAM: 'ban tổ chức',
  PHASE: 'thời gian trao',
  NEED_ITEM: 'địa điểm/hạn nhận hiện vật',
  BANK_ACCOUNT: 'tài khoản nhận tiền',
  FUNDING_NEED: 'mục tiêu kêu gọi tiền',
  VOLUNTEER_NEED: 'lịch/địa điểm tuyển người',
  TASK: 'checklist',
};

const VnDateTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
});

function announcementMessage(
  announcement: ICharityAnnouncement,
  title: string,
): { title: string; body: string } | null {
  const payload = announcement.payload;
  switch (announcement.kind) {
    case 'STAGE_CHANGED':
      return payload.to === 'EVENT'
        ? {
            title: 'Dự án bước sang Sự kiện trao',
            body: `"${title}" đã tới lúc trao. Theo dõi cập nhật trực tiếp trong app.`,
          }
        : {
            title: 'Dự án đã sang Tổng kết',
            body: `"${title}" đã trao xong. Tổng kết sẽ hiện khi ban tổ chức công khai.`,
          };
    case 'PLAN_CHANGED': {
      const changes = Array.isArray(payload.changes)
        ? (payload.changes as { entity: CharityRevisionEntity }[])
        : [];
      const labels = [
        ...new Set(changes.map((change) => ChangeLabels[change.entity])),
      ].filter(Boolean);
      return {
        title: 'Kế hoạch dự án có thay đổi',
        body: `"${title}" vừa cập nhật ${labels.join(', ') || 'kế hoạch'}. Phần thay đổi được tô đỏ trong dự án.`,
      };
    }
    case 'PRE_EVENT': {
      const startsAt = new Date(String(payload.distributionStartsAt));
      return {
        title: 'Sắp tới lúc trao',
        body: `"${title}" sẽ trao lúc ${Number.isNaN(startsAt.getTime()) ? 'sắp tới' : VnDateTime.format(startsAt)}. Chuẩn bị cùng ban tổ chức nhé.`,
      };
    }
    case 'SUMMARY_PUBLISHED':
      return {
        title: 'Dự án đã công khai tổng kết',
        body: `"${title}" đã công khai tổng kết. Cảm ơn bạn đã đồng hành.`,
      };
    default:
      return null;
  }
}

/**
 * Job `charity:notify` (cron 5 phút): xếp nhắc 48 giờ cho dự án sắp trao, rồi gửi mọi thông
 * báo đang chờ trong outbox. Mỗi người nhận một khoá chống trùng theo (thông báo, người) —
 * job chết giữa chừng chạy lại không gửi đôi.
 */
@Injectable()
export class ProcessCharityAnnouncementsUseCase implements IProcessCharityAnnouncementsUseCase {
  private readonly logger = new Logger(ProcessCharityAnnouncementsUseCase.name);

  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async handle(command: {
    dryRun: boolean;
    limit: number;
  }): Promise<IProcessCharityAnnouncementsResult> {
    const candidates = await this.engagement.listPreEventCandidates({
      hours: CharityPreEventNoticeHours,
      limit: command.limit,
    });
    if (command.dryRun)
      return { preEventQueued: candidates.length, processed: 0, notified: 0 };

    let preEventQueued = 0;
    for (const candidate of candidates)
      if (
        await this.engagement.enqueueAnnouncement({
          campaignId: candidate.campaignId,
          kind: 'PRE_EVENT',
          payload: {
            distributionStartsAt: candidate.distributionStartsAt.toISOString(),
          },
          dedupeKey: String(candidate.distributionStartsAt.getTime()),
          actorId: null,
        })
      )
        preEventQueued += 1;

    let notified = 0;
    const processed = await this.engagement.processPendingAnnouncements(
      command.limit,
      async (announcement) => {
        const campaign = await this.campaigns.findByGlobalId(
          announcement.campaignId,
        );
        // Dự án đã xoá hoặc bị đình chỉ sau khi xếp: đánh dấu xong, không báo ai.
        if (!campaign || !isPubliclyVisibleProject(campaign, new Date()))
          return 0;
        const message = announcementMessage(announcement, campaign.title);
        if (!message) return 0;
        const kind = announcement.kind;
        // Phần chung của lệnh gửi, ghi đủ bốn loại và đích tường minh tại đây để phép quét
        // đích thông báo (notification-target-guard.spec) thấy chúng.
        const common = {
          type:
            kind === 'STAGE_CHANGED'
              ? NotificationTypes.CHARITY_STAGE_CHANGED
              : kind === 'PLAN_CHANGED'
                ? NotificationTypes.CHARITY_PLAN_CHANGED
                : kind === 'PRE_EVENT'
                  ? NotificationTypes.CHARITY_PRE_EVENT_NOTICE
                  : NotificationTypes.CHARITY_SUMMARY_PUBLISHED,
          referenceType: 'CHARITY_CAMPAIGN',
          referenceId: campaign.globalId,
          target: {
            type: NotificationTargetTypes.CHARITY_CAMPAIGN,
            id: campaign.globalId,
          },
        };
        const audience = await this.engagement.listAudience({
          campaignId: campaign.globalId,
          excludeUserId: announcement.actorId,
        });
        let sent = 0;
        for (const userId of audience) {
          try {
            await this.dispatch.handle({
              ...common,
              userId,
              title: message.title,
              body: message.body,
              idempotencyKey: `${common.type}:${announcement.announcementId}:${userId}`,
            });
            sent += 1;
          } catch (error) {
            this.logger.warn(
              `Không gửi được ${common.type} cho ${userId}: ${String(error)}`,
            );
          }
        }
        notified += sent;
        return sent;
      },
    );
    return { preEventQueued, processed, notified };
  }
}
