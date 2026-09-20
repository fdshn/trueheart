import { IGetEntitlementPolicyResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetEntitlementPolicyCommand {
  actorUserId: string;
}

export interface IGetEntitlementPolicyUseCase extends IUseCase<
  IGetEntitlementPolicyCommand,
  IGetEntitlementPolicyResponseDto
> {}

export const IGetEntitlementPolicyUseCase = Symbol(
  'IGetEntitlementPolicyUseCase',
);
