import {
  IGetSurfacePresenceUseCase,
  IPresenceHeartbeatUseCase,
} from '@/application/contracts/presence';
import { Global, Module } from '@nestjs/common';
import {
  GetSurfacePresenceUseCase,
  PresenceHeartbeatUseCase,
} from './presence.use-cases';

@Global()
@Module({
  providers: [
    { provide: IPresenceHeartbeatUseCase, useClass: PresenceHeartbeatUseCase },
    {
      provide: IGetSurfacePresenceUseCase,
      useClass: GetSurfacePresenceUseCase,
    },
  ],
  exports: [IPresenceHeartbeatUseCase, IGetSurfacePresenceUseCase],
})
export class PresenceModule {}
