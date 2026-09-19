import { IGetOwnEntitlementsUseCase } from '@/application/contracts/entitlement';
import { Global, Module } from '@nestjs/common';
import { GetOwnEntitlementsUseCase } from './get-own-entitlements.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IGetOwnEntitlementsUseCase,
      useClass: GetOwnEntitlementsUseCase,
    },
  ],
  exports: [IGetOwnEntitlementsUseCase],
})
export class EntitlementModule {}
