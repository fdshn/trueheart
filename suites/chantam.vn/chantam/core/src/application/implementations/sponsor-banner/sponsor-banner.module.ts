import {
  ICreateSponsorBannerUseCase,
  IDecideSponsorBannerApprovalUseCase,
  IDeleteSponsorBannerUseCase,
  IListAdminSponsorBannersUseCase,
  IRecordBannerClickUseCase,
  IServeSponsorBannersUseCase,
  ISetSponsorBannerActiveUseCase,
  IUpdateSponsorBannerUseCase,
} from '@/application/contracts/sponsor-banner';
import { Global, Module } from '@nestjs/common';
import {
  CreateSponsorBannerUseCase,
  DecideSponsorBannerApprovalUseCase,
  DeleteSponsorBannerUseCase,
  ListAdminSponsorBannersUseCase,
  RecordBannerClickUseCase,
  ServeSponsorBannersUseCase,
  SetSponsorBannerActiveUseCase,
  UpdateSponsorBannerUseCase,
} from './sponsor-banner.use-cases';

/**
 * `@Global()` như mọi feature module khác của tầng application.
 *
 * `ApplicationModule` KHÔNG `@Global()`, nên controller chỉ thấy use case khi module khai nó
 * là global. Thiếu dòng này thì Nest ném `can't resolve dependencies` ngay lúc boot, và
 * KHÔNG một unit test nào bắt được — mọi spec dựng use case bằng `new`.
 */
@Global()
@Module({
  providers: [
    {
      provide: ICreateSponsorBannerUseCase,
      useClass: CreateSponsorBannerUseCase,
    },
    {
      provide: IUpdateSponsorBannerUseCase,
      useClass: UpdateSponsorBannerUseCase,
    },
    {
      provide: IListAdminSponsorBannersUseCase,
      useClass: ListAdminSponsorBannersUseCase,
    },
    {
      provide: IDecideSponsorBannerApprovalUseCase,
      useClass: DecideSponsorBannerApprovalUseCase,
    },
    {
      provide: ISetSponsorBannerActiveUseCase,
      useClass: SetSponsorBannerActiveUseCase,
    },
    {
      provide: IDeleteSponsorBannerUseCase,
      useClass: DeleteSponsorBannerUseCase,
    },
    {
      provide: IServeSponsorBannersUseCase,
      useClass: ServeSponsorBannersUseCase,
    },
    { provide: IRecordBannerClickUseCase, useClass: RecordBannerClickUseCase },
  ],
  exports: [
    ICreateSponsorBannerUseCase,
    IUpdateSponsorBannerUseCase,
    IListAdminSponsorBannersUseCase,
    IDecideSponsorBannerApprovalUseCase,
    ISetSponsorBannerActiveUseCase,
    IDeleteSponsorBannerUseCase,
    IServeSponsorBannersUseCase,
    IRecordBannerClickUseCase,
  ],
})
export class SponsorBannerUseCaseModule {}
