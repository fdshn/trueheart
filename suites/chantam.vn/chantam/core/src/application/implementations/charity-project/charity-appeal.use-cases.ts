import {
  IActOnCharityAppealCommand,
  IActOnCharityAppealUseCase,
  ICharityAppealDetail,
  ICharityProjectCommand,
  IDecideAdminCharityAppealCommand,
  IDecideAdminCharityAppealUseCase,
  IGetCharityAppealCommand,
  IGetCharityAppealUseCase,
  IListAdminCharityAppealsUseCase,
  IListCharityAppealsUseCase,
  IListMyCharityAppealsUseCase,
  IProcessCharityAppealSlaUseCase,
  IProcessCharityPointsUseCase,
  ISubmitCharityAppealCommand,
  ISubmitCharityAppealUseCase,
} from '@/application/contracts/charity-project';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  CharityAppealConflictOfInterestException,
  CharityAppealDuplicatedException,
  CharityAppealInvalidStateException,
  CharityAppealNotAllowedException,
  CharityAppealNotFoundException,
  CharityAppealRateLimitedException,
  CharityAppealWindowClosedException,
  CharityProjectForbiddenException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICharityAppeal,
  ICharityAppealRepository,
  ICharityCampaignRepository,
  ICharityPointsRepository,
  ICharitySummaryRepository,
} from '@/domain/ports/repository';
import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  CharityAppealAutoCloseDaysConfigKey,
  CharityAppealOrganizerSlaDaysConfigKey,
  CharityAppealStatus,
  CharityAppealWindowDaysConfigKey,
  DefaultCharityAppealAutoCloseDays,
  DefaultCharityAppealOrganizerSlaDays,
  DefaultCharityAppealWindowDays,
  MaxCharityAppealsPerDay,
  isValidAppealValue,
  normalizeNonNegativeInt,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CharityPointsService } from './charity-points.service';
import { CharityProjectAccess } from './charity-project.use-cases';

const Day = 86_400_000;
const ReadPermission = 'report.read';
const ResolvePermission = 'report.resolve';
const UrlPattern = /^https:\/\/\S+$/;

async function configDays(
  admin: IAdminConfigRepository,
  key: string,
  fallback: number,
): Promise<number> {
  return normalizeNonNegativeInt(
    await admin.getConfigValue(key),
    fallback,
    365,
  );
}

/** Thông báo hai bên (§3.16 mục 8) — nuốt lỗi như mọi notifier sau commit. */
@Injectable()
export class CharityAppealNotifier {
  private readonly logger = new Logger(CharityAppealNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
  ) {}

  public async notify(
    appeal: ICharityAppeal,
    audience: 'APPELLANT' | 'ORGANIZER' | 'BOTH',
    step: string,
  ): Promise<void> {
    const campaign = await this.campaigns
      .findByGlobalId(appeal.campaignId)
      .catch(() => null);
    const recipients = [
      ...(audience !== 'ORGANIZER' ? [appeal.appellantId] : []),
      ...(audience !== 'APPELLANT' && campaign?.createdBy
        ? [campaign.createdBy]
        : []),
    ];
    for (const userId of recipients)
      try {
        await this.dispatch.handle({
          userId,
          type: NotificationTypes.CHARITY_APPEAL_UPDATED,
          title: 'Khiếu nại có cập nhật',
          body: `Khiếu nại ở dự án "${appeal.campaignTitle}": ${step}.`,
          referenceType: 'CHARITY_APPEAL',
          referenceId: appeal.appealId,
          target: {
            type: NotificationTargetTypes.CHARITY_CAMPAIGN,
            id: appeal.campaignId,
          },
          idempotencyKey: `CHARITY_APPEAL_UPDATED:${appeal.appealId}:${appeal.status}:${appeal.tier}:${userId}`,
        });
      } catch (error) {
        this.logger.warn(
          `Không gửi được thông báo khiếu nại ${appeal.appealId}: ${String(error)}`,
        );
      }
  }
}

/**
 * Áp giá trị mới sau quyết định điều chỉnh — chấm lại (lần chấm mới, nguồn APPEAL/ADMIN) hoặc
 * giá trị giao nhận đã điều chỉnh — rồi điểm theo giá trị mới (bút toán chênh, không sửa cũ).
 */
@Injectable()
export class CharityAppealValueApplier {
  public constructor(
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
    @Inject(ICharityPointsRepository)
    private readonly points: ICharityPointsRepository,
    private readonly pointsService: CharityPointsService,
  ) {}

  public async apply(
    appeal: ICharityAppeal,
    value: number,
    actorId: string,
    source: 'APPEAL' | 'ADMIN',
  ): Promise<void> {
    if (appeal.targetType === 'EVALUATION') {
      const evaluation = await this.summaries.addEvaluation({
        campaignId: appeal.campaignId,
        participantId: appeal.appellantId,
        completionScore: value,
        note: `Điều chỉnh qua khiếu nại ${appeal.appealId}`,
        evaluatedBy: actorId,
        source,
      });
      await this.pointsService.awardParticipation({
        campaignId: appeal.campaignId,
        participantId: appeal.appellantId,
        completionScore: evaluation.completionScore,
      });
      return;
    }
    await this.points.setDeliveryAdjustedValue({
      deliveryId: appeal.targetId,
      value,
    });
    await this.pointsService.awardItemValue(appeal.targetId);
  }
}

/**
 * Gửi khiếu nại (§3.16): chỉ chính người bị đánh giá, với lần đánh giá HIỆN HÀNH của mình (hoặc
 * giá trị xác nhận lượt giao nhận của mình), trong N ngày; một khiếu nại mỗi đối tượng.
 */
@Injectable()
export class SubmitCharityAppealUseCase implements ISubmitCharityAppealUseCase {
  public constructor(
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
    @Inject(ICharityPointsRepository)
    private readonly points: ICharityPointsRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    private readonly notifier: CharityAppealNotifier,
  ) {}

  public async handle(command: ISubmitCharityAppealCommand) {
    const description = command.description.trim();
    const errors: string[] = [];
    if (description.length < 10)
      errors.push('appeal.description: ít nhất 10 ký tự');
    if (
      command.requestedValue !== null &&
      !isValidAppealValue(command.targetType, command.requestedValue)
    )
      errors.push('appeal.requestedValue: không hợp lệ');
    command.evidenceUrls.forEach((url, index) => {
      if (!UrlPattern.test(url))
        errors.push(`appeal.evidenceUrls[${index}]: phải là URL https`);
    });
    if (errors.length > 0) throw new ValidationFailedException(errors);

    if (
      (await this.appeals.countSince(
        command.userId,
        new Date(Date.now() - Day),
      )) >= MaxCharityAppealsPerDay
    )
      throw new CharityAppealRateLimitedException();

    let original: number;
    let decidedAt: Date;
    if (command.targetType === 'EVALUATION') {
      const evaluation = await this.appeals.findEvaluationTarget(
        command.targetId,
      );
      if (
        !evaluation ||
        evaluation.campaignId !== command.campaignId ||
        evaluation.participantId !== command.userId ||
        !evaluation.isLatest
      )
        throw new CharityAppealNotAllowedException();
      original = evaluation.completionScore;
      decidedAt = evaluation.createdAt;
    } else {
      const delivery = await this.points.deliveryValue(command.targetId);
      if (
        !delivery ||
        delivery.campaignId !== command.campaignId ||
        delivery.contributorId !== command.userId
      )
        throw new CharityAppealNotAllowedException();
      original = delivery.confirmedValue;
      decidedAt = delivery.completedAt;
    }

    const windowDays = await configDays(
      this.admin,
      CharityAppealWindowDaysConfigKey,
      DefaultCharityAppealWindowDays,
    );
    if (Date.now() - decidedAt.getTime() > windowDays * Day)
      throw new CharityAppealWindowClosedException(windowDays);

    const slaDays = await configDays(
      this.admin,
      CharityAppealOrganizerSlaDaysConfigKey,
      DefaultCharityAppealOrganizerSlaDays,
    );
    const created = await this.appeals.create({
      campaignId: command.campaignId,
      appellantId: command.userId,
      targetType: command.targetType,
      targetId: command.targetId,
      originalValue: original,
      requestedValue: command.requestedValue,
      description,
      evidenceUrls: command.evidenceUrls,
      organizerDueAt: new Date(Date.now() + slaDays * Day),
    });
    if (created === 'DUPLICATED') throw new CharityAppealDuplicatedException();
    await this.notifier.notify(
      created,
      'ORGANIZER',
      'có khiếu nại mới cần xét',
    );
    return created;
  }
}

/** Ban tổ chức/coordinator/Admin đọc khiếu nại của dự án. */
@Injectable()
export class ListCharityAppealsUseCase implements IListCharityAppealsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    return this.appeals.listByCampaign(campaign.globalId);
  }
}

@Injectable()
export class ListMyCharityAppealsUseCase implements IListMyCharityAppealsUseCase {
  public constructor(
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
  ) {}

  public async handle(command: { userId: string }) {
    return this.appeals.listByAppellant(command.userId);
  }
}

/** Chi tiết + nhật ký: người khiếu nại, người có vai với dự án, Admin `report.read`. */
@Injectable()
export class GetCharityAppealUseCase implements IGetCharityAppealUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetCharityAppealCommand,
  ): Promise<ICharityAppealDetail> {
    const appeal = await this.appeals.find(command.appealId);
    if (!appeal) throw new CharityAppealNotFoundException();
    if (
      appeal.appellantId !== command.userId &&
      !(await this.admin.hasPermission(command.userId, ReadPermission))
    )
      await this.access.resolve(appeal.campaignId, command.userId).catch(() => {
        throw new CharityAppealNotFoundException();
      });
    return { appeal, events: await this.appeals.listEvents(appeal.appealId) };
  }
}

/**
 * Tầng 1 (§3.16): ban tổ chức ADJUST/KEEP (người đã chấm không tự xét nếu ban tổ chức còn
 * người khác); người khiếu nại ACCEPT hoặc ESCALATE lên Admin.
 */
@Injectable()
export class ActOnCharityAppealUseCase implements IActOnCharityAppealUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
    @Inject(ICharityPointsRepository)
    private readonly points: ICharityPointsRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    private readonly applier: CharityAppealValueApplier,
    private readonly notifier: CharityAppealNotifier,
  ) {}

  public async handle(command: IActOnCharityAppealCommand) {
    const appeal = await this.appeals.find(command.appealId);
    if (!appeal) throw new CharityAppealNotFoundException();
    const reason = command.reason?.trim() || null;

    if (command.action === 'ACCEPT' || command.action === 'ESCALATE') {
      if (appeal.appellantId !== command.userId)
        throw new CharityAppealNotFoundException();
      this.expect(appeal, 'AWAITING_APPELLANT');
      const accepted = command.action === 'ACCEPT';
      const next = await this.appeals.transition({
        appealId: appeal.appealId,
        expected: 'AWAITING_APPELLANT',
        next: accepted ? 'CLOSED' : 'ADMIN_REVIEW',
        action: accepted ? 'APPELLANT_ACCEPT' : 'APPELLANT_ESCALATE',
        actorId: command.userId,
        value: null,
        reason,
        tier: accepted ? undefined : 2,
        outcome: accepted
          ? appeal.organizerDecision === 'ADJUST'
            ? 'ADJUSTED_ACCEPTED'
            : 'KEPT_ACCEPTED'
          : null,
      });
      if (!next) throw new CharityAppealInvalidStateException(appeal.status);
      await this.notifier.notify(
        next,
        'ORGANIZER',
        accepted
          ? 'người khiếu nại đã chấp nhận quyết định'
          : 'người khiếu nại chuyển lên Admin',
      );
      return next;
    }

    // Ban tổ chức xét tầng 1.
    const { campaign } = await this.access.forOperate({
      userId: command.userId,
      campaignId: appeal.campaignId,
    });
    this.expect(appeal, 'ORGANIZER_REVIEW');
    if (!reason)
      throw new ValidationFailedException(['decision.reason: bắt buộc']);
    if (
      command.action === 'ADJUST' &&
      (command.value === null ||
        !isValidAppealValue(appeal.targetType, command.value))
    )
      throw new ValidationFailedException(['decision.value: không hợp lệ']);

    const judge =
      appeal.targetType === 'EVALUATION'
        ? (await this.appeals.findEvaluationTarget(appeal.targetId))
            ?.evaluatedBy
        : (await this.points.deliveryValue(appeal.targetId))?.completedBy;
    if (
      judge === command.userId &&
      (await this.appeals.countOtherOperators(
        campaign.globalId,
        command.userId,
      )) > 0
    )
      throw new CharityAppealConflictOfInterestException();

    const autoCloseDays = await configDays(
      this.admin,
      CharityAppealAutoCloseDaysConfigKey,
      DefaultCharityAppealAutoCloseDays,
    );
    const next = await this.appeals.transition({
      appealId: appeal.appealId,
      expected: 'ORGANIZER_REVIEW',
      next: 'AWAITING_APPELLANT',
      action:
        command.action === 'ADJUST' ? 'ORGANIZER_ADJUST' : 'ORGANIZER_KEEP',
      actorId: command.userId,
      value: command.action === 'ADJUST' ? command.value : null,
      reason,
      organizerDecision: command.action === 'ADJUST' ? 'ADJUST' : 'KEEP',
      appellantDueAt: new Date(Date.now() + autoCloseDays * Day),
    });
    if (!next) throw new CharityAppealInvalidStateException(appeal.status);
    // Điều chỉnh có hiệu lực ngay (điểm không bị treo — §3.16 mục 5).
    if (command.action === 'ADJUST')
      await this.applier.apply(next, command.value!, command.userId, 'APPEAL');
    await this.notifier.notify(
      next,
      'APPELLANT',
      command.action === 'ADJUST'
        ? 'ban tổ chức đã điều chỉnh'
        : 'ban tổ chức giữ nguyên',
    );
    return next;
  }

  private expect(appeal: ICharityAppeal, status: CharityAppealStatus) {
    if (appeal.status !== status)
      throw new CharityAppealInvalidStateException(appeal.status);
  }
}

@Injectable()
export class ListAdminCharityAppealsUseCase implements IListAdminCharityAppealsUseCase {
  public constructor(
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: {
    userId: string;
    status: CharityAppealStatus | null;
    page: number;
    pageSize: number;
  }) {
    if (!(await this.admin.hasPermission(command.userId, ReadPermission)))
      throw new CharityProjectForbiddenException();
    const pageSize = Math.min(Math.max(command.pageSize, 1), 100);
    return this.appeals.listForAdmin({
      status: command.status,
      limit: pageSize,
      offset: (Math.max(command.page, 1) - 1) * pageSize,
    });
  }
}

/** Tầng 2 — Admin `report.resolve` quyết cuối; hoặc mở lại khiếu nại đã đóng (có lý do). */
@Injectable()
export class DecideAdminCharityAppealUseCase implements IDecideAdminCharityAppealUseCase {
  public constructor(
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    private readonly applier: CharityAppealValueApplier,
    private readonly notifier: CharityAppealNotifier,
  ) {}

  public async handle(command: IDecideAdminCharityAppealCommand) {
    if (!(await this.admin.hasPermission(command.userId, ResolvePermission)))
      throw new CharityProjectForbiddenException();
    const appeal = await this.appeals.find(command.appealId);
    if (!appeal) throw new CharityAppealNotFoundException();
    const reason = command.reason.trim();
    if (!reason)
      throw new ValidationFailedException(['decision.reason: bắt buộc']);

    if (command.action === 'REOPEN') {
      const reopened = await this.appeals.transition({
        appealId: appeal.appealId,
        expected: 'CLOSED',
        next: 'ADMIN_REVIEW',
        action: 'ADMIN_REOPEN',
        actorId: command.userId,
        value: null,
        reason,
        tier: 2,
        outcome: null,
      });
      if (!reopened)
        throw new CharityAppealInvalidStateException(appeal.status);
      await this.notifier.notify(reopened, 'BOTH', 'Admin mở lại khiếu nại');
      return reopened;
    }

    if (
      command.action === 'ADJUST' &&
      (command.value === null ||
        !isValidAppealValue(appeal.targetType, command.value))
    )
      throw new ValidationFailedException(['decision.value: không hợp lệ']);
    const next = await this.appeals.transition({
      appealId: appeal.appealId,
      expected: 'ADMIN_REVIEW',
      next: 'CLOSED',
      action: `ADMIN_${command.action}`,
      actorId: command.userId,
      value: command.action === 'ADJUST' ? command.value : null,
      reason,
      adminDecision: command.action,
      outcome:
        command.action === 'ADJUST'
          ? 'ADMIN_ADJUSTED'
          : command.action === 'KEEP'
            ? 'ADMIN_KEPT'
            : 'ADMIN_REJECTED',
    });
    if (!next) throw new CharityAppealInvalidStateException(appeal.status);
    if (command.action === 'ADJUST')
      await this.applier.apply(next, command.value!, command.userId, 'ADMIN');
    await this.notifier.notify(next, 'BOTH', 'Admin đã quyết định cuối');
    return next;
  }
}

/**
 * Job `charity:appeal-sla`: ban tổ chức quá M ngày không xét → tự chuyển Admin; người khiếu
 * nại im lặng quá K ngày sau quyết định tầng 1 → đóng (coi như chấp nhận).
 */
@Injectable()
export class ProcessCharityAppealSlaUseCase implements IProcessCharityAppealSlaUseCase {
  public constructor(
    @Inject(ICharityAppealRepository)
    private readonly appeals: ICharityAppealRepository,
    private readonly notifier: CharityAppealNotifier,
  ) {}

  public async handle(command: { dryRun: boolean; limit: number }) {
    const overdue = await this.appeals.listOverdue(new Date(), command.limit);
    if (command.dryRun)
      return { escalated: 0, autoClosed: 0, overdue: overdue.length };
    let escalated = 0;
    let autoClosed = 0;
    for (const appeal of overdue) {
      if (appeal.status === 'ORGANIZER_REVIEW') {
        const next = await this.appeals.transition({
          appealId: appeal.appealId,
          expected: 'ORGANIZER_REVIEW',
          next: 'ADMIN_REVIEW',
          action: 'AUTO_ESCALATE',
          actorId: null,
          value: null,
          reason: 'Ban tổ chức quá hạn xét',
          tier: 2,
          outcome: null,
        });
        if (next) {
          escalated += 1;
          await this.notifier.notify(
            next,
            'BOTH',
            'quá hạn tầng 1, đã chuyển Admin',
          );
        }
      } else {
        const next = await this.appeals.transition({
          appealId: appeal.appealId,
          expected: 'AWAITING_APPELLANT',
          next: 'CLOSED',
          action: 'AUTO_CLOSE',
          actorId: null,
          value: null,
          reason: 'Người khiếu nại không phản hồi trong hạn',
          outcome: 'AUTO_CLOSED',
        });
        if (next) {
          autoClosed += 1;
          await this.notifier.notify(
            next,
            'BOTH',
            'đã đóng vì quá hạn phản hồi',
          );
        }
      }
    }
    return { escalated, autoClosed, overdue: overdue.length };
  }
}

/** Job `charity:points`: vá award thiếu, đưa bài đã gỡ/ẩn về 0, ghi tiếp phần hoãn. */
@Injectable()
export class ProcessCharityPointsUseCase implements IProcessCharityPointsUseCase {
  public constructor(
    private readonly pointsService: CharityPointsService,
    @Inject(ICharityPointsRepository)
    private readonly points: ICharityPointsRepository,
  ) {}

  public async handle(command: { dryRun: boolean; limit: number }) {
    if (command.dryRun) {
      const itemRule = await this.points.findRule('CHARITY_ITEM_VALUE');
      const [missing, pending] = await Promise.all([
        itemRule?.isEnabled
          ? this.points.listDeliveriesWithoutAward(30, command.limit)
          : Promise.resolve([]),
        this.points.listUnsettled(command.limit),
      ]);
      return {
        backfilled: missing.length,
        zeroed: 0,
        settled: pending.length,
        applied: 0,
        deferred: 0,
      };
    }
    return this.pointsService.settlePending(command.limit);
  }
}
