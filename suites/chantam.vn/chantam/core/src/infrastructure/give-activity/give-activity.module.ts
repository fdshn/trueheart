import { IGiveActivityCounter } from '@/domain/ports/give-activity.counter';
import { Global, Module } from '@nestjs/common';
import { UnavailableGiveActivityCounter } from './unavailable-give-activity.counter';

@Global()
@Module({
  providers: [
    { provide: IGiveActivityCounter, useClass: UnavailableGiveActivityCounter },
  ],
  exports: [IGiveActivityCounter],
})
export class GiveActivityModule {}
