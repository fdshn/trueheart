import {
  IGetOwnReferralCommand,
  IGetOwnReferralResult,
  IGetOwnReferralUseCase,
} from '@/application/contracts/referral';
import { IReferralRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetOwnReferralUseCase implements IGetOwnReferralUseCase {
  public constructor(
    @Inject(IReferralRepository)
    private readonly referrals: IReferralRepository,
  ) {}

  public async handle(
    command: IGetOwnReferralCommand,
  ): Promise<IGetOwnReferralResult> {
    return { referral: await this.referrals.getOwnSummary(command.userId) };
  }
}
