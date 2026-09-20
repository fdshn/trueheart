import { IEntitlementPolicyCapabilityPatch } from '@/domain/ports/repository';
import { IPublishEntitlementPolicyResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IPublishEntitlementPolicyCommand {
  actorUserId: string;
  changeReason: string;
  capabilities: IEntitlementPolicyCapabilityPatch[];
}

export interface IPublishEntitlementPolicyUseCase extends IUseCase<
  IPublishEntitlementPolicyCommand,
  IPublishEntitlementPolicyResponseDto
> {}

export const IPublishEntitlementPolicyUseCase = Symbol(
  'IPublishEntitlementPolicyUseCase',
);
