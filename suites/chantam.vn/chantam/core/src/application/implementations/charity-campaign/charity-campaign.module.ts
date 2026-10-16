import {
  IAmendExternalContributionUseCase,
  ICancelCharityDeliveryUseCase,
  ICancelCharityParticipationUseCase,
  ICloseCharityCampaignUseCase,
  ICompleteCharityDeliveryUseCase,
  ICreateCharityCampaignUseCase,
  IDecideCharityApprovalUseCase,
  IDecideCharityContributionUseCase,
  IDeleteCharityCampaignUseCase,
  IExtendCharityCampaignUseCase,
  IGetAdminCampaignNeedsUseCase,
  IGetAdminCharityCampaignUseCase,
  IGetCampaignNeedsUseCase,
  IGetCharityDeliveryUseCase,
  IGetPublicCharityCampaignUseCase,
  IJoinCharityCampaignUseCase,
  IListAdminCharityCampaignsUseCase,
  IListCampaignContributionsUseCase,
  IListExternalContributionsUseCase,
  IListJoinedCharityCampaignsUseCase,
  IListMyCharityCampaignsUseCase,
  IListMyContributionsUseCase,
  IListPublicCharityCampaignsUseCase,
  IManageCharityBeneficiaryUseCase,
  IManageCharityCoordinatorsUseCase,
  IRecordExternalContributionUseCase,
  IReplaceCharityMediaUseCase,
  IRequestCharityMediaUploadUseCase,
  IReviewCharityCampaignUseCase,
  ISetCharityCampaignActiveUseCase,
  ISubmitCharityContributionUseCase,
  IUpdateAdminCharityCampaignUseCase,
  IUpdateCharityContributionUseCase,
  IUpdateCharityProgressUseCase,
} from '@/application/contracts/charity-campaign';
import { Global, Module } from '@nestjs/common';
import {
  AmendExternalContributionUseCase,
  CancelCharityDeliveryUseCase,
  CancelCharityParticipationUseCase,
  CloseCharityCampaignUseCase,
  CompleteCharityDeliveryUseCase,
  CreateCharityCampaignUseCase,
  DecideCharityApprovalUseCase,
  DecideCharityContributionUseCase,
  DeleteCharityCampaignUseCase,
  ExtendCharityCampaignUseCase,
  GetAdminCampaignNeedsUseCase,
  GetAdminCharityCampaignUseCase,
  GetCampaignNeedsUseCase,
  GetCharityDeliveryUseCase,
  GetPublicCharityCampaignUseCase,
  JoinCharityCampaignUseCase,
  ListAdminCharityCampaignsUseCase,
  ListCampaignContributionsUseCase,
  ListExternalContributionsUseCase,
  ListJoinedCharityCampaignsUseCase,
  ListMyCharityCampaignsUseCase,
  ListMyContributionsUseCase,
  ListPublicCharityCampaignsUseCase,
  ManageCharityBeneficiaryUseCase,
  ManageCharityCoordinatorsUseCase,
  RecordExternalContributionUseCase,
  ReplaceCharityMediaUseCase,
  RequestCharityMediaUploadUseCase,
  ReviewCharityCampaignUseCase,
  SetCharityCampaignActiveUseCase,
  SubmitCharityContributionUseCase,
  UpdateAdminCharityCampaignUseCase,
  UpdateCharityContributionUseCase,
  UpdateCharityProgressUseCase,
} from './charity-campaign.use-cases';
import { CharityNotifier } from './charity.notifier';

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
    CharityNotifier,
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
      provide: IRecordExternalContributionUseCase,
      useClass: RecordExternalContributionUseCase,
    },
    {
      provide: IRequestCharityMediaUploadUseCase,
      useClass: RequestCharityMediaUploadUseCase,
    },
    {
      provide: IReplaceCharityMediaUseCase,
      useClass: ReplaceCharityMediaUseCase,
    },
    {
      provide: IAmendExternalContributionUseCase,
      useClass: AmendExternalContributionUseCase,
    },
    {
      provide: IListExternalContributionsUseCase,
      useClass: ListExternalContributionsUseCase,
    },
    {
      provide: ICloseCharityCampaignUseCase,
      useClass: CloseCharityCampaignUseCase,
    },
    {
      provide: IExtendCharityCampaignUseCase,
      useClass: ExtendCharityCampaignUseCase,
    },
    {
      provide: IManageCharityCoordinatorsUseCase,
      useClass: ManageCharityCoordinatorsUseCase,
    },
    {
      provide: IManageCharityBeneficiaryUseCase,
      useClass: ManageCharityBeneficiaryUseCase,
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
      provide: IGetAdminCharityCampaignUseCase,
      useClass: GetAdminCharityCampaignUseCase,
    },
    {
      provide: IGetAdminCampaignNeedsUseCase,
      useClass: GetAdminCampaignNeedsUseCase,
    },
    {
      provide: IDeleteCharityCampaignUseCase,
      useClass: DeleteCharityCampaignUseCase,
    },
    {
      provide: IUpdateAdminCharityCampaignUseCase,
      useClass: UpdateAdminCharityCampaignUseCase,
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
    IRequestCharityMediaUploadUseCase,
    IReplaceCharityMediaUseCase,
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
    IRecordExternalContributionUseCase,
    IAmendExternalContributionUseCase,
    IListExternalContributionsUseCase,
    ICloseCharityCampaignUseCase,
    IExtendCharityCampaignUseCase,
    IManageCharityCoordinatorsUseCase,
    IManageCharityBeneficiaryUseCase,
    IGetPublicCharityCampaignUseCase,
    IListMyCharityCampaignsUseCase,
    IListJoinedCharityCampaignsUseCase,
    IJoinCharityCampaignUseCase,
    ICancelCharityParticipationUseCase,
    IReviewCharityCampaignUseCase,
    IUpdateCharityProgressUseCase,
    IListAdminCharityCampaignsUseCase,
    IGetAdminCharityCampaignUseCase,
    IGetAdminCampaignNeedsUseCase,
    IDeleteCharityCampaignUseCase,
    IUpdateAdminCharityCampaignUseCase,
    IDecideCharityApprovalUseCase,
    ISetCharityCampaignActiveUseCase,
  ],
})
export class CharityCampaignUseCaseModule {}
