import {
  IQualifyReferralCommand,
  IQualifyReferralUseCase,
} from '@/application/contracts/referral';
import { IReferralRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class QualifyReferralUseCase implements IQualifyReferralUseCase {
  public constructor(
    @Inject(IReferralRepository)
    private readonly referrals: IReferralRepository,
  ) {}

  public async handle(command: IQualifyReferralCommand): Promise<void> {
    await this.referrals.qualifyAndAward(command);
  }
}
