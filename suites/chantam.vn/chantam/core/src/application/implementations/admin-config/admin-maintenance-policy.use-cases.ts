import {
  IPublishAdminMaintenancePolicyCommand,
  IPublishAdminMaintenancePolicyResult,
  IPublishAdminMaintenancePolicyUseCase,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { RankOrder, UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PublishAdminMaintenancePolicyUseCase implements IPublishAdminMaintenancePolicyUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IPublishAdminMaintenancePolicyCommand,
  ): Promise<IPublishAdminMaintenancePolicyResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        'config.write',
      ))
    )
      throw new ForbiddenException();

    const { tiers, changeReason } = command.maintenancePolicy;
    const ranks = tiers.map((tier) => tier.rank);
    const problems: string[] = [];
    if (
      tiers.length !== RankOrder.length ||
      RankOrder.some(
        (rank) => ranks.filter((value) => value === rank).length !== 1,
      )
    )
      problems.push(
        'maintenancePolicy.tiers phải chứa đúng một cấu hình cho mỗi bậc',
      );
    if (changeReason.trim().length === 0)
      problems.push('maintenancePolicy.changeReason không được để trống');
    for (const tier of tiers) {
      if (!Number.isInteger(tier.maintenanceGifts) || tier.maintenanceGifts < 0)
        problems.push(
          `${tier.rank}.maintenanceGifts phải là số nguyên không âm`,
        );
      if (
        !Number.isInteger(tier.maintenanceReferrals) ||
        tier.maintenanceReferrals < 0
      )
        problems.push(
          `${tier.rank}.maintenanceReferrals phải là số nguyên không âm`,
        );
      if (
        !Number.isInteger(tier.maintenancePenaltyPoints) ||
        tier.maintenancePenaltyPoints < 0
      )
        problems.push(
          `${tier.rank}.maintenancePenaltyPoints phải là số nguyên không âm`,
        );
      if (
        [UserRanks.VIEWER, UserRanks.MEMBER].includes(tier.rank) &&
        (tier.maintenanceGifts !== 0 ||
          tier.maintenanceReferrals !== 0 ||
          tier.maintenancePenaltyPoints !== 0)
      )
        problems.push(`${tier.rank} không áp dụng chu kỳ duy trì`);
      // Có chỉ tiêu mà không có mức phạt là một chu kỳ không có hậu quả: trượt
      // hay không trượt đều như nhau, và cả cơ chế duy trì thành trang trí.
      if (
        (tier.maintenanceGifts > 0 || tier.maintenanceReferrals > 0) &&
        tier.maintenancePenaltyPoints === 0
      )
        problems.push(
          `${tier.rank} có chỉ tiêu duy trì thì maintenancePenaltyPoints phải lớn hơn 0`,
        );
    }
    if (problems.length > 0)
      throw new ValidationFailedException([...new Set(problems)]);

    return {
      rankPolicy: await this.repository.publishMaintenancePolicy({
        actorUserId: command.actorUserId,
        changeReason: changeReason.trim(),
        tiers,
      }),
    };
  }
}
