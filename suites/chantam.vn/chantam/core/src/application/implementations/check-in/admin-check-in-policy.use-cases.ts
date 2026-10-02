import {
  IGetCheckInPolicyCommand,
  IGetCheckInPolicyResult,
  IGetCheckInPolicyUseCase,
  IPublishCheckInPolicyCommand,
  IPublishCheckInPolicyResult,
  IPublishCheckInPolicyUseCase,
} from '@/application/contracts/check-in';
import {
  IAdminConfigRepository,
  ICheckInPolicyRevision,
  ICheckInRepository,
} from '@/domain/ports/repository';
import { normalizeCheckInPolicy } from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const HistoryLimit = 20;

function toDto(revision: ICheckInPolicyRevision) {
  return {
    version: revision.version,
    enabled: revision.policy.enabled,
    dailyPoints: revision.policy.dailyPoints,
    milestones: [...revision.policy.milestones],
    transactionsPerRepair: revision.policy.transactionsPerRepair,
    repairWindowDays: revision.policy.repairWindowDays,
    effectiveAt: revision.effectiveAt,
    reason: revision.reason,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
  };
}

@Injectable()
export class GetCheckInPolicyUseCase implements IGetCheckInPolicyUseCase {
  public constructor(
    @Inject(ICheckInRepository)
    private readonly checkIns: ICheckInRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetCheckInPolicyCommand,
  ): Promise<IGetCheckInPolicyResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'config.read')))
      throw new ForbiddenException();

    const [active, history] = await Promise.all([
      this.checkIns.getActivePolicy(),
      this.checkIns.listPolicyHistory(HistoryLimit),
    ]);

    return {
      active: active ? toDto(active) : null,
      // Trả cả lịch sử ở cùng endpoint: câu "lúc người này bị từ chối thì ngưỡng
      // là bao nhiêu" là câu Admin cần đúng vào lúc có khiếu nại, và tách thành
      // một endpoint nữa thì nó sẽ không được dựng (đã xảy ra với entitlement).
      history: history.map(toDto),
    };
  }
}

/**
 * Publish một bản policy mới.
 *
 * Không sửa bản cũ: mỗi lần publish là một `version` mới, và bản đang chạy là
 * version lớn nhất đã tới hiệu lực. Nhờ vậy `point_ledger` trỏ được tới đúng bản
 * đã dùng lúc phát điểm, và đổi policy KHÔNG viết lại lịch sử.
 */
@Injectable()
export class PublishCheckInPolicyUseCase implements IPublishCheckInPolicyUseCase {
  public constructor(
    @Inject(ICheckInRepository)
    private readonly checkIns: ICheckInRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IPublishCheckInPolicyCommand,
  ): Promise<IPublishCheckInPolicyResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'config.write')))
      throw new ForbiddenException();

    const input = command.checkInPolicy;
    const reason = input.reason?.trim();
    if (!reason)
      throw new ValidationFailedException(['reason: phải nêu lý do thay đổi']);

    const before = await this.checkIns.getActivePolicy();

    const published = await this.checkIns.publishPolicy({
      actorUserId: command.actorUserId,
      expectedVersion: input.expectedVersion ?? null,
      policy: normalizeCheckInPolicy(input),
      // Bỏ trống thì hiệu lực NGAY. Cho phép hẹn giờ vì Bên A có thể muốn bật
      // tính năng đúng 00:00 một ngày cụ thể, nhưng mặc định không hẹn: một bản
      // publish không ai thấy có hiệu lực là một bản publish trông như thất bại.
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : new Date(),
      reason,
    });

    await this.admin.appendAudit({
      actorUserId: command.actorUserId,
      action: 'PUBLISH_CHECK_IN_POLICY',
      resourceType: 'CHECK_IN_POLICY',
      resourceId: String(published.version),
      before: before ? toDto(before) : null,
      after: toDto(published),
      reason,
    });

    return { policy: toDto(published) };
  }
}
