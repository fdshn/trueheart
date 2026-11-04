import {
  ICharityEvaluation,
  ICharityFinancialReport,
  ICharityFinancialReportInput,
  ICharityHomeCard,
  ICharityPromotion,
  ICharityPublicSupporters,
  ICharitySummary,
  ICharitySummaryContent,
  ICharitySummaryRepository,
  ICharityUserBrief,
} from '@/domain/ports/repository';
import {
  CharityEvaluationSource,
  CharityFeaturedCta,
  diffCharityRevisions,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { recordCharityRevisions } from './charity-revision.writer';
import { updateReturning } from './update-returning';

interface ISummaryRow {
  summary: string | null;
  usage_report: string | null;
  thanks_message: string | null;
  lessons_learned: string | null;
  evidence_urls: string[];
  published_at: Date | null;
  updated_by: string | null;
  updated_at: Date;
}

const SummaryColumns = `summary, usage_report, thanks_message, lessons_learned, evidence_urls,
  published_at, updated_by, updated_at`;

const toSummary = (row: ISummaryRow): ICharitySummary => ({
  summary: row.summary,
  usageReport: row.usage_report,
  thanksMessage: row.thanks_message,
  lessonsLearned: row.lessons_learned,
  evidenceUrls: row.evidence_urls ?? [],
  publishedAt: row.published_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
});

interface IReportRow {
  global_id: string;
  period_from: string;
  period_to: string;
  total_income: string | number;
  total_expense: string | number;
  balance: string | number;
  explanation: string;
  statement_urls: string[];
  updated_by: string | null;
  updated_at: Date;
}

const ReportColumns = `global_id, to_char(period_from, 'YYYY-MM-DD') AS period_from,
  to_char(period_to, 'YYYY-MM-DD') AS period_to, total_income, total_expense, balance,
  explanation, statement_urls, updated_by, updated_at`;

const toReport = (row: IReportRow): ICharityFinancialReport => ({
  reportId: row.global_id,
  periodFrom: row.period_from,
  periodTo: row.period_to,
  totalIncome: Number(row.total_income),
  totalExpense: Number(row.total_expense),
  balance: Number(row.balance),
  explanation: row.explanation,
  statementUrls: row.statement_urls ?? [],
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
});

interface IEvaluationRow {
  global_id: string;
  participant_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  completion_score: number;
  note: string | null;
  evaluated_by: string | null;
  source: CharityEvaluationSource;
  created_at: Date;
  version: string | number;
}

const toEvaluation = (row: IEvaluationRow): ICharityEvaluation => ({
  evaluationId: row.global_id,
  participant: {
    userId: row.participant_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  },
  completionScore: row.completion_score,
  note: row.note,
  evaluatedBy: row.evaluated_by,
  source: row.source,
  createdAt: row.created_at,
  version: Number(row.version),
});

const EvaluationSelect = `
  SELECT evaluation.global_id, evaluation.participant_id, account.username, account.full_name,
         account.avatar_url, evaluation.completion_score, evaluation.note,
         evaluation.evaluated_by, evaluation.source, evaluation.created_at,
         (SELECT count(*) FROM campaign_participant_evaluations earlier
           WHERE earlier.campaign_id = evaluation.campaign_id
             AND earlier.participant_id = evaluation.participant_id
             AND earlier.id <= evaluation.id) AS version
  FROM campaign_participant_evaluations evaluation
  JOIN users account ON account.global_id = evaluation.participant_id`;

/** Người tham gia của dự án `$1` (đăng ký còn hiệu lực, tuyển người không huỷ, cộng tác viên). */
const CandidateWhere = (userColumn: string) => `(
  EXISTS (SELECT 1 FROM campaign_participations participation
          WHERE participation.campaign_id = $1 AND participation.user_id = ${userColumn}
            AND participation.status = 'REGISTERED')
  OR EXISTS (SELECT 1 FROM campaign_volunteer_registrations registration
             JOIN campaign_volunteer_needs need ON need.global_id = registration.volunteer_need_id
             WHERE need.campaign_id = $1 AND registration.user_id = ${userColumn}
               AND registration.status <> 'CANCELLED')
  OR EXISTS (SELECT 1 FROM campaign_event_contributors contributor
             WHERE contributor.campaign_id = $1 AND contributor.user_id = ${userColumn}))`;

interface IPromotionRow {
  featured_on_home: boolean;
  featured_title: string | null;
  featured_message: string | null;
  featured_media_url: string | null;
  featured_cta: CharityFeaturedCta | null;
  featured_from: Date | null;
  featured_until: Date | null;
  featured_priority: number;
  promotion_requested_at: Date | null;
  promotion_request_note: string | null;
}

const PromotionColumns = `featured_on_home, featured_title, featured_message,
  featured_media_url, featured_cta, featured_from, featured_until, featured_priority,
  promotion_requested_at, promotion_request_note`;

const toPromotion = (row: IPromotionRow): ICharityPromotion => ({
  featuredOnHome: row.featured_on_home,
  featuredTitle: row.featured_title,
  featuredMessage: row.featured_message,
  featuredMediaUrl: row.featured_media_url,
  featuredCta: row.featured_cta,
  featuredFrom: row.featured_from,
  featuredUntil: row.featured_until,
  featuredPriority: row.featured_priority,
  promotionRequestedAt: row.promotion_requested_at,
  promotionRequestNote: row.promotion_request_note,
});

/** Dự án từ thiện — đợt 4a (CHARITY-PROJECT-LIFECYCLE §3.6, §3.14, §3.17). */
@Injectable()
export class CharitySummaryRepository implements ICharitySummaryRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  // ── Tổng kết ──────────────────────────────────────────────────────────

  public async getSummary(campaignId: string): Promise<ICharitySummary | null> {
    const [row] = await this.manager.query<ISummaryRow[]>(
      `SELECT ${SummaryColumns} FROM campaign_summaries WHERE campaign_id = $1`,
      [campaignId],
    );
    return row ? toSummary(row) : null;
  }

  public async saveSummary(params: {
    campaignId: string;
    actorId: string;
    content: ICharitySummaryContent;
  }): Promise<ICharitySummary> {
    return this.manager.transaction(async (manager) => {
      const [before] = await manager.query<ISummaryRow[]>(
        `SELECT ${SummaryColumns} FROM campaign_summaries WHERE campaign_id = $1 FOR UPDATE`,
        [params.campaignId],
      );
      const content = params.content;
      const [row] = await manager.query<ISummaryRow[]>(
        `INSERT INTO campaign_summaries
           (campaign_id, summary, usage_report, thanks_message, lessons_learned,
            evidence_urls, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (campaign_id) DO UPDATE
           SET summary = EXCLUDED.summary, usage_report = EXCLUDED.usage_report,
               thanks_message = EXCLUDED.thanks_message,
               lessons_learned = EXCLUDED.lessons_learned,
               evidence_urls = EXCLUDED.evidence_urls, updated_by = EXCLUDED.updated_by,
               updated_at = now()
         RETURNING ${SummaryColumns}`,
        [
          params.campaignId,
          content.summary,
          content.usageReport,
          content.thanksMessage,
          content.lessonsLearned,
          JSON.stringify(content.evidenceUrls),
          params.actorId,
        ],
      );
      const after = toSummary(row);
      // Sửa SAU khi công khai mới là "chữ đỏ" — trước đó vẫn là bản nháp.
      if (before?.published_at) {
        const snapshot = (summary: ICharitySummary) => [
          {
            id: null,
            values: summary as unknown as Record<string, unknown>,
          },
        ];
        await recordCharityRevisions(manager, {
          campaignId: params.campaignId,
          actorId: params.actorId,
          reason: null,
          drafts: diffCharityRevisions(
            'SUMMARY',
            snapshot(toSummary(before)),
            snapshot(after),
          ),
        });
      }
      return after;
    });
  }

  public async publishSummary(params: {
    campaignId: string;
    actorId: string;
  }): Promise<ICharitySummary | null> {
    return this.manager.transaction(async (manager) => {
      const rows = await updateReturning<ISummaryRow>(
        manager,
        `UPDATE campaign_summaries
         SET published_at = now(), updated_by = $2, updated_at = now()
         WHERE campaign_id = $1
         RETURNING ${SummaryColumns}`,
        [params.campaignId, params.actorId],
      );
      if (rows.length === 0) return null;
      // Chỉ lần ĐẦU báo người theo dõi; công khai lại bản sửa không gửi lần nữa (khoá chống
      // trùng theo dự án).
      await manager.query(
        `INSERT INTO campaign_announcements (campaign_id, kind, payload, dedupe_key, actor_id)
         VALUES ($1, 'SUMMARY_PUBLISHED', '{}'::jsonb, 'first', $2)
         ON CONFLICT (campaign_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
        [params.campaignId, params.actorId],
      );
      return toSummary(rows[0]);
    });
  }

  public async listFinancialReports(
    campaignId: string,
  ): Promise<ICharityFinancialReport[]> {
    const rows = await this.manager.query<IReportRow[]>(
      `SELECT ${ReportColumns} FROM campaign_financial_reports
       WHERE campaign_id = $1 ORDER BY period_from, id`,
      [campaignId],
    );
    return rows.map(toReport);
  }

  public async createFinancialReport(params: {
    campaignId: string;
    actorId: string;
    report: ICharityFinancialReportInput;
  }): Promise<ICharityFinancialReport> {
    return this.manager.transaction(async (manager) => {
      const report = params.report;
      const [row] = await manager.query<IReportRow[]>(
        `INSERT INTO campaign_financial_reports
           (campaign_id, period_from, period_to, total_income, total_expense, explanation,
            statement_urls, updated_by)
         VALUES ($1, $2::date, $3::date, $4, $5, $6, $7::jsonb, $8)
         RETURNING ${ReportColumns}`,
        [
          params.campaignId,
          report.periodFrom,
          report.periodTo,
          report.totalIncome,
          report.totalExpense,
          report.explanation,
          JSON.stringify(report.statementUrls),
          params.actorId,
        ],
      );
      const created = toReport(row);
      await this.revisionIfPublished(manager, params, null, created);
      return created;
    });
  }

  public async updateFinancialReport(params: {
    campaignId: string;
    reportId: string;
    actorId: string;
    report: ICharityFinancialReportInput;
  }): Promise<ICharityFinancialReport | null> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<IReportRow[]>(
        `SELECT ${ReportColumns} FROM campaign_financial_reports
         WHERE campaign_id = $1 AND global_id = $2 FOR UPDATE`,
        [params.campaignId, params.reportId],
      );
      if (!current) return null;
      const report = params.report;
      const [row] = await updateReturning<IReportRow>(
        manager,
        `UPDATE campaign_financial_reports
         SET period_from = $3::date, period_to = $4::date, total_income = $5,
             total_expense = $6, explanation = $7, statement_urls = $8::jsonb,
             updated_by = $9, updated_at = now()
         WHERE campaign_id = $1 AND global_id = $2
         RETURNING ${ReportColumns}`,
        [
          params.campaignId,
          params.reportId,
          report.periodFrom,
          report.periodTo,
          report.totalIncome,
          report.totalExpense,
          report.explanation,
          JSON.stringify(report.statementUrls),
          params.actorId,
        ],
      );
      const updated = toReport(row);
      await this.revisionIfPublished(
        manager,
        params,
        toReport(current),
        updated,
      );
      return updated;
    });
  }

  private async revisionIfPublished(
    manager: EntityManager,
    params: { campaignId: string; actorId: string },
    before: ICharityFinancialReport | null,
    after: ICharityFinancialReport,
  ): Promise<void> {
    const [published] = await manager.query<{ ok: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM campaign_summaries
                      WHERE campaign_id = $1 AND published_at IS NOT NULL) AS ok`,
      [params.campaignId],
    );
    if (!published?.ok) return;
    const row = (report: ICharityFinancialReport) => ({
      id: report.reportId,
      values: report as unknown as Record<string, unknown>,
    });
    await recordCharityRevisions(manager, {
      campaignId: params.campaignId,
      actorId: params.actorId,
      reason: null,
      drafts: diffCharityRevisions(
        'FINANCIAL_REPORT',
        before ? [row(before)] : [],
        [row(after)],
      ),
    });
  }

  // ── Chấm mức hoàn thành ───────────────────────────────────────────────

  public async listEvaluationCandidates(
    campaignId: string,
  ): Promise<ICharityUserBrief[]> {
    const rows = await this.manager.query<
      {
        global_id: string;
        username: string | null;
        full_name: string | null;
        avatar_url: string | null;
      }[]
    >(
      `SELECT account.global_id, account.username, account.full_name, account.avatar_url
       FROM users account
       WHERE account.deleted_at IS NULL AND ${CandidateWhere('account.global_id')}
       ORDER BY account.username
       LIMIT 1000`,
      [campaignId],
    );
    return rows.map((row) => ({
      userId: row.global_id,
      username: row.username,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
    }));
  }

  public async isEvaluationCandidate(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ ok: boolean }[]>(
      `SELECT ${CandidateWhere('$2::uuid')} AS ok`,
      [campaignId, userId],
    );
    return row?.ok === true;
  }

  public async listLatestEvaluations(
    campaignId: string,
  ): Promise<ICharityEvaluation[]> {
    const rows = await this.manager.query<IEvaluationRow[]>(
      `${EvaluationSelect}
       WHERE evaluation.campaign_id = $1
         AND evaluation.id = (SELECT max(latest.id) FROM campaign_participant_evaluations latest
                              WHERE latest.campaign_id = evaluation.campaign_id
                                AND latest.participant_id = evaluation.participant_id)
       ORDER BY account.username`,
      [campaignId],
    );
    return rows.map(toEvaluation);
  }

  public async latestEvaluation(
    campaignId: string,
    participantId: string,
  ): Promise<ICharityEvaluation | null> {
    const [row] = await this.manager.query<IEvaluationRow[]>(
      `${EvaluationSelect}
       WHERE evaluation.campaign_id = $1 AND evaluation.participant_id = $2
       ORDER BY evaluation.id DESC LIMIT 1`,
      [campaignId, participantId],
    );
    return row ? toEvaluation(row) : null;
  }

  public async addEvaluation(params: {
    campaignId: string;
    participantId: string;
    completionScore: number;
    note: string | null;
    evaluatedBy: string;
    source: CharityEvaluationSource;
  }): Promise<ICharityEvaluation> {
    await this.manager.query(
      `INSERT INTO campaign_participant_evaluations
         (campaign_id, participant_id, completion_score, note, evaluated_by, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.campaignId,
        params.participantId,
        params.completionScore,
        params.note,
        params.evaluatedBy,
        params.source,
      ],
    );
    return (await this.latestEvaluation(
      params.campaignId,
      params.participantId,
    ))!;
  }

  // ── Nickname công khai ────────────────────────────────────────────────

  public async setContributionPublicName(params: {
    campaignId: string;
    contributionId: string;
    userId: string;
    show: boolean | null;
  }): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_contributions contribution
       SET show_name_publicly = COALESCE($4::boolean,
             (SELECT show_in_public_supporter_lists FROM users WHERE global_id = $3))
       WHERE contribution.campaign_id = $1 AND contribution.global_id = $2
         AND contribution.contributor_id = $3
       RETURNING contribution.global_id`,
      [params.campaignId, params.contributionId, params.userId, params.show],
    );
    return rows.length > 0;
  }

  public async setParticipationPublicName(params: {
    campaignId: string;
    userId: string;
    show: boolean | null;
  }): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_participations participation
       SET show_name_publicly = COALESCE($3::boolean,
             (SELECT show_in_public_supporter_lists FROM users WHERE global_id = $2))
       WHERE participation.campaign_id = $1 AND participation.user_id = $2
         AND participation.status = 'REGISTERED'
       RETURNING participation.global_id`,
      [params.campaignId, params.userId, params.show],
    );
    return rows.length > 0;
  }

  public async publicSupporters(
    campaignId: string,
    limit: number,
  ): Promise<ICharityPublicSupporters> {
    // Người ủng hộ = có đóng góp được chấp nhận. Hiện tên khi BẤT KỲ đóng góp nào của họ
    // trong dự án cho phép — họ đã chủ động bật ở ít nhất một lần.
    const [counts] = await this.manager.query<
      { supporters: string; participants: string }[]
    >(
      `SELECT
         (SELECT count(DISTINCT contributor_id) FROM campaign_contributions
           WHERE campaign_id = $1 AND status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')) AS supporters,
         (SELECT count(*) FROM campaign_participations
           WHERE campaign_id = $1 AND status = 'REGISTERED') AS participants`,
      [campaignId],
    );
    const supporters = await this.manager.query<{ username: string }[]>(
      `SELECT account.username
       FROM users account
       WHERE account.deleted_at IS NULL AND account.username IS NOT NULL
         AND EXISTS (SELECT 1 FROM campaign_contributions contribution
                     WHERE contribution.campaign_id = $1
                       AND contribution.contributor_id = account.global_id
                       AND contribution.status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
                       AND contribution.show_name_publicly)
       ORDER BY account.username
       LIMIT $2`,
      [campaignId, limit],
    );
    const participants = await this.manager.query<{ username: string }[]>(
      `SELECT account.username
       FROM campaign_participations participation
       JOIN users account ON account.global_id = participation.user_id
       WHERE participation.campaign_id = $1 AND participation.status = 'REGISTERED'
         AND participation.show_name_publicly AND account.deleted_at IS NULL
         AND account.username IS NOT NULL
       ORDER BY account.username
       LIMIT $2`,
      [campaignId, limit],
    );
    return {
      supporterCount: Number(counts?.supporters ?? 0),
      participantCount: Number(counts?.participants ?? 0),
      supporters: supporters.map((row) => row.username),
      participants: participants.map((row) => row.username),
    };
  }

  // ── Card Home ─────────────────────────────────────────────────────────

  public async getPromotion(
    campaignId: string,
  ): Promise<ICharityPromotion | null> {
    const [row] = await this.manager.query<IPromotionRow[]>(
      `SELECT ${PromotionColumns} FROM campaigns WHERE global_id = $1 AND deleted_at IS NULL`,
      [campaignId],
    );
    return row ? toPromotion(row) : null;
  }

  public async requestPromotion(params: {
    campaignId: string;
    note: string | null;
  }): Promise<void> {
    await this.manager.query(
      `UPDATE campaigns SET promotion_requested_at = now(), promotion_request_note = $2
       WHERE global_id = $1`,
      [params.campaignId, params.note],
    );
  }

  public async setPromotion(params: {
    campaignId: string;
    actorId: string;
    reason: string;
    promotion: Omit<
      ICharityPromotion,
      'promotionRequestedAt' | 'promotionRequestNote'
    >;
  }): Promise<ICharityPromotion | null> {
    return this.manager.transaction(async (manager) => {
      const [before] = await manager.query<IPromotionRow[]>(
        `SELECT ${PromotionColumns} FROM campaigns
         WHERE global_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.campaignId],
      );
      if (!before) return null;
      const promotion = params.promotion;
      // Bật thì đề xuất coi như đã xử lý; tắt thì giữ đề xuất để ban tổ chức còn thấy.
      const [row] = await updateReturning<IPromotionRow>(
        manager,
        `UPDATE campaigns
         SET featured_on_home = $2, featured_title = $3, featured_message = $4,
             featured_media_url = $5, featured_cta = $6, featured_from = $7,
             featured_until = $8, featured_priority = $9,
             promotion_requested_at = CASE WHEN $10::boolean THEN NULL ELSE promotion_requested_at END,
             promotion_request_note = CASE WHEN $10::boolean THEN NULL ELSE promotion_request_note END
         WHERE global_id = $1
         RETURNING ${PromotionColumns}`,
        [
          params.campaignId,
          promotion.featuredOnHome,
          promotion.featuredTitle,
          promotion.featuredMessage,
          promotion.featuredMediaUrl,
          promotion.featuredCta,
          promotion.featuredFrom,
          promotion.featuredUntil,
          promotion.featuredPriority,
          promotion.featuredOnHome,
        ],
      );
      await manager.query(
        `INSERT INTO admin_audit_logs
           (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, 'CHARITY_CAMPAIGN_PROMOTION', 'CHARITY_CAMPAIGN', $2, $3::jsonb, $4::jsonb, $5)`,
        [
          params.actorId,
          params.campaignId,
          JSON.stringify(toPromotion(before)),
          JSON.stringify(toPromotion(row)),
          params.reason,
        ],
      );
      return toPromotion(row);
    });
  }

  public async listHomeCards(limit: number): Promise<ICharityHomeCard[]> {
    const rows = await this.manager.query<
      {
        global_id: string;
        slug: string;
        featured_title: string;
        featured_message: string | null;
        media_url: string | null;
        featured_cta: CharityFeaturedCta;
        featured_priority: number;
      }[]
    >(
      `SELECT global_id, slug, featured_title, featured_message,
              COALESCE(featured_media_url, banner_url) AS media_url, featured_cta,
              featured_priority
       FROM campaigns
       WHERE featured_on_home
         AND approval_status = 'APPROVED' AND is_active AND deleted_at IS NULL
         AND (featured_from IS NULL OR featured_from <= now())
         AND (featured_until IS NULL OR featured_until > now())
       ORDER BY featured_priority DESC, id DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      campaignId: row.global_id,
      slug: row.slug,
      title: row.featured_title,
      message: row.featured_message,
      mediaUrl: row.media_url,
      cta: row.featured_cta,
      priority: row.featured_priority,
    }));
  }
}
