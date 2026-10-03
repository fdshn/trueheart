import {
  CharityCampaignPhase,
  ICharityCampaign,
  ICharityReview,
} from '@/domain/ports/repository';
import { CharityApprovalStatus } from '@chantam.vn/chantam.core-lib/models';
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

export interface ICreateCharityCampaignCommand extends ICharityCampaignWriteInput {
  readonly actorUserId: string;
  /**
   * `true` khi lượt tạo đi qua đường Admin.
   *
   * Hai đường tạo dùng CHUNG use case này, và cờ do controller đặt chứ không do body —
   * một cờ nhận từ body là một cờ người dùng tự bật để bỏ qua bước duyệt.
   */
  readonly asAdmin: boolean;
}

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
