import {
  ICharityProjectCommand,
  ICheckInCharityParticipationCommand,
  ICheckInCharityParticipationUseCase,
  IDecideCharityParticipationCommand,
  IDecideCharityParticipationUseCase,
  IGetMyCharityParticipationUseCase,
  IListCharityParticipationsCommand,
  IListCharityParticipationsUseCase,
} from '@/application/contracts/charity-project';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  CharityCampaignNotFoundException,
  CharityParticipationInvalidStateException,
  CharityParticipationNotFoundException,
  CharityProjectNotApprovedException,
} from '@/domain/exceptions';
import { ICharityRealtimePublisher } from '@/domain/ports/realtime';
import {
  ICharityCampaignRepository,
  ICharityParticipation,
  ICharityParticipationRepository,
} from '@/domain/ports/repository';
import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  CharityAttendedParticipationStatuses,
  CharityCheckInFromStatuses,
  CharityParticipationDecisionRules,
  CharityParticipationStatus,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CharityProjectAccess } from './charity-project.use-cases';

const StatusLabels: Readonly<Record<CharityParticipationStatus, string>> = {
  REGISTERED: 'đang chờ duyệt',
  CONFIRMED: 'đã được xác nhận tham gia',
  WAITLISTED: 'đang ở danh sách chờ',
  REJECTED: 'chưa được nhận lần này',
  CHECKED_IN: 'đã check-in tại sự kiện',
  COMPLETED: 'đã hoàn thành',
  NO_SHOW: 'được ghi nhận vắng mặt',
  CANCELLED: 'đã huỷ',
};

/** Báo participant khi ban tổ chức đổi trạng thái lượt tham gia của họ. Lỗi gửi không chặn. */
@Injectable()
export class CharityParticipationNotifier {
  private readonly logger = new Logger(CharityParticipationNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async notify(
    participation: ICharityParticipation,
    campaignTitle: string,
  ): Promise<void> {
    const reason = participation.statusReason
      ? ` Lý do: ${participation.statusReason}`
      : '';
    try {
      await this.dispatch.handle({
        userId: participation.user.userId,
        type: NotificationTypes.CHARITY_PARTICIPATION_UPDATED,
        title: 'Cập nhật đăng ký tham gia',
        body: `Bạn ${StatusLabels[participation.status]} ở dự án "${campaignTitle}".${reason}`,
        referenceType: 'CHARITY_PARTICIPATION',
        referenceId: participation.participationId,
        target: {
          type: NotificationTargetTypes.CHARITY_CAMPAIGN,
          id: participation.campaignId,
        },
        idempotencyKey: `CHARITY_PARTICIPATION_UPDATED:${participation.participationId}:${participation.status}:${participation.statusChangedAt?.toISOString() ?? ''}`,
      });
    } catch (error) {
      this.logger.warn(
        `Không gửi được thông báo lượt tham gia ${participation.participationId}: ${String(error)}`,
      );
    }
  }
}

/** Danh sách participant cho ban tổ chức: người tạo, coordinator, Admin `campaign.read`. */
@Injectable()
export class ListCharityParticipationsUseCase implements IListCharityParticipationsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityParticipationRepository)
    private readonly participations: ICharityParticipationRepository,
  ) {}

  public async handle(command: IListCharityParticipationsCommand) {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    return this.participations.list({
      campaignId: campaign.globalId,
      status: command.status,
    });
  }
}

/**
 * Quyết định của ban tổ chức (§3.11): xác nhận, danh sách chờ, từ chối, vắng mặt, hoàn thành.
 * Từ chối và vắng mặt bắt buộc lý do — participant thấy lý do trong thông báo.
 */
@Injectable()
export class DecideCharityParticipationUseCase implements IDecideCharityParticipationUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityParticipationRepository)
    private readonly participations: ICharityParticipationRepository,
    private readonly notifier: CharityParticipationNotifier,
    @Optional()
    @Inject(ICharityRealtimePublisher)
    private readonly realtime?: ICharityRealtimePublisher,
  ) {}

  public async handle(command: IDecideCharityParticipationCommand) {
    const reason = command.reason?.trim() || null;
    if (
      (command.action === 'REJECT' || command.action === 'NO_SHOW') &&
      !reason
    )
      throw new ValidationFailedException(['decision.reason: bắt buộc']);

    const { campaign } = await this.access.forOperate(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    const current = await this.participations.find(
      campaign.globalId,
      command.participationId,
    );
    if (!current) throw new CharityParticipationNotFoundException();

    const rule = CharityParticipationDecisionRules[command.action];
    if (!rule.from.includes(current.status))
      throw new CharityParticipationInvalidStateException(current.status);
    const updated = await this.participations.transition({
      campaignId: campaign.globalId,
      participationId: current.participationId,
      from: rule.from,
      to: rule.to,
      actorId: command.userId,
      reason,
      checkIn: false,
    });
    if (!updated) {
      // Có người vừa đổi trước — báo trạng thái mới nhất.
      const latest = await this.participations.find(
        campaign.globalId,
        command.participationId,
      );
      throw new CharityParticipationInvalidStateException(
        latest?.status ?? current.status,
      );
    }
    this.realtime?.signal(campaign.globalId, ['PARTICIPANTS'], 'workspace');
    await this.notifier.notify(updated, campaign.title);
    return updated;
  }
}

/**
 * Check-in tại sự kiện (§3.5): mở quyền đăng ảnh/clip sự kiện và chấm mức hoàn thành. Chỉ cho
 * người đã được xác nhận. Lặp lại khi đã check-in trả nguyên trạng — gửi lại sau mất mạng
 * không tạo gì trùng (§3.18).
 */
@Injectable()
export class CheckInCharityParticipationUseCase implements ICheckInCharityParticipationUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityParticipationRepository)
    private readonly participations: ICharityParticipationRepository,
    private readonly notifier: CharityParticipationNotifier,
    @Optional()
    @Inject(ICharityRealtimePublisher)
    private readonly realtime?: ICharityRealtimePublisher,
  ) {}

  public async handle(command: ICheckInCharityParticipationCommand) {
    const { campaign } = await this.access.forOperate(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    const current = await this.participations.find(
      campaign.globalId,
      command.participationId,
    );
    if (!current) throw new CharityParticipationNotFoundException();
    if (CharityAttendedParticipationStatuses.includes(current.status))
      return current;
    if (!CharityCheckInFromStatuses.includes(current.status))
      throw new CharityParticipationInvalidStateException(current.status);

    const updated = await this.participations.transition({
      campaignId: campaign.globalId,
      participationId: current.participationId,
      from: CharityCheckInFromStatuses,
      to: 'CHECKED_IN',
      actorId: command.userId,
      reason: null,
      checkIn: true,
    });
    if (!updated) {
      const latest = await this.participations.find(
        campaign.globalId,
        command.participationId,
      );
      if (
        latest &&
        CharityAttendedParticipationStatuses.includes(latest.status)
      )
        return latest;
      throw new CharityParticipationInvalidStateException(
        latest?.status ?? current.status,
      );
    }
    this.realtime?.signal(campaign.globalId, ['PARTICIPANTS'], 'workspace');
    await this.notifier.notify(updated, campaign.title);
    return updated;
  }
}

@Injectable()
export class GetMyCharityParticipationUseCase implements IGetMyCharityParticipationUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityParticipationRepository)
    private readonly participations: ICharityParticipationRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const campaign = await this.campaigns.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    return this.participations.findByUser(campaign.globalId, command.userId);
  }
}
