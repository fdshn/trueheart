import {
  IGetAffiliateEventRewardsCommand,
  IGetAffiliateEventRewardsUseCase,
  IGetAffiliatePolicyCommand,
  IGetAffiliatePolicyResult,
  IGetAffiliatePolicyUseCase,
  IListAffiliateEventsCommand,
  IListAffiliateEventsResult,
  IListAffiliateEventsUseCase,
  IPublishAffiliatePolicyCommand,
  IPublishAffiliatePolicyUseCase,
  IReverseAffiliateEventCommand,
  IReverseAffiliateEventUseCase,
} from '@/application/contracts/affiliate';
import {
  IAdminConfigRepository,
  IAffiliatePolicyRevision,
  IAffiliateRepository,
} from '@/domain/ports/repository';
import { normalizeAffiliatePolicy } from '@chantam.vn/chantam.core-lib/models';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const HistoryLimit = 20;

async function assertPermission(
  admin: IAdminConfigRepository,
  userId: string,
  permission: string,
): Promise<void> {
  if (!(await admin.hasPermission(userId, permission)))
    throw new ForbiddenException();
}

@Injectable()
export class GetAffiliatePolicyUseCase implements IGetAffiliatePolicyUseCase {
  public constructor(
    @Inject(IAffiliateRepository)
    private readonly affiliate: IAffiliateRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAffiliatePolicyCommand,
  ): Promise<IGetAffiliatePolicyResult> {
    await assertPermission(this.admin, command.actorUserId, 'config.read');

    const [active, history] = await Promise.all([
      this.affiliate.getActivePolicy(),
      this.affiliate.listPolicyHistory(HistoryLimit),
    ]);

    return { active, history };
  }
}

@Injectable()
export class PublishAffiliatePolicyUseCase implements IPublishAffiliatePolicyUseCase {
  public constructor(
    @Inject(IAffiliateRepository)
    private readonly affiliate: IAffiliateRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IPublishAffiliatePolicyCommand,
  ): Promise<{ policy: IAffiliatePolicyRevision }> {
    await assertPermission(this.admin, command.actorUserId, 'config.write');

    const reason = command.reason?.trim();
    if (!reason)
      throw new ValidationFailedException(['reason: phải nêu lý do thay đổi']);

    const before = await this.affiliate.getActivePolicy();
    const policy = await this.affiliate.publishPolicy({
      actorUserId: command.actorUserId,
      expectedVersion: command.expectedVersion ?? null,
      policy: normalizeAffiliatePolicy(command.policy),
      effectiveAt: command.effectiveAt
        ? new Date(command.effectiveAt)
        : new Date(),
      reason,
    });

    await this.admin.appendAudit({
      actorUserId: command.actorUserId,
      action: 'PUBLISH_AFFILIATE_POLICY',
      resourceType: 'AFFILIATE_POLICY',
      resourceId: String(policy.version),
      before: before ?? null,
      after: policy,
      reason,
    });

    return { policy };
  }
}

@Injectable()
export class ListAffiliateEventsUseCase implements IListAffiliateEventsUseCase {
  public constructor(
    @Inject(IAffiliateRepository)
    private readonly affiliate: IAffiliateRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAffiliateEventsCommand,
  ): Promise<IListAffiliateEventsResult> {
    // `config.read` chứ không một quyền riêng: đây là đường ĐỌC audit, cùng mức với
    // đọc cấu hình. Dựng thêm một quyền mà không ai gán là làm cả một vai vô nghĩa —
    // bẫy đã bắt ở `21-open-issues` §21.4b.
    await assertPermission(this.admin, command.actorUserId, 'config.read');

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.affiliate.listEvents({
      groupId: command.groupId,
      geoStatus: command.geoStatus,
      skip,
      take,
    });

    return {
      events: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

@Injectable()
export class GetAffiliateEventRewardsUseCase implements IGetAffiliateEventRewardsUseCase {
  public constructor(
    @Inject(IAffiliateRepository)
    private readonly affiliate: IAffiliateRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IGetAffiliateEventRewardsCommand) {
    await assertPermission(this.admin, command.actorUserId, 'config.read');
    return { rewards: await this.affiliate.listRewards(command.eventId) };
  }
}

/**
 * Thu hồi reward của một sự kiện — câu A5.
 *
 * Quyền `point.adjust`, KHÔNG `config.write`: đây là can thiệp vào số điểm của những
 * người cụ thể, cùng loại với `POST /admin/points/adjust` và đường hoàn bút toán.
 * Cấu hình chính sách là việc khác và đã có quyền khác.
 */
@Injectable()
export class ReverseAffiliateEventUseCase implements IReverseAffiliateEventUseCase {
  public constructor(
    @Inject(IAffiliateRepository)
    private readonly affiliate: IAffiliateRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IReverseAffiliateEventCommand) {
    await assertPermission(this.admin, command.actorUserId, 'point.adjust');

    const reason = command.reason?.trim();
    if (!reason)
      throw new ValidationFailedException(['reason: phải nêu lý do thu hồi']);

    const result = await this.affiliate.reverseEvent({
      eventGlobalId: command.eventId,
      actorUserId: command.actorUserId,
      reason,
    });

    // Ghi audit CHỈ KHI thật sự thu hồi được gì — cùng lối đã chọn ở `adjust`: một
    // lượt gọi lại không đổi gì thì không được dựng thêm một dòng lịch sử.
    if (result.reversedCount > 0)
      await this.admin.appendAudit({
        actorUserId: command.actorUserId,
        action: 'REVERSE_AFFILIATE_EVENT',
        resourceType: 'AFFILIATE_EVENT',
        resourceId: command.eventId,
        before: null,
        after: result,
        reason,
      });

    return result;
  }
}
