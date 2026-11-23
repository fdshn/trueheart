import {
  CharityCampaignPhase,
  CharityDeliveryStatus,
  ICharityBeneficiary,
  ICharityCampaign,
  ICharityContribution,
  ICharityContributionPage,
  ICharityDelivery,
  ICharityExternalContribution,
  ICharityFundingNeedInput,
  ICharityNeedsView,
  ICharityReview,
  ICharitySupportNeedInput,
  ICloseCampaignResult,
  IDecideContributionResult,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  CharityApprovalStatus,
  CharityBeneficiaryKind,
  CharityBeneficiaryRelation,
  CharityCampaignType,
  CharityContributionStatus,
  CharityContributionType,
  CharityRejectionReason,
  CharityServiceChannel,
  CharitySupportType,
  ICharityPublicBeneficiary,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';
import { IStorageUploadResult } from '@chantam/service.storage-lib';

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
/**
 * Người thụ hưởng như CLIENT gửi lên — trường tuỳ chọn để trống được. Use case chuẩn
 * hoá về `ICharityBeneficiaryInput` (trống thành `null`) trước khi xuống repository.
 */
export interface ICharityBeneficiaryCommandInput {
  readonly fullName: string;
  readonly relationNote: string;
  readonly phone?: string;
  readonly address?: string;
  readonly consentStatus: 'PENDING' | 'CONFIRMED';
  readonly verificationNote?: string;
}

export interface ICharityNeedItemInput {
  readonly categoryId?: string;
  readonly itemName: string;
  readonly description?: string;
  readonly unit: string;
  readonly targetQuantity: number;
  readonly allowAlternative?: boolean;
  /** Số lượng mỗi suất (≥ 1, mặc định 1) — sàn = tổng suất × giá trị này (CR 22/11/2026). */
  readonly quantityPerPortion?: number;
}

/** Một đơn vị nhận khai lúc tạo chiến dịch (CR 22/11/2026 §3.17d). */
export interface ICharityBeneficiaryUnitInput {
  readonly name: string;
  readonly beneficiaryKind: CharityBeneficiaryKind;
  readonly address?: string;
  readonly phone?: string;
  readonly picName?: string;
  readonly picPhone?: string;
  readonly consentStatus?: 'PENDING' | 'CONFIRMED';
  readonly estimatedPortions: number;
  readonly estimatedAmount: number;
  readonly lat?: number;
  readonly lng?: number;
  readonly distributionAt?: string;
}

export interface ICharityCampaignWriteInput {
  readonly title: string;
  readonly slug?: string;
  readonly description: string;
  /**
   * 1–5 key lấy từ `POST /charity-campaigns/media/upload`. Thứ tự trong mảng là thứ tự
   * hiển thị. KHÔNG nhận URL: URL là thứ server dựng sau khi HeadObject xác nhận key.
   */
  readonly media: readonly string[];
  /** Một key trong `media`, phải là ảnh. Server ghi `banner_url` từ nó. */
  readonly coverKey: string;
  readonly badgeName: string;
  readonly targetItemsCount?: number;
  readonly lat?: number;
  readonly lng?: number;
  readonly locationLabel?: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface ICharityCampaignDistributionInput {
  readonly method:
    | 'DIRECT_RECIPIENT'
    | 'SHIPPING'
    | 'OTHER_LOCATION'
    | 'BANK_TRANSFER'
    | 'SERVICE';
  readonly contributionTypes: readonly CharityContributionType[];
  readonly location?: {
    readonly label?: string;
    readonly address?: string;
    readonly lat?: number;
    readonly lng?: number;
  };
  /** Tuỳ chọn (alias một bản phát hành) — có đủ hai mốc mới ghi phase DISTRIBUTION. */
  readonly scheduledStart?: string;
  readonly scheduledEnd?: string;
  readonly recipientName?: string;
  readonly recipientPhone?: string;
  readonly recipientAddress?: string;
  readonly coordinatorName?: string;
  readonly coordinatorPhone?: string;
  readonly carrier?: string;
  readonly shippingFeePayer?: 'ORGANIZER' | 'RECIPIENT';
  readonly estimatedShippingFee?: number;
  readonly trackingCode?: string;
  readonly transferContent?: string;
  readonly serviceType?: CharitySupportType;
  readonly serviceChannel?: CharityServiceChannel;
}

export interface ICreateCharityCampaignInput extends ICharityCampaignWriteInput {
  /**
   * `false` = lưu NHÁP: chưa xét duyệt, không vào hàng đợi Admin, gửi sau bằng
   * `POST /charity-campaigns/:id/submit`. Bỏ trống = `true` — đúng hành vi của app cũ
   * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.1, §5).
   */
  readonly submit?: boolean;
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
  readonly acceptedContributionTypes?: readonly CharityContributionType[];
  readonly fundingNeeds?: readonly (Omit<
    ICharityFundingNeedInput,
    | 'beneficiaryPartyId'
    | 'bankAccountId'
    | 'description'
    | 'deadline'
    | 'sortOrder'
  > & {
    readonly beneficiaryPartyId?: string;
    readonly bankAccountId?: string;
    readonly description?: string;
    /** @deprecated CR 22/11/2026 — bỏ qua; đơn vị nhận là `campaign_parties`. */
    readonly receivingUnit?: string;
    readonly deadline?: Date;
  })[];
  readonly otherSupportNeeds?: readonly (Omit<
    ICharitySupportNeedInput,
    | 'description'
    | 'startsAt'
    | 'endsAt'
    | 'locationLabel'
    | 'requirements'
    | 'handoverMethod'
    | 'picName'
    | 'picPhone'
    | 'sortOrder'
  > & {
    readonly description?: string;
    readonly startsAt?: Date;
    readonly endsAt?: Date;
    readonly locationLabel?: string;
    readonly requirements?: string;
    readonly handoverMethod?: string;
    readonly picName?: string;
    readonly picPhone?: string;
  })[];
  readonly distribution?: ICharityCampaignDistributionInput;
  /** Cho lượt chấp nhận đề nghị vượt mục tiêu từng dòng (§5). Mặc định `false`. */
  readonly allowOverTarget?: boolean;
  /** Số người tham gia tối thiểu (PR #54), 0–100.000. Bỏ trống = `0` (không đặt). */
  readonly minimumParticipants?: number;
  /** Hạng tối thiểu để đăng ký tham gia (PR #54). Bỏ trống/`null` = không giới hạn. */
  readonly minimumParticipantRank?: UserRanks | null;
  /**
   * Người thụ hưởng — CHỈ cho `INDIVIDUAL_APPEAL` + `OTHER`. Thiếu, hoặc đồng ý chưa
   * `CONFIRMED`, thì hoạt động vào `PENDING_APPROVAL` kể cả khi người tạo có quyền
   * public ngay (§2).
   */
  readonly beneficiary?: ICharityBeneficiaryCommandInput;
  /**
   * Đơn vị nhận của chiến dịch có tổ chức (CR 22/11/2026): tối đa
   * `charity.max_beneficiaries_per_campaign`. Kêu gọi cá nhân dùng `beneficiary`.
   */
  readonly beneficiaries?: readonly ICharityBeneficiaryUnitInput[];
  /**
   * Điểm tiếp nhận (CR 22/11/2026 §3.17c), tối đa `charity.max_intake_locations`. Bỏ trống mà có
   * `lat`/`lng`/`locationLabel` (cũ) thì thành một điểm. Chiến dịch nhận hiện vật gửi duyệt cần
   * ít nhất một điểm.
   */
  readonly intakeLocations?: readonly ICharityIntakeLocationCommandInput[];
  /** Bắt đầu tiếp nhận — bí danh của `startTime` (giữ một bản phát hành). */
  readonly intakeStartsAt?: string;
  readonly intakeEndsAt?: string;
  /** Khung trao → phase DISTRIBUTION (thay `distribution.scheduledStart/End`). */
  readonly distributionStartsAt?: string;
  readonly distributionEndsAt?: string;
}

export interface ICharityIntakeLocationCommandInput {
  readonly label: string;
  readonly address?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly scheduleNote?: string;
  readonly contactName?: string;
  readonly contactPhone?: string;
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
  /**
   * Hiện nickname trong danh sách người ủng hộ công khai (CHARITY-PROJECT-LIFECYCLE §3.17).
   * Bỏ trống = theo cài đặt chung `showInPublicSupporterLists` của tài khoản.
   */
  readonly showNamePublicly?: boolean;
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
  /** `COMPLETED` = chỉ người đã đóng góp thành công (giao nhận xong). */
  readonly deliveryStatus?: CharityDeliveryStatus;
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
  readonly status?: CharityContributionStatus;
  readonly deliveryStatus?: CharityDeliveryStatus;
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
    confirmedValue?: number | null;
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

export interface IGetCharityContributionCommand {
  readonly contributionId: string;
  readonly viewerUserId: string;
}

export interface IGetCharityContributionUseCase extends IUseCase<
  IGetCharityContributionCommand,
  ICharityContribution
> {}

export const IGetCharityContributionUseCase = Symbol(
  'IGetCharityContributionUseCase',
);

export interface IRecordExternalContributionCommand {
  readonly campaignId: string;
  readonly recordedBy: string;
  readonly needItemId: string;
  readonly quantity: number;
  readonly sourceLabel: string;
  readonly receivedAt: string;
  readonly evidenceNote?: string;
  readonly sourceReference?: string;
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
  /**
   * Chỉ Admin: đóng dù chưa công khai tổng kết (CR 22/11/2026). Bắt buộc `reason`, ghi audit
   * `CHARITY_CAMPAIGN_FORCE_CLOSE`. Chủ dự án gửi `force` không có tác dụng.
   */
  readonly force?: boolean;
  readonly reason?: string;
}

export interface ICloseCharityCampaignUseCase extends IUseCase<
  ICloseCharityCampaignCommand,
  ICloseCampaignResult
> {}

export const ICloseCharityCampaignUseCase = Symbol(
  'ICloseCharityCampaignUseCase',
);

export interface IExtendCharityCampaignCommand {
  readonly campaignId: string;
  readonly actorUserId: string;
  readonly endTime: string;
  readonly reason: string;
}

export interface IExtendCharityCampaignUseCase extends IUseCase<
  IExtendCharityCampaignCommand,
  { campaignId: string; previousEndTime: Date; newEndTime: Date }
> {}

export const IExtendCharityCampaignUseCase = Symbol(
  'IExtendCharityCampaignUseCase',
);

export interface IManageCharityCoordinatorsCommand {
  readonly campaignId: string;
  readonly actorUserId: string;
  readonly action: 'GRANT' | 'REVOKE' | 'LIST';
  /** Bắt buộc với `GRANT`/`REVOKE`. */
  readonly userId?: string;
}

export interface IManageCharityCoordinatorsResult {
  readonly coordinators: readonly {
    userId: string;
    grantedBy: string;
    grantedAt: Date;
  }[];
}

export interface IManageCharityCoordinatorsUseCase extends IUseCase<
  IManageCharityCoordinatorsCommand,
  IManageCharityCoordinatorsResult
> {}

export const IManageCharityCoordinatorsUseCase = Symbol(
  'IManageCharityCoordinatorsUseCase',
);

export interface IManageCharityBeneficiaryCommand {
  readonly campaignId: string;
  readonly actorUserId: string;
  /** `undefined` là ĐỌC; có giá trị là GHI. */
  readonly beneficiary?: ICharityBeneficiaryCommandInput;
}

export interface IManageCharityBeneficiaryResult {
  readonly beneficiary: ICharityBeneficiary | null;
  /** `true` khi lượt ghi vừa ẨN hoạt động vì đồng ý không còn `CONFIRMED`. */
  readonly hidden: boolean;
}

export interface IManageCharityBeneficiaryUseCase extends IUseCase<
  IManageCharityBeneficiaryCommand,
  IManageCharityBeneficiaryResult
> {}

export const IManageCharityBeneficiaryUseCase = Symbol(
  'IManageCharityBeneficiaryUseCase',
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

export interface IGetAdminCampaignNeedsCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
}

export interface IGetAdminCampaignNeedsUseCase extends IUseCase<
  IGetAdminCampaignNeedsCommand,
  IGetCampaignNeedsResult
> {}

export const IGetAdminCampaignNeedsUseCase = Symbol(
  'IGetAdminCampaignNeedsUseCase',
);

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
  /** Đơn vị nhận công khai — cùng hình dạng với `GET /charity-campaigns/:idOrSlug/project`. */
  readonly beneficiaries: ICharityPublicBeneficiary[];
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
  /** Đang mở, đã qua `end_time`, chưa công khai tổng kết. */
  readonly overdueSummary?: boolean;
}

export interface IListAdminCharityCampaignsUseCase extends IUseCase<
  IListAdminCharityCampaignsCommand,
  ICharityCampaignPageResult
> {}

export const IListAdminCharityCampaignsUseCase = Symbol(
  'IListAdminCharityCampaignsUseCase',
);

export interface IGetAdminCharityCampaignCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
}

export interface IGetAdminCharityCampaignResult {
  readonly campaign: ICharityCampaignView;
}

export interface IGetAdminCharityCampaignUseCase extends IUseCase<
  IGetAdminCharityCampaignCommand,
  IGetAdminCharityCampaignResult
> {}

export const IGetAdminCharityCampaignUseCase = Symbol(
  'IGetAdminCharityCampaignUseCase',
);

/**
 * Admin sửa nội dung (CMS). Trường bỏ trống (`undefined`) là GIỮ NGUYÊN; `null` ở
 * `locationLabel` hay cặp `lat`/`lng` là XOÁ.
 */
export interface IUpdateAdminCharityCampaignCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
  readonly title?: string;
  readonly description?: string;
  readonly badgeName?: string;
  readonly targetItemsCount?: number;
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly locationLabel?: string | null;
  /** Bỏ trống = giữ nguyên (PR #54). */
  readonly minimumParticipants?: number;
  /** Bỏ trống = giữ nguyên; `null` = bỏ giới hạn hạng. Không đụng người ĐÃ đăng ký. */
  readonly minimumParticipantRank?: UserRanks | null;
  readonly acceptedContributionTypes?: readonly CharityContributionType[];
  readonly reason: string;
}

export interface IUpdateAdminCharityCampaignUseCase extends IUseCase<
  IUpdateAdminCharityCampaignCommand,
  ICharityCampaignView
> {}

export const IUpdateAdminCharityCampaignUseCase = Symbol(
  'IUpdateAdminCharityCampaignUseCase',
);

export interface IDeleteCharityCampaignCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
  readonly reason: string;
}

export interface IDeleteCharityCampaignUseCase extends IUseCase<
  IDeleteCharityCampaignCommand,
  { readonly campaignId: string }
> {}

export const IDeleteCharityCampaignUseCase = Symbol(
  'IDeleteCharityCampaignUseCase',
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

export interface IRequestCharityMediaUploadCommand {
  readonly userId: string;
  readonly contentType: string;
  readonly contentLength: number;
}

export type IRequestCharityMediaUploadResult = IStorageUploadResult;

export interface IRequestCharityMediaUploadUseCase extends IUseCase<
  IRequestCharityMediaUploadCommand,
  IRequestCharityMediaUploadResult
> {}

export const IRequestCharityMediaUploadUseCase = Symbol(
  'IRequestCharityMediaUploadUseCase',
);

export interface IReplaceCharityMediaCommand {
  readonly campaignId: string;
  readonly actorUserId: string;
  readonly media: readonly string[];
  readonly coverKey: string;
}

export interface IReplaceCharityMediaUseCase extends IUseCase<
  IReplaceCharityMediaCommand,
  ICharityCampaignView
> {}

export const IReplaceCharityMediaUseCase = Symbol(
  'IReplaceCharityMediaUseCase',
);
