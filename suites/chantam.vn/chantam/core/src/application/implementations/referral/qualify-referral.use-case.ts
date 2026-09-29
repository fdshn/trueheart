import {
  IQualifyReferralCommand,
  IQualifyReferralUseCase,
} from '@/application/contracts/referral';
import { IReferralRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { RankChangeNotifier } from '../rank/rank-change.notifier';

@Injectable()
export class QualifyReferralUseCase implements IQualifyReferralUseCase {
  public constructor(
    @Inject(IReferralRepository)
    private readonly referrals: IReferralRepository,
    private readonly rankChange: RankChangeNotifier,
  ) {}

  public async handle(command: IQualifyReferralCommand): Promise<void> {
    const result = await this.referrals.qualifyAndAward(command);
    if (result.qualified && result.referrerId) {
      // Qua `RankChangeNotifier`, không gọi `reconcileNormalRank` trần: 56 điểm
      // giới thiệu có thể đẩy người ta lên hạng, và họ nên được biết.
      await this.rankChange.afterBalanceChange(result.referrerId);
    }
  }
}
