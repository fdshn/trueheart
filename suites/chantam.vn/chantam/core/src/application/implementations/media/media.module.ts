import {
  IConfirmCmsAudioUseCase,
  IConfirmCmsMediaUseCase,
  IListCmsMediaUseCase,
  IRequestCmsAudioUploadUseCase,
  IRequestCmsMediaUploadUseCase,
  ISweepOrphanMediaUseCase,
} from '@/application/contracts/media';
import { Global, Module } from '@nestjs/common';
import {
  ConfirmCmsAudioUseCase,
  ConfirmCmsMediaUseCase,
  ListCmsMediaUseCase,
  RequestCmsAudioUploadUseCase,
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
    {
      provide: IRequestCmsAudioUploadUseCase,
      useClass: RequestCmsAudioUploadUseCase,
    },
    { provide: IConfirmCmsAudioUseCase, useClass: ConfirmCmsAudioUseCase },
  ],
  exports: [
    ISweepOrphanMediaUseCase,
    IRequestCmsMediaUploadUseCase,
    IConfirmCmsMediaUseCase,
    IListCmsMediaUseCase,
    IRequestCmsAudioUploadUseCase,
    IConfirmCmsAudioUseCase,
  ],
})
export class MediaModule {}
