import {
  ICancelCharityParticipationUseCase,
  ICreateCharityCampaignUseCase,
  IDecideCharityApprovalUseCase,
  IGetPublicCharityCampaignUseCase,
  IJoinCharityCampaignUseCase,
  IListAdminCharityCampaignsUseCase,
  IListJoinedCharityCampaignsUseCase,
  IListMyCharityCampaignsUseCase,
  IListPublicCharityCampaignsUseCase,
  IReviewCharityCampaignUseCase,
  ISetCharityCampaignActiveUseCase,
  IUpdateCharityProgressUseCase,
} from '@/application/contracts/charity-campaign';
import { Global, Module } from '@nestjs/common';
import {
  CancelCharityParticipationUseCase,
  CreateCharityCampaignUseCase,
  DecideCharityApprovalUseCase,
  GetPublicCharityCampaignUseCase,
  JoinCharityCampaignUseCase,
  ListAdminCharityCampaignsUseCase,
  ListJoinedCharityCampaignsUseCase,
  ListMyCharityCampaignsUseCase,
  ListPublicCharityCampaignsUseCase,
  ReviewCharityCampaignUseCase,
  SetCharityCampaignActiveUseCase,
  UpdateCharityProgressUseCase,
} from './charity-campaign.use-cases';

/**
 * `@Global()` như mọi feature module khác của tầng application.
 *
 * `ApplicationModule` KHÔNG `@Global()`, nên controller chỉ thấy use case khi module khai
 * nó là global. Thiếu dòng này thì Nest ném `can't resolve dependencies` ngay lúc boot, và
 * KHÔNG một unit test nào bắt được — mọi spec dựng use case bằng `new`. Trong phiên làm
 * F63/F64/F46 tôi quên đúng dòng này ba lần, và cả ba lần chỉ lộ ra khi chạy thật app.
 */
@Global()
@Module({
  providers: [
    {
      provide: ICreateCharityCampaignUseCase,
      useClass: CreateCharityCampaignUseCase,
    },
    {
      provide: IListPublicCharityCampaignsUseCase,
      useClass: ListPublicCharityCampaignsUseCase,
    },
    {
      provide: IGetPublicCharityCampaignUseCase,
      useClass: GetPublicCharityCampaignUseCase,
    },
    {
      provide: IListMyCharityCampaignsUseCase,
      useClass: ListMyCharityCampaignsUseCase,
    },
    {
      provide: IListJoinedCharityCampaignsUseCase,
      useClass: ListJoinedCharityCampaignsUseCase,
    },
    {
      provide: IJoinCharityCampaignUseCase,
      useClass: JoinCharityCampaignUseCase,
    },
    {
      provide: ICancelCharityParticipationUseCase,
      useClass: CancelCharityParticipationUseCase,
    },
    {
      provide: IReviewCharityCampaignUseCase,
      useClass: ReviewCharityCampaignUseCase,
    },
    {
      provide: IUpdateCharityProgressUseCase,
      useClass: UpdateCharityProgressUseCase,
    },
    {
      provide: IListAdminCharityCampaignsUseCase,
      useClass: ListAdminCharityCampaignsUseCase,
    },
    {
      provide: IDecideCharityApprovalUseCase,
      useClass: DecideCharityApprovalUseCase,
    },
    {
      provide: ISetCharityCampaignActiveUseCase,
      useClass: SetCharityCampaignActiveUseCase,
    },
  ],
  exports: [
    ICreateCharityCampaignUseCase,
    IListPublicCharityCampaignsUseCase,
    IGetPublicCharityCampaignUseCase,
    IListMyCharityCampaignsUseCase,
    IListJoinedCharityCampaignsUseCase,
    IJoinCharityCampaignUseCase,
    ICancelCharityParticipationUseCase,
    IReviewCharityCampaignUseCase,
    IUpdateCharityProgressUseCase,
    IListAdminCharityCampaignsUseCase,
    IDecideCharityApprovalUseCase,
    ISetCharityCampaignActiveUseCase,
  ],
})
export class CharityCampaignUseCaseModule {}
