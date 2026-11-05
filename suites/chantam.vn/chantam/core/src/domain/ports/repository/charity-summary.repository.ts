import {
  CharityEvaluationSource,
  CharityFeaturedCta,
} from '@chantam.vn/chantam.core-lib/models';
import { ICharityUserBrief } from './charity-event.repository';

/** Dự án từ thiện — đợt 4a (CHARITY-PROJECT-LIFECYCLE §3.6, §3.14, §3.17). */

export interface ICharitySummaryContent {
  summary: string | null;
  usageReport: string | null;
  thanksMessage: string | null;
  lessonsLearned: string | null;
  evidenceUrls: string[];
}

export interface ICharitySummary extends ICharitySummaryContent {
  publishedAt: Date | null;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface ICharityFinancialReportInput {
  periodFrom: string;
  periodTo: string;
  totalIncome: number;
  totalExpense: number;
  explanation: string;
  statementUrls: string[];
}

export interface ICharityFinancialReport extends ICharityFinancialReportInput {
  reportId: string;
  balance: number;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface ICharityEvaluation {
  evaluationId: string;
  participant: ICharityUserBrief;
  completionScore: number;
  note: string | null;
  evaluatedBy: string | null;
  source: CharityEvaluationSource;
  createdAt: Date;
  /** Số lần đã chấm (gồm lần này). */
  version: number;
}

export interface ICharityPublicSupporters {
  supporterCount: number;
  participantCount: number;
  /** Nickname người cho phép hiện — tối đa `MaxPublicSupporterNames`. */
  supporters: string[];
  participants: string[];
}

export interface ICharityPromotion {
  featuredOnHome: boolean;
  featuredTitle: string | null;
  featuredMessage: string | null;
  featuredMediaUrl: string | null;
  featuredCta: CharityFeaturedCta | null;
  featuredFrom: Date | null;
  featuredUntil: Date | null;
  featuredPriority: number;
  promotionRequestedAt: Date | null;
  promotionRequestNote: string | null;
}

export interface ICharityHomeCard {
  campaignId: string;
  slug: string;
  title: string;
  message: string | null;
  mediaUrl: string | null;
  cta: CharityFeaturedCta;
  priority: number;
}

export interface ICharitySummaryRepository {
  // ── Tổng kết ──────────────────────────────────────────────────────────
  getSummary(campaignId: string): Promise<ICharitySummary | null>;
  /** Đã công khai thì sửa ghi revision `SUMMARY` cùng transaction. */
  saveSummary(params: {
    campaignId: string;
    actorId: string;
    content: ICharitySummaryContent;
  }): Promise<ICharitySummary>;
  /**
   * Công khai (hoặc công khai lại bản đã sửa). Lần công khai ĐẦU xếp thông báo
   * `SUMMARY_PUBLISHED` cùng transaction.
   */
  publishSummary(params: {
    campaignId: string;
    actorId: string;
  }): Promise<ICharitySummary | null>;

  listFinancialReports(campaignId: string): Promise<ICharityFinancialReport[]>;
  createFinancialReport(params: {
    campaignId: string;
    actorId: string;
    report: ICharityFinancialReportInput;
  }): Promise<ICharityFinancialReport>;
  /** Tổng kết đã công khai thì ghi revision `FINANCIAL_REPORT`. `null` khi không có. */
  updateFinancialReport(params: {
    campaignId: string;
    reportId: string;
    actorId: string;
    report: ICharityFinancialReportInput;
  }): Promise<ICharityFinancialReport | null>;

  // ── Chấm mức hoàn thành ───────────────────────────────────────────────
  /** Người tham gia: đăng ký tham gia còn hiệu lực, tuyển người không huỷ, cộng tác viên sự kiện. */
  listEvaluationCandidates(campaignId: string): Promise<ICharityUserBrief[]>;
  isEvaluationCandidate(campaignId: string, userId: string): Promise<boolean>;
  /** Điểm hiện hành (lần chấm mới nhất) của từng người. */
  listLatestEvaluations(campaignId: string): Promise<ICharityEvaluation[]>;
  latestEvaluation(
    campaignId: string,
    participantId: string,
  ): Promise<ICharityEvaluation | null>;
  addEvaluation(params: {
    campaignId: string;
    participantId: string;
    completionScore: number;
    note: string | null;
    evaluatedBy: string;
    source: CharityEvaluationSource;
  }): Promise<ICharityEvaluation>;

  // ── Nickname công khai ────────────────────────────────────────────────
  /**
   * Đặt lựa chọn hiện tên của MỘT đóng góp (của chính người góp). `show = null` → lấy cài
   * đặt chung của người đó. `false` khi không phải đóng góp của người này.
   */
  setContributionPublicName(params: {
    campaignId: string;
    contributionId: string;
    userId: string;
    show: boolean | null;
  }): Promise<boolean>;
  /** Như trên cho đăng ký tham gia còn hiệu lực. */
  setParticipationPublicName(params: {
    campaignId: string;
    userId: string;
    show: boolean | null;
  }): Promise<boolean>;
  publicSupporters(
    campaignId: string,
    limit: number,
  ): Promise<ICharityPublicSupporters>;

  // ── Card Home ─────────────────────────────────────────────────────────
  getPromotion(campaignId: string): Promise<ICharityPromotion | null>;
  requestPromotion(params: {
    campaignId: string;
    note: string | null;
  }): Promise<void>;
  setPromotion(params: {
    campaignId: string;
    actorId: string;
    reason: string;
    promotion: Omit<
      ICharityPromotion,
      'promotionRequestedAt' | 'promotionRequestNote'
    >;
  }): Promise<ICharityPromotion | null>;
  /** Card đang hiện: Admin bật, trong khung giờ, dự án còn chạy và chưa đình chỉ. */
  listHomeCards(limit: number): Promise<ICharityHomeCard[]>;
}

export const ICharitySummaryRepository = Symbol('ICharitySummaryRepository');
