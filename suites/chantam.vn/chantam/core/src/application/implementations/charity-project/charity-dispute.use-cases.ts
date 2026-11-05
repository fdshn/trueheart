import {
  ICloseCharityDisputeCommand,
  ICloseCharityDisputeUseCase,
  IListCharityDisputesCommand,
  IListCharityDisputesUseCase,
  IOpenCharityDisputeCommand,
  IOpenCharityDisputeUseCase,
} from '@/application/contracts/charity-project';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  CharityContributionNotFoundException,
  CharityDisputeAlreadyOpenException,
  CharityDisputeInvalidStateException,
  CharityDisputeNotAllowedException,
  CharityDisputeNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICharityCampaignRepository,
  ICharityContributionParties,
  ICharityDispute,
  ICharityOperationsRepository,
} from '@/domain/ports/repository';
import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  CharityDisputableContributionStatuses,
  CharityDisputeReasonLabels,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';

/** Admin xử tranh chấp cùng quyền xử báo cáo vi phạm. */
const ResolvePermission = 'report.resolve';
const ReadPermission = 'campaign.read';

const isHttpsUrl = (value: string): boolean => /^https:\/\/\S+$/.test(value);

/** Người gọi đứng ở phía nào của đóng góp. */
async function partyOf(
  parties: ICharityContributionParties,
  userId: string,
  campaigns: ICharityCampaignRepository,
): Promise<'CONTRIBUTOR' | 'ORGANIZER' | null> {
  if (parties.contributorId === userId) return 'CONTRIBUTOR';
  if (parties.campaignCreatedBy === userId) return 'ORGANIZER';
  return (await campaigns.isCampaignManager(parties.campaignId, userId))
    ? 'ORGANIZER'
    : null;
}

const ActionLabels = {
  OPEN: 'mở tranh chấp',
  RESOLVED: 'giải quyết tranh chấp',
  WITHDRAWN: 'rút tranh chấp',
} as const;

/** Báo bên kia của tranh chấp. Lỗi gửi không chặn. */
@Injectable()
export class CharityDisputeNotifier {
  private readonly logger = new Logger(CharityDisputeNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async notify(
    dispute: ICharityDispute,
    parties: ICharityContributionParties,
    actorId: string,
  ): Promise<void> {
    const recipients = [
      parties.contributorId,
      parties.campaignCreatedBy,
    ].filter(
      (userId, index, all) =>
        userId !== actorId && all.indexOf(userId) === index,
    );
    const what = ActionLabels[dispute.status];
    const detail =
      dispute.status === 'RESOLVED' && dispute.resolution
        ? ` Kết luận: ${dispute.resolution}`
        : dispute.status === 'OPEN'
          ? ` Lý do: ${CharityDisputeReasonLabels[dispute.reason]}.`
          : '';
    for (const userId of recipients)
      try {
        await this.dispatch.handle({
          userId,
          type: NotificationTypes.CHARITY_CONTRIBUTION_DISPUTE_UPDATED,
          title: 'Tranh chấp đóng góp',
          body: `Dự án "${parties.campaignTitle}": có người vừa ${what} về một đóng góp.${detail}`,
          referenceType: 'CHARITY_CONTRIBUTION_DISPUTE',
          referenceId: dispute.disputeId,
          target: {
            type: NotificationTargetTypes.CHARITY_CAMPAIGN,
            id: parties.campaignId,
          },
          idempotencyKey: `CHARITY_CONTRIBUTION_DISPUTE_UPDATED:${dispute.disputeId}:${dispute.status}:${userId}`,
        });
      } catch (error) {
        this.logger.warn(
          `Không gửi được thông báo tranh chấp ${dispute.disputeId}: ${String(error)}`,
        );
      }
  }
}

/** Người đóng góp hoặc ban tổ chức mở tranh chấp về một đóng góp đã được chấp nhận. */
@Injectable()
export class OpenCharityDisputeUseCase implements IOpenCharityDisputeUseCase {
  public constructor(
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    private readonly notifier: CharityDisputeNotifier,
  ) {}

  public async handle(command: IOpenCharityDisputeCommand) {
    const description = command.description.trim();
    const errors: string[] = [];
    if (description.length < 10)
      errors.push('dispute.description: tối thiểu 10 ký tự');
    if (command.evidenceUrls.some((url) => !isHttpsUrl(url)))
      errors.push('dispute.evidenceUrls: phải là https://');
    if (errors.length > 0) throw new ValidationFailedException(errors);

    const parties = await this.operations.findContributionParties(
      command.contributionId,
    );
    if (!parties) throw new CharityContributionNotFoundException();
    const party = await partyOf(parties, command.userId, this.campaigns);
    if (!party) throw new CharityContributionNotFoundException();
    if (
      !(CharityDisputableContributionStatuses as readonly string[]).includes(
        parties.status,
      )
    )
      throw new CharityDisputeNotAllowedException(
        'chỉ đóng góp đã được chấp nhận mới mở tranh chấp được',
      );

    const dispute = await this.operations.openDispute({
      campaignId: parties.campaignId,
      contributionId: parties.contributionId,
      openedBy: command.userId,
      party,
      reason: command.reason,
      description,
      evidenceUrls: command.evidenceUrls,
    });
    if (dispute === 'ALREADY_OPEN')
      throw new CharityDisputeAlreadyOpenException();
    await this.notifier.notify(dispute, parties, command.userId);
    return dispute;
  }
}

@Injectable()
export class ListCharityDisputesUseCase implements IListCharityDisputesUseCase {
  public constructor(
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IListCharityDisputesCommand) {
    if (command.contributionId) {
      const parties = await this.operations.findContributionParties(
        command.contributionId,
      );
      if (!parties) throw new CharityContributionNotFoundException();
      const party = await partyOf(parties, command.userId, this.campaigns);
      if (
        !party &&
        !(await this.admin.hasPermission(command.userId, ReadPermission))
      )
        throw new CharityContributionNotFoundException();
      return this.operations.listDisputes({
        campaignId: null,
        contributionId: parties.contributionId,
        status: command.status,
      });
    }
    const campaign = command.campaignId
      ? await this.campaigns.findByGlobalId(command.campaignId)
      : null;
    if (!campaign) throw new CharityDisputeNotFoundException();
    const allowed =
      campaign.createdBy === command.userId ||
      (await this.campaigns.isCampaignManager(
        campaign.globalId,
        command.userId,
      )) ||
      (await this.admin.hasPermission(command.userId, ReadPermission));
    if (!allowed) throw new CharityDisputeNotFoundException();
    return this.operations.listDisputes({
      campaignId: campaign.globalId,
      contributionId: null,
      status: command.status,
    });
  }
}

/**
 * Giải quyết: bên KIA của người mở (người đóng góp ↔ ban tổ chức) hoặc Admin `report.resolve`,
 * bắt buộc kết luận. Rút: chỉ người mở.
 */
@Injectable()
export class CloseCharityDisputeUseCase implements ICloseCharityDisputeUseCase {
  public constructor(
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    private readonly notifier: CharityDisputeNotifier,
  ) {}

  public async handle(command: ICloseCharityDisputeCommand) {
    const resolution = command.resolution?.trim() || null;
    if (command.action === 'RESOLVE' && !resolution)
      throw new ValidationFailedException(['decision.resolution: bắt buộc']);
    const dispute = await this.operations.findDispute(command.disputeId);
    if (!dispute) throw new CharityDisputeNotFoundException();
    const parties = await this.operations.findContributionParties(
      dispute.contributionId,
    );
    if (!parties) throw new CharityDisputeNotFoundException();
    const party = await partyOf(parties, command.userId, this.campaigns);
    const isAdmin = await this.admin.hasPermission(
      command.userId,
      ResolvePermission,
    );
    if (!party && !isAdmin) throw new CharityDisputeNotFoundException();
    if (dispute.status !== 'OPEN')
      throw new CharityDisputeInvalidStateException(dispute.status);

    if (command.action === 'WITHDRAW') {
      if (dispute.openedBy !== command.userId)
        throw new CharityDisputeNotAllowedException(
          'chỉ người mở tranh chấp mới rút được',
        );
    } else if (!isAdmin && party === dispute.openedByParty)
      // Bên mở không tự kết luận cho mình — bên kia hoặc Admin.
      throw new CharityDisputeNotAllowedException(
        'bên mở không tự kết luận — bên kia hoặc Admin giải quyết',
      );

    const closed = await this.operations.closeDispute({
      disputeId: dispute.disputeId,
      to: command.action === 'WITHDRAW' ? 'WITHDRAWN' : 'RESOLVED',
      actorId: command.userId,
      resolution: command.action === 'RESOLVE' ? resolution : null,
    });
    if (!closed) {
      const latest = await this.operations.findDispute(dispute.disputeId);
      throw new CharityDisputeInvalidStateException(latest?.status ?? 'OPEN');
    }
    await this.notifier.notify(closed, parties, command.userId);
    return closed;
  }
}
