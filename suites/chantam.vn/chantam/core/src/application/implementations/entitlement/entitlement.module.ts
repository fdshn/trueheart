import {
  IGetEntitlementPolicyUseCase,
  IGetOwnEntitlementsUseCase,
  IPublishEntitlementPolicyUseCase,
} from '@/application/contracts/entitlement';
import { Global, Module } from '@nestjs/common';
import { GetEntitlementPolicyUseCase } from './get-entitlement-policy.use-case';
import { GetOwnEntitlementsUseCase } from './get-own-entitlements.use-case';
import { PublishEntitlementPolicyUseCase } from './publish-entitlement-policy.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IGetOwnEntitlementsUseCase,
      useClass: GetOwnEntitlementsUseCase,
    },
    {
      provide: IGetEntitlementPolicyUseCase,
      useClass: GetEntitlementPolicyUseCase,
    },
    {
      provide: IPublishEntitlementPolicyUseCase,
      useClass: PublishEntitlementPolicyUseCase,
    },
  ],
  exports: [
    IGetOwnEntitlementsUseCase,
    IGetEntitlementPolicyUseCase,
    IPublishEntitlementPolicyUseCase,
  ],
})
export class EntitlementModule {}
