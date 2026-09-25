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
        balancePoints: summary.balancePoints,
        thresholdPoints: summary.currentTier.thresholdPoints,
        warningPoints: summary.currentTier.warningPoints,
        // Cảnh báo tính ở máy chủ để web và app không đặt hai mốc khác nhau cho
        // cùng một hồ sơ.
        demotionWarning:
          summary.currentTier.warningPoints > 0 &&
          summary.balancePoints < summary.currentTier.warningPoints,
        postQuota: summary.currentTier.postQuota,
        nextRank: summary.nextTier
          ? {
              rank: summary.nextTier.rank,
              requiredPoints: summary.nextTier.thresholdPoints,
              // Trừ theo BALANCE, không theo lifetime: lên hạng xét trên số
              // điểm đang có. Dùng lifetime sẽ nói với người đã tiêu 500 điểm
              // rằng họ gần bậc kế tiếp hơn 500 điểm so với thực tế.
              remainingPoints: Math.max(
                0,
                summary.nextTier.thresholdPoints - summary.balancePoints,
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
