import {
  ICharityEvaluation,
  ICharityFinancialReport,
  ICharityFinancialReportInput,
  ICharityHomeCard,
  ICharityPromotion,
  ICharitySummary,
  ICharitySummaryContent,
  ICharityUserBrief,
} from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';
import { ICharityProjectCommand } from './charity-project.contract';

/** Dự án từ thiện 4 giai đoạn — đợt 4a (CHARITY-PROJECT-LIFECYCLE §3.6, §3.14, §3.17). */

export interface ICharitySummaryBoard {
  summary: ICharitySummary | null;
  financialReports: ICharityFinancialReport[];
  /** Có nhận tiền → cần ít nhất một báo cáo tài chính trước khi công khai. */
  financialReportRequired: boolean;
}

export interface IGetCharitySummaryUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharitySummaryBoard
> {}
export const IGetCharitySummaryUseCase = Symbol('IGetCharitySummaryUseCase');

export interface ISaveCharitySummaryCommand extends ICharityProjectCommand {
  readonly content: ICharitySummaryContent;
}
export interface ISaveCharitySummaryUseCase extends IUseCase<
  ISaveCharitySummaryCommand,
  ICharitySummary
> {}
export const ISaveCharitySummaryUseCase = Symbol('ISaveCharitySummaryUseCase');

export interface IPublishCharitySummaryUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharitySummary
> {}
export const IPublishCharitySummaryUseCase = Symbol(
  'IPublishCharitySummaryUseCase',
);

export interface ISaveCharityFinancialReportCommand extends ICharityProjectCommand {
  /** Bỏ trống = tạo mới. */
  readonly reportId: string | null;
  readonly report: ICharityFinancialReportInput;
}
export interface ISaveCharityFinancialReportUseCase extends IUseCase<
  ISaveCharityFinancialReportCommand,
  ICharityFinancialReport
> {}
export const ISaveCharityFinancialReportUseCase = Symbol(
  'ISaveCharityFinancialReportUseCase',
);

export interface ICharityEvaluationBoard {
  evaluations: ICharityEvaluation[];
  candidates: ICharityUserBrief[];
}
export interface IListCharityEvaluationsUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityEvaluationBoard
> {}
export const IListCharityEvaluationsUseCase = Symbol(
  'IListCharityEvaluationsUseCase',
);

export interface IEvaluateCharityParticipantCommand extends ICharityProjectCommand {
  readonly participantId: string;
  readonly completionScore: number;
  readonly note: string | null;
}
export interface IEvaluateCharityParticipantUseCase extends IUseCase<
  IEvaluateCharityParticipantCommand,
  ICharityEvaluation
> {}
export const IEvaluateCharityParticipantUseCase = Symbol(
  'IEvaluateCharityParticipantUseCase',
);

/** Người được chấm xem điểm CỦA MÌNH — không có ghi chú nội bộ. */
export interface IMyCharityEvaluation {
  evaluationId: string;
  completionScore: number;
  createdAt: Date;
  version: number;
}
export interface IGetMyCharityEvaluationUseCase extends IUseCase<
  ICharityProjectCommand,
  IMyCharityEvaluation | null
> {}
export const IGetMyCharityEvaluationUseCase = Symbol(
  'IGetMyCharityEvaluationUseCase',
);

export interface ISetCharityPublicNameCommand extends ICharityProjectCommand {
  /** Có thì là một đóng góp; không thì là đăng ký tham gia. */
  readonly contributionId: string | null;
  /** `null` = theo cài đặt chung của tài khoản. */
  readonly show: boolean | null;
}
export interface ISetCharityPublicNameUseCase extends IUseCase<
  ISetCharityPublicNameCommand,
  { updated: true }
> {}
export const ISetCharityPublicNameUseCase = Symbol(
  'ISetCharityPublicNameUseCase',
);

export interface IRequestCharityPromotionCommand extends ICharityProjectCommand {
  readonly note: string | null;
}
export interface IRequestCharityPromotionUseCase extends IUseCase<
  IRequestCharityPromotionCommand,
  ICharityPromotion
> {}
export const IRequestCharityPromotionUseCase = Symbol(
  'IRequestCharityPromotionUseCase',
);

export interface ISetCharityPromotionCommand extends ICharityProjectCommand {
  readonly reason: string;
  readonly promotion: Omit<
    ICharityPromotion,
    'promotionRequestedAt' | 'promotionRequestNote'
  >;
}
export interface ISetCharityPromotionUseCase extends IUseCase<
  ISetCharityPromotionCommand,
  ICharityPromotion
> {}
export const ISetCharityPromotionUseCase = Symbol(
  'ISetCharityPromotionUseCase',
);

export interface IListCharityHomeCardsUseCase extends IUseCase<
  { limit: number },
  ICharityHomeCard[]
> {}
export const IListCharityHomeCardsUseCase = Symbol(
  'IListCharityHomeCardsUseCase',
);
