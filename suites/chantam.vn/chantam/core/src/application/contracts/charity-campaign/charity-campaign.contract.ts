import {
  CharityCampaignPhase,
  ICharityCampaign,
  ICharityContribution,
  ICharityContributionPage,
  ICharityDelivery,
  ICharityExternalContribution,
  ICharityNeedsView,
  ICharityReview,
  ICloseCampaignResult,
  IDecideContributionResult,
} from '@/domain/ports/repository';
import {
  CharityApprovalStatus,
  CharityBeneficiaryRelation,
  CharityCampaignType,
  CharityContributionStatus,
  CharityRejectionReason,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICharityCampaignView extends ICharityCampaign {
  /**
   * Người gọi có đang đăng ký hoạt động này không.
   *
   * `null` trên đường CÔNG KHAI — không có ai để hỏi. Đó không phải `false`: `false` nói
   * "người này chưa đăng ký", còn `null` nói "chưa biết người nào", và client dùng hai cái
   * đó cho hai giao diện khác nhau (nút Đăng ký vs nút Đăng nhập để tham gia).
   */
  readonly isJoined: boolean | null;
}

export interface ICharityCampaignPageResult {
  readonly items: ICharityCampaignView[];
  readonly total: number;
}

/** Thân chung cho cả hai đường tạo (thành viên và Admin). */
export interface ICharityNeedItemInput {
  readonly categoryId?: string;
  readonly itemName: string;
  readonly description?: string;
  readonly unit: string;
  readonly targetQuantity: number;
  readonly allowAlternative?: boolean;
}

export interface ICharityCampaignWriteInput {
  readonly title: string;
  readonly slug?: string;
  readonly description: string;
  readonly bannerUrl: string;
  readonly badgeName: string;
  readonly targetItemsCount?: number;
  readonly lat?: number;
  readonly lng?: number;
  readonly locationLabel?: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface ICreateCharityCampaignInput extends ICharityCampaignWriteInput {
  /**
   * Loại hoạt động (F65b §1). Quyết định capability nào gác lượt tạo, và có phải
   * khai quan hệ với người thụ hưởng hay không.
   */
  readonly campaignType: CharityCampaignType;
  /** Bắt buộc với `INDIVIDUAL_APPEAL`, phải bỏ trống với `ORGANIZED_CAMPAIGN`. */
  readonly beneficiaryRelation?: CharityBeneficiaryRelation;
  /**
   * Bảng nhu cầu vật phẩm, ghi cùng transaction với hoạt động.
   *
   * Bỏ trống là hợp lệ — hoạt động chỉ nhận đăng ký tham dự thì không có nhu cầu
   * vật phẩm nào, và §10 nói giữ nguyên hành vi legacy cho những hoạt động đó.
   */
  readonly needs?: readonly ICharityNeedItemInput[];
}

export interface ICreateCharityCampaignCommand extends ICreateCharityCampaignInput {
  readonly actorUserId: string;
  /**
   * `true` khi lượt tạo đi qua đường Admin.
   *
   * Hai đường tạo dùng CHUNG use case này, và cờ do controller đặt chứ không do body —
   * một cờ nhận từ body là một cờ người dùng tự bật để bỏ qua bước duyệt.
   */
  readonly asAdmin: boolean;
}

export interface ICharityContributionItemInput {
  readonly needItemId: string;
  readonly offeredQuantity: number;
  readonly conditionNote?: string;
}

export interface ISubmitCharityContributionCommand {
  readonly campaignId: string;
  readonly contributorId: string;
  readonly note?: string;
  readonly contactNote?: string;
  readonly items: readonly ICharityContributionItemInput[];
}

export type ISubmitCharityContributionResult = ICharityContribution;

export interface ISubmitCharityContributionUseCase extends IUseCase<
  ISubmitCharityContributionCommand,
  ISubmitCharityContributionResult
> {}

export const ISubmitCharityContributionUseCase = Symbol(
  'ISubmitCharityContributionUseCase',
);

export interface IListCampaignContributionsCommand {
  readonly campaignId: string;
  /** Người gọi; phải là người tổ chức của chiến dịch này. */
  readonly actorUserId: string;
  readonly status?: CharityContributionStatus;
  readonly limit: number;
  readonly offset: number;
}

export type IListCampaignContributionsResult = ICharityContributionPage;

export interface IListCampaignContributionsUseCase extends IUseCase<
  IListCampaignContributionsCommand,
  IListCampaignContributionsResult
> {}

export const IListCampaignContributionsUseCase = Symbol(
  'IListCampaignContributionsUseCase',
);

export interface IListMyContributionsCommand {
  readonly contributorId: string;
  readonly limit: number;
  readonly offset: number;
}

export type IListMyContributionsResult = ICharityContributionPage;

export interface IListMyContributionsUseCase extends IUseCase<
  IListMyContributionsCommand,
  IListMyContributionsResult
> {}

export const IListMyContributionsUseCase = Symbol(
  'IListMyContributionsUseCase',
);

/**
 * Sửa hoặc RÚT đề nghị — một endpoint, hai việc (F65b §4).
 *
 * Gộp vì cả hai có cùng điều kiện ("chưa có phần nào được chấp nhận") và cùng một
 * phép chặn đua ở database. Hai endpoint sẽ là hai chỗ phải giữ cùng một luật.
 */
export interface IUpdateCharityContributionCommand {
  readonly contributionId: string;
  readonly contributorId: string;
  /** `WITHDRAW` thì mọi trường nội dung bị bỏ qua. */
  readonly action: 'REPLACE' | 'WITHDRAW';
  readonly note?: string;
  readonly contactNote?: string;
  readonly items?: readonly ICharityContributionItemInput[];
}

export type IUpdateCharityContributionResult = ICharityContribution;

export interface IUpdateCharityContributionUseCase extends IUseCase<
  IUpdateCharityContributionCommand,
  IUpdateCharityContributionResult
> {}

export const IUpdateCharityContributionUseCase = Symbol(
  'IUpdateCharityContributionUseCase',
);

export interface IDecideCharityContributionCommand {
  readonly contributionId: string;
  readonly organizerId: string;
  /**
   * Khoá chống trùng do CLIENT sinh cho mỗi lần bấm (§5). Bấm đúp hay mạng retry
   * cùng khoá thì nhận lại đúng kết quả cũ, không tạo lượt giao nhận thứ hai.
   */
  readonly decisionKey: string;
  readonly decisions: readonly {
    contributionItemId: string;
    acceptedQuantity: number;
    rejectionReason?: CharityRejectionReason | null;
  }[];
}

export type IDecideCharityContributionResult = IDecideContributionResult;

export interface IDecideCharityContributionUseCase extends IUseCase<
  IDecideCharityContributionCommand,
  IDecideCharityContributionResult
> {}

export const IDecideCharityContributionUseCase = Symbol(
  'IDecideCharityContributionUseCase',
);

export interface ICompleteCharityDeliveryCommand {
  readonly deliveryId: string;
  readonly organizerId: string;
  readonly received: readonly {
    needItemId: string;
    receivedQuantity: number;
  }[];
}

export interface ICompleteCharityDeliveryUseCase extends IUseCase<
  ICompleteCharityDeliveryCommand,
  ICharityDelivery
> {}

export const ICompleteCharityDeliveryUseCase = Symbol(
  'ICompleteCharityDeliveryUseCase',
);

export interface ICancelCharityDeliveryCommand {
  readonly deliveryId: string;
  readonly actorUserId: string;
  readonly reason: string;
}

export interface ICancelCharityDeliveryUseCase extends IUseCase<
  ICancelCharityDeliveryCommand,
  ICharityDelivery
> {}

export const ICancelCharityDeliveryUseCase = Symbol(
  'ICancelCharityDeliveryUseCase',
);

export interface IGetCharityDeliveryCommand {
  readonly deliveryId: string;
  readonly viewerUserId: string;
}

export interface IGetCharityDeliveryUseCase extends IUseCase<
  IGetCharityDeliveryCommand,
  ICharityDelivery
> {}

export const IGetCharityDeliveryUseCase = Symbol('IGetCharityDeliveryUseCase');

export interface IRecordExternalContributionCommand {
  readonly campaignId: string;
  readonly recordedBy: string;
  readonly needItemId: string;
  readonly quantity: number;
  readonly sourceLabel: string;
  readonly receivedAt: string;
  readonly evidenceNote?: string;
}

export interface IRecordExternalContributionUseCase extends IUseCase<
  IRecordExternalContributionCommand,
  ICharityExternalContribution
> {}

export const IRecordExternalContributionUseCase = Symbol(
  'IRecordExternalContributionUseCase',
);

export interface IAmendExternalContributionCommand {
  readonly externalId: string;
  readonly actorUserId: string;
  readonly action: 'VOID' | 'ADJUST';
  readonly reason: string;
  readonly quantity?: number;
}

export interface IAmendExternalContributionUseCase extends IUseCase<
  IAmendExternalContributionCommand,
  ICharityExternalContribution
> {}

export const IAmendExternalContributionUseCase = Symbol(
  'IAmendExternalContributionUseCase',
);

export interface IListExternalContributionsCommand {
  readonly campaignId: string;
  readonly actorUserId: string;
}

export interface IListExternalContributionsUseCase extends IUseCase<
  IListExternalContributionsCommand,
  { items: ICharityExternalContribution[] }
> {}

export const IListExternalContributionsUseCase = Symbol(
  'IListExternalContributionsUseCase',
);

export interface ICloseCharityCampaignCommand {
  readonly campaignId: string;
  readonly actorUserId: string;
}

export interface ICloseCharityCampaignUseCase extends IUseCase<
  ICloseCharityCampaignCommand,
  ICloseCampaignResult
> {}

export const ICloseCharityCampaignUseCase = Symbol(
  'ICloseCharityCampaignUseCase',
);

export interface IGetCampaignNeedsCommand {
  /** uuid canonical hoặc slug — cùng lối với `GET /campaigns/:idOrSlug`. */
  readonly idOrSlug: string;
  /**
   * Người gọi, `null` khi chưa đăng nhập.
   *
   * Hiện chỉ dùng để quyết có thấy được chiến dịch CHƯA duyệt hay không: chủ sở
   * hữu đọc được bảng nhu cầu của hồ sơ mình đang chờ duyệt, người ngoài thì không.
   */
  readonly viewerUserId: string | null;
}

export type IGetCampaignNeedsResult = ICharityNeedsView;

export interface IGetCampaignNeedsUseCase extends IUseCase<
  IGetCampaignNeedsCommand,
  IGetCampaignNeedsResult
> {}

export const IGetCampaignNeedsUseCase = Symbol('IGetCampaignNeedsUseCase');

export interface ICreateCharityCampaignUseCase extends IUseCase<
  ICreateCharityCampaignCommand,
  ICharityCampaignView
> {}

export const ICreateCharityCampaignUseCase = Symbol(
  'ICreateCharityCampaignUseCase',
);

export interface IListPublicCharityCampaignsCommand {
  readonly limit: number;
  readonly offset: number;
  readonly phase?: CharityCampaignPhase;
}

export interface IListPublicCharityCampaignsUseCase extends IUseCase<
  IListPublicCharityCampaignsCommand,
  ICharityCampaignPageResult
> {}

export const IListPublicCharityCampaignsUseCase = Symbol(
  'IListPublicCharityCampaignsUseCase',
);

export interface IGetPublicCharityCampaignCommand {
  readonly idOrSlug: string;
}

export interface IGetPublicCharityCampaignResult {
  readonly campaign: ICharityCampaignView;
  readonly reviews: ICharityReview[];
  readonly reviewTotal: number;
}

export interface IGetPublicCharityCampaignUseCase extends IUseCase<
  IGetPublicCharityCampaignCommand,
  IGetPublicCharityCampaignResult
> {}

export const IGetPublicCharityCampaignUseCase = Symbol(
  'IGetPublicCharityCampaignUseCase',
);

export interface IListMyCharityCampaignsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface IListMyCharityCampaignsUseCase extends IUseCase<
  IListMyCharityCampaignsCommand,
  ICharityCampaignPageResult
> {}

export const IListMyCharityCampaignsUseCase = Symbol(
  'IListMyCharityCampaignsUseCase',
);

export interface IListJoinedCharityCampaignsUseCase extends IUseCase<
  IListMyCharityCampaignsCommand,
  ICharityCampaignPageResult
> {}

export const IListJoinedCharityCampaignsUseCase = Symbol(
  'IListJoinedCharityCampaignsUseCase',
);

export interface IJoinCharityCampaignCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
}

export interface IJoinCharityCampaignResult {
  readonly campaign: ICharityCampaignView;
}

export interface IJoinCharityCampaignUseCase extends IUseCase<
  IJoinCharityCampaignCommand,
  IJoinCharityCampaignResult
> {}

export const IJoinCharityCampaignUseCase = Symbol(
  'IJoinCharityCampaignUseCase',
);

export interface ICancelCharityParticipationUseCase extends IUseCase<
  IJoinCharityCampaignCommand,
  IJoinCharityCampaignResult
> {}

export const ICancelCharityParticipationUseCase = Symbol(
  'ICancelCharityParticipationUseCase',
);

export interface IReviewCharityCampaignCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
  readonly revieweeId: string;
  readonly rating: number;
  readonly comment?: string;
}

export interface IReviewCharityCampaignResult {
  readonly review: ICharityReview;
}

export interface IReviewCharityCampaignUseCase extends IUseCase<
  IReviewCharityCampaignCommand,
  IReviewCharityCampaignResult
> {}

export const IReviewCharityCampaignUseCase = Symbol(
  'IReviewCharityCampaignUseCase',
);

export interface IUpdateCharityProgressCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
  readonly currentItemsCount: number;
  /** Lượt gọi đi qua đường Admin — bỏ qua phép kiểm "phải là người tổ chức". */
  readonly asAdmin: boolean;
}

export interface IUpdateCharityProgressUseCase extends IUseCase<
  IUpdateCharityProgressCommand,
  ICharityCampaignView
> {}

export const IUpdateCharityProgressUseCase = Symbol(
  'IUpdateCharityProgressUseCase',
);

export interface IListAdminCharityCampaignsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
  readonly approvalStatus?: CharityApprovalStatus;
}

export interface IListAdminCharityCampaignsUseCase extends IUseCase<
  IListAdminCharityCampaignsCommand,
  ICharityCampaignPageResult
> {}

export const IListAdminCharityCampaignsUseCase = Symbol(
  'IListAdminCharityCampaignsUseCase',
);

export interface IDecideCharityApprovalCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
  readonly approve: boolean;
  readonly note?: string;
}

export interface IDecideCharityApprovalUseCase extends IUseCase<
  IDecideCharityApprovalCommand,
  ICharityCampaignView
> {}

export const IDecideCharityApprovalUseCase = Symbol(
  'IDecideCharityApprovalUseCase',
);

export interface ISetCharityCampaignActiveCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
  readonly isActive: boolean;
}

export interface ISetCharityCampaignActiveUseCase extends IUseCase<
  ISetCharityCampaignActiveCommand,
  ICharityCampaignView
> {}

export const ISetCharityCampaignActiveUseCase = Symbol(
  'ISetCharityCampaignActiveUseCase',
);
