import {
  IQualifyReferralCommand,
  IQualifyReferralUseCase,
} from '@/application/contracts/referral';
import {
  IRankRepository,
  IReferralRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class QualifyReferralUseCase implements IQualifyReferralUseCase {
  public constructor(
    @Inject(IReferralRepository)
    private readonly referrals: IReferralRepository,
    @Inject(IRankRepository)
    private readonly rankRepository: IRankRepository,
  ) {}

  public async handle(command: IQualifyReferralCommand): Promise<void> {
    const result = await this.referrals.qualifyAndAward(command);
    if (result.qualified && result.referrerId) {
      await this.rankRepository.reconcileNormalRank(result.referrerId);
    }
  }
}
