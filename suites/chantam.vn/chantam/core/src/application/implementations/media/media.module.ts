import { ISweepOrphanMediaUseCase } from '@/application/contracts/media';
import { Global, Module } from '@nestjs/common';
import { SweepOrphanMediaUseCase } from './sweep-orphan-media.use-case';

@Global()
@Module({
  providers: [
    { provide: ISweepOrphanMediaUseCase, useClass: SweepOrphanMediaUseCase },
  ],
  exports: [ISweepOrphanMediaUseCase],
})
export class MediaModule {}
