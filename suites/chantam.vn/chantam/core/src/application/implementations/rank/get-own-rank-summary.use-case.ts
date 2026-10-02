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
        // cùng một hồ sơ. So bằng `balancePoints` — từ 02/10 đó là con số DUY NHẤT
        // quyết hạng, nên cảnh báo và quyết định tụt hạng chắc chắn nói cùng một thứ.
        demotionWarning:
          summary.currentTier.warningPoints > 0 &&
          summary.balancePoints < summary.currentTier.warningPoints,
        postQuota: summary.currentTier.postQuota,
        nextRank: summary.nextTier
          ? {
              rank: summary.nextTier.rank,
              requiredPoints: summary.nextTier.thresholdPoints,
              // Trừ theo con số ĐANG CẦM QUYỀN quyết hạng. Với cấu hình mặc
              // định đó là balance, và nói "còn bao nhiêu nữa" theo lifetime sẽ
              // bảo người đã tiêu 500 điểm rằng họ gần bậc kế tiếp hơn 500 điểm
              // so với thực tế.
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
