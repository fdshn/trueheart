import {
  ICancelCharityDeliveryUseCase,
  ICancelCharityParticipationUseCase,
  ICompleteCharityDeliveryUseCase,
  ICreateCharityCampaignUseCase,
  IDecideCharityApprovalUseCase,
  IDecideCharityContributionUseCase,
  IGetCampaignNeedsUseCase,
  IGetCharityDeliveryUseCase,
  IGetPublicCharityCampaignUseCase,
  IJoinCharityCampaignUseCase,
  IListAdminCharityCampaignsUseCase,
  IListCampaignContributionsUseCase,
  IListJoinedCharityCampaignsUseCase,
  IListMyCharityCampaignsUseCase,
  IListMyContributionsUseCase,
  IListPublicCharityCampaignsUseCase,
  IReviewCharityCampaignUseCase,
  ISetCharityCampaignActiveUseCase,
  ISubmitCharityContributionUseCase,
  IUpdateCharityContributionUseCase,
  IUpdateCharityProgressUseCase,
} from '@/application/contracts/charity-campaign';
import { Global, Module } from '@nestjs/common';
import {
  CancelCharityDeliveryUseCase,
  CancelCharityParticipationUseCase,
  CompleteCharityDeliveryUseCase,
  CreateCharityCampaignUseCase,
  DecideCharityApprovalUseCase,
  DecideCharityContributionUseCase,
  GetCampaignNeedsUseCase,
  GetCharityDeliveryUseCase,
  GetPublicCharityCampaignUseCase,
  JoinCharityCampaignUseCase,
  ListAdminCharityCampaignsUseCase,
  ListCampaignContributionsUseCase,
  ListJoinedCharityCampaignsUseCase,
  ListMyCharityCampaignsUseCase,
  ListMyContributionsUseCase,
  ListPublicCharityCampaignsUseCase,
  ReviewCharityCampaignUseCase,
  SetCharityCampaignActiveUseCase,
  SubmitCharityContributionUseCase,
  UpdateCharityContributionUseCase,
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
      provide: IGetCampaignNeedsUseCase,
      useClass: GetCampaignNeedsUseCase,
    },
    {
      provide: ISubmitCharityContributionUseCase,
      useClass: SubmitCharityContributionUseCase,
    },
    {
      provide: IListCampaignContributionsUseCase,
      useClass: ListCampaignContributionsUseCase,
    },
    {
      provide: IListMyContributionsUseCase,
      useClass: ListMyContributionsUseCase,
    },
    {
      provide: IUpdateCharityContributionUseCase,
      useClass: UpdateCharityContributionUseCase,
    },
    {
      provide: IDecideCharityContributionUseCase,
      useClass: DecideCharityContributionUseCase,
    },
    {
      provide: ICompleteCharityDeliveryUseCase,
      useClass: CompleteCharityDeliveryUseCase,
    },
    {
      provide: ICancelCharityDeliveryUseCase,
      useClass: CancelCharityDeliveryUseCase,
    },
    {
      provide: IGetCharityDeliveryUseCase,
      useClass: GetCharityDeliveryUseCase,
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
    IGetCampaignNeedsUseCase,
    ISubmitCharityContributionUseCase,
    IListCampaignContributionsUseCase,
    IListMyContributionsUseCase,
    IUpdateCharityContributionUseCase,
    IDecideCharityContributionUseCase,
    ICompleteCharityDeliveryUseCase,
    ICancelCharityDeliveryUseCase,
    IGetCharityDeliveryUseCase,
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
