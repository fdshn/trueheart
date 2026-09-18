import {
  IGetOwnRankSummaryCommand,
  IGetOwnRankSummaryResult,
  IGetOwnRankSummaryUseCase,
} from '@/application/contracts/rank';
import { IRankRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetOwnRankSummaryUseCase implements IGetOwnRankSummaryUseCase {
  public constructor(
    @Inject(IRankRepository)
    private readonly ranks: IRankRepository,
  ) {}

  public async handle(
    command: IGetOwnRankSummaryCommand,
  ): Promise<IGetOwnRankSummaryResult> {
    const summary = await this.ranks.getOwnSummary(command.userId);

    return {
      rank: {
        rank: summary.rank,
        lifetimePoints: summary.lifetimePoints,
        postQuota: summary.currentTier.postQuota,
        nextRank: summary.nextTier
          ? {
              rank: summary.nextTier.rank,
              requiredPoints: summary.nextTier.thresholdPoints,
              remainingPoints: Math.max(
                0,
                summary.nextTier.thresholdPoints - summary.lifetimePoints,
              ),
              requiredGifts: summary.nextTier.requiredGifts,
              requiredReferrals: summary.nextTier.requiredReferrals,
              qualifiedReferrals: summary.qualifiedReferrals,
            }
          : null,
        maintenanceCycle: summary.maintenanceCycle,
      },
    };
  }
}
