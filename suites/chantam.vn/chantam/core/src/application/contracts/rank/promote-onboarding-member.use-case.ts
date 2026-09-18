import { IUseCase } from '@chantam/service.common-lib';

export interface IPromoteOnboardingMemberCommand {
  userId: string;
}

export interface IPromoteOnboardingMemberUseCase extends IUseCase<
  IPromoteOnboardingMemberCommand,
  boolean
> {}

export const IPromoteOnboardingMemberUseCase = Symbol(
  'IPromoteOnboardingMemberUseCase',
);
