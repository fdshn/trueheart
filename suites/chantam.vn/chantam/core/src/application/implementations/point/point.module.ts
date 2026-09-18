import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import { Global, Module } from '@nestjs/common';
import { AppendPointEntryUseCase } from './append-point-entry.use-case';

@Global()
@Module({
  providers: [
    { provide: IAppendPointEntryUseCase, useClass: AppendPointEntryUseCase },
  ],
  exports: [IAppendPointEntryUseCase],
})
export class PointModule {}
