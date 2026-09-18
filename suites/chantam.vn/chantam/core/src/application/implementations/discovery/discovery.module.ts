import { IGetDiscoveryConfigUseCase } from '@/application/contracts/discovery';
import { Global, Module } from '@nestjs/common';
import { GetDiscoveryConfigUseCase } from './get-discovery-config.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IGetDiscoveryConfigUseCase,
      useClass: GetDiscoveryConfigUseCase,
    },
  ],
  exports: [IGetDiscoveryConfigUseCase],
})
export class DiscoveryModule {}
