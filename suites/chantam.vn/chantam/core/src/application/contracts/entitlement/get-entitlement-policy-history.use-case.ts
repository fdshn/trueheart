import { IGetEntitlementPolicyHistoryResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetEntitlementPolicyHistoryCommand {
  actorUserId: string;
  limit?: number;
}

export interface IGetEntitlementPolicyHistoryUseCase extends IUseCase<
  IGetEntitlementPolicyHistoryCommand,
  IGetEntitlementPolicyHistoryResponseDto
> {}

export const IGetEntitlementPolicyHistoryUseCase = Symbol(
  'IGetEntitlementPolicyHistoryUseCase',
);
