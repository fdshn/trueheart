import { IUseCase } from '@chantam/service.common-lib';

export interface IQualifyReferralCommand {
  refereeId: string;
}

export interface IQualifyReferralUseCase extends IUseCase<
  IQualifyReferralCommand,
  void
> {}

export const IQualifyReferralUseCase = Symbol('IQualifyReferralUseCase');
