import {
  IConfirmCmsMediaUseCase,
  IListCmsMediaUseCase,
  IRequestCmsMediaUploadUseCase,
  ISweepOrphanMediaUseCase,
} from '@/application/contracts/media';
import { Global, Module } from '@nestjs/common';
import {
  ConfirmCmsMediaUseCase,
  ListCmsMediaUseCase,
  RequestCmsMediaUploadUseCase,
} from './cms-media.use-cases';
import { SweepOrphanMediaUseCase } from './sweep-orphan-media.use-case';

@Global()
@Module({
  providers: [
    { provide: ISweepOrphanMediaUseCase, useClass: SweepOrphanMediaUseCase },
    {
      provide: IRequestCmsMediaUploadUseCase,
      useClass: RequestCmsMediaUploadUseCase,
    },
    { provide: IConfirmCmsMediaUseCase, useClass: ConfirmCmsMediaUseCase },
    { provide: IListCmsMediaUseCase, useClass: ListCmsMediaUseCase },
  ],
  exports: [
    ISweepOrphanMediaUseCase,
    IRequestCmsMediaUploadUseCase,
    IConfirmCmsMediaUseCase,
    IListCmsMediaUseCase,
  ],
})
export class MediaModule {}
