import {
  ICreateHomeCampaignUseCase,
  IDeleteHomeCampaignUseCase,
  IGetHomeCampaignUseCase,
  IGetHomeLayoutUseCase,
  IListHomeCampaignsUseCase,
  IUpdateHomeCampaignUseCase,
} from '@/application/contracts/home-campaign';
import { Global, Module } from '@nestjs/common';
import {
  CreateHomeCampaignUseCase,
  DeleteHomeCampaignUseCase,
  GetHomeCampaignUseCase,
  GetHomeLayoutUseCase,
  ListHomeCampaignsUseCase,
  UpdateHomeCampaignUseCase,
} from './home-campaign.use-cases';

/**
 * `@Global()` như mọi feature module khác của tầng application.
 *
 * `ApplicationModule` KHÔNG `@Global()`, nên controller chỉ thấy use case khi module khai
 * nó là global — thiếu dòng này thì Nest ném `can't resolve dependencies of the
 * AdminCampaignController` ngay lúc boot, và không một unit test nào bắt được vì mọi spec
 * đều dựng use case bằng `new`.
 */
@Global()
@Module({
  providers: [
    {
      provide: IListHomeCampaignsUseCase,
      useClass: ListHomeCampaignsUseCase,
    },
    { provide: IGetHomeCampaignUseCase, useClass: GetHomeCampaignUseCase },
    {
      provide: ICreateHomeCampaignUseCase,
      useClass: CreateHomeCampaignUseCase,
    },
    {
      provide: IUpdateHomeCampaignUseCase,
      useClass: UpdateHomeCampaignUseCase,
    },
    {
      provide: IDeleteHomeCampaignUseCase,
      useClass: DeleteHomeCampaignUseCase,
    },
    { provide: IGetHomeLayoutUseCase, useClass: GetHomeLayoutUseCase },
  ],
  exports: [
    IListHomeCampaignsUseCase,
    IGetHomeCampaignUseCase,
    ICreateHomeCampaignUseCase,
    IUpdateHomeCampaignUseCase,
    IDeleteHomeCampaignUseCase,
    IGetHomeLayoutUseCase,
  ],
})
export class HomeCampaignUseCaseModule {}
