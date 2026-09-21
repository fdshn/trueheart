import {
  IGetAdminRankPolicyCommand,
  IGetAdminRankPolicyResult,
  IGetAdminRankPolicyUseCase,
  IPublishAdminRankPolicyCommand,
  IPublishAdminRankPolicyResult,
  IPublishAdminRankPolicyUseCase,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { RankOrder, UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetAdminRankPolicyUseCase implements IGetAdminRankPolicyUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAdminRankPolicyCommand,
  ): Promise<IGetAdminRankPolicyResult> {
    if (
      !(await this.repository.hasPermission(command.actorUserId, 'config.read'))
    )
      throw new ForbiddenException();

    return { rankPolicy: await this.repository.getRankPolicy() };
  }
}

@Injectable()
export class PublishAdminRankPolicyUseCase implements IPublishAdminRankPolicyUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IPublishAdminRankPolicyCommand,
  ): Promise<IPublishAdminRankPolicyResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        'config.write',
      ))
    )
      throw new ForbiddenException();

    const { changeReason, tiers } = command.rankPolicy;
    const problems = this.validate(changeReason, tiers);
    if (problems.length > 0) throw new ValidationFailedException(problems);

    return {
      rankPolicy: await this.repository.publishRankPolicy({
        actorUserId: command.actorUserId,
        changeReason: changeReason.trim(),
        tiers,
      }),
    };
  }

  private validate(
    changeReason: string,
    tiers: IPublishAdminRankPolicyCommand['rankPolicy']['tiers'],
  ): string[] {
    const problems: string[] = [];
    if (changeReason.trim().length === 0)
      problems.push('rankPolicy.changeReason không được để trống');

    const ranks = tiers.map((tier) => tier.rank);
    if (
      tiers.length !== RankOrder.length ||
      RankOrder.some(
        (rank) => ranks.filter((value) => value === rank).length !== 1,
      )
    )
      problems.push('rankPolicy.tiers phải chứa đúng một cấu hình cho mỗi bậc');

    for (const tier of tiers) {
      for (const [field, value] of Object.entries({
        thresholdPoints: tier.thresholdPoints,
        warningPoints: tier.warningPoints,
        requiredGifts: tier.requiredGifts,
        requiredReferrals: tier.requiredReferrals,
      })) {
        if (!Number.isInteger(value) || value < 0)
          problems.push(`${tier.rank}.${field} phải là số nguyên không âm`);
      }
      if (tier.warningPoints > tier.thresholdPoints)
        problems.push(
          `${tier.rank}.warningPoints không được vượt thresholdPoints`,
        );
    }

    const ordered = RankOrder.map((rank) =>
      tiers.find((tier) => tier.rank === rank),
    );
    if (ordered[0]?.thresholdPoints !== 0)
      problems.push(`${UserRanks.VIEWER}.thresholdPoints phải bằng 0`);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (
        previous &&
        current &&
        current.thresholdPoints <= previous.thresholdPoints
      )
        problems.push('Ngưỡng điểm phải tăng dần theo thứ tự bậc');
    }

    return [...new Set(problems)];
  }
}
