import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOwnReferralCommand {
  userId: string;
}

export interface IReferralSummaryDto {
  code: string;
  totalCount: number;
  qualifiedCount: number;
  rewardedCount: number;
}

export interface IGetOwnReferralResult {
  referral: IReferralSummaryDto;
}

export interface IGetOwnReferralUseCase extends IUseCase<
  IGetOwnReferralCommand,
  IGetOwnReferralResult
> {}

export const IGetOwnReferralUseCase = Symbol('IGetOwnReferralUseCase');
