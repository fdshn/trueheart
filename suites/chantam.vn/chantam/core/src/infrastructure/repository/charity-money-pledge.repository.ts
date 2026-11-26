import {
  CharityMoneyPledgeLockedOutcome,
  ICharityMoneyPledge,
  ICharityMoneyPledgeCursor,
  ICharityMoneyPledgePage,
  ICharityMoneyPledgeRepository,
  ICharityMoneyPledgeRow,
  ICharityMoneyPledgeTotals,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { CharityMoneyPledgeStatus } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { isUniqueViolationOn } from './unique-violation';
import { updateReturning } from './update-returning';

interface IPledgeRow {
  id: string;
  global_id: string;
  campaign_id: string;
  funding_need_id: string | null;
  user_id: string;
  pledged_amount: string;
  status: CharityMoneyPledgeStatus;
  show_name_publicly: boolean;
  note: string | null;
  bank_account_id: string | null;
  transfer_content: string;
  declared_at: Date;
  completed_at: Date | null;
  hidden_at: Date | null;
  hidden_by: string | null;
  hidden_reason: string | null;
}

interface IPledgeJoinedRow extends IPledgeRow {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  rank: UserRanks | null;
  account_global_id: string | null;
  bank_name: string | null;
  bank_bin: string | null;
  account_no: string | null;
  account_name: string | null;
  account_valid_to: Date | null;
  campaign_title: string;
  campaign_slug: string;
}

const PledgeColumns = `pledge.id, pledge.global_id, pledge.campaign_id, pledge.funding_need_id,
  pledge.user_id, pledge.pledged_amount, pledge.status, pledge.show_name_publicly, pledge.note,
  pledge.bank_account_id, pledge.transfer_content, pledge.declared_at, pledge.completed_at,
  pledge.hidden_at, pledge.hidden_by, pledge.hidden_reason`;

// Người dùng đã xoá (deleted_at) coi như không còn hồ sơ: dòng vẫn tính tiền, chỉ mất tên.
const JoinedSelect = `SELECT ${PledgeColumns},
    account.username, account.full_name, account.avatar_url, account.rank,
    bank.global_id AS account_global_id, bank.bank_name, bank.bank_bin, bank.account_no,
    bank.account_name, bank.valid_to AS account_valid_to,
    campaign.title AS campaign_title, campaign.slug AS campaign_slug
  FROM campaign_money_pledges pledge
  JOIN campaigns campaign ON campaign.global_id = pledge.campaign_id
  LEFT JOIN users account
    ON account.global_id = pledge.user_id AND account.deleted_at IS NULL
  LEFT JOIN campaign_bank_accounts bank ON bank.global_id = pledge.bank_account_id`;

/** Lời khai chỉ còn đổi được khi dự án CHƯA công bố tổng kết (mốc kết thúc dự án). */
const NotEnded = `NOT EXISTS (
    SELECT 1 FROM campaign_summaries summary
     WHERE summary.campaign_id = pledge.campaign_id AND summary.published_at IS NOT NULL)`;

/** Khoá sắp xếp của danh sách: cắt về mili giây vì con trỏ đi qua `Date` của JS. */
const SortKey = `date_trunc('milliseconds', pledge.declared_at)`;

const toPledge = (row: IPledgeRow): ICharityMoneyPledge => ({
  pledgeId: row.global_id,
  campaignId: row.campaign_id,
  fundingNeedId: row.funding_need_id,
  userId: row.user_id,
  pledgedAmount: Number(row.pledged_amount),
  status: row.status,
  showNamePublicly: row.show_name_publicly,
  note: row.note,
  bankAccountId: row.bank_account_id,
  transferContent: row.transfer_content,
  declaredAt: row.declared_at,
  completedAt: row.completed_at,
  hiddenAt: row.hidden_at,
  hiddenBy: row.hidden_by,
  hiddenReason: row.hidden_reason,
});

const toRow = (
  row: IPledgeJoinedRow,
): ICharityMoneyPledgeRow & { cursorId: number } => ({
  ...toPledge(row),
  cursorId: Number(row.id),
  user:
    row.username === null
      ? null
      : {
          globalId: row.user_id,
          username: row.username,
          fullName: row.full_name,
          avatarUrl: row.avatar_url,
          rank: row.rank as UserRanks,
        },
  account:
    row.account_global_id === null
      ? null
      : {
          accountId: row.account_global_id,
          bankName: row.bank_name as string,
          bankBin: row.bank_bin,
          accountNo: row.account_no as string,
          accountName: row.account_name as string,
          validTo: row.account_valid_to,
        },
  campaign: {
    globalId: row.campaign_id,
    title: row.campaign_title,
    slug: row.campaign_slug,
  },
});

/** Đăng ký ủng hộ tiền cho chiến dịch từ thiện (CR 25/11/2026). */
@Injectable()
export class CharityMoneyPledgeRepository implements ICharityMoneyPledgeRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async create(input: {
    campaignId: string;
    fundingNeedId: string | null;
    userId: string;
    pledgedAmount: number;
    showNamePublicly: boolean | null;
    note: string | null;
    bankAccountId: string;
    transferContent: string;
  }): Promise<ICharityMoneyPledge | null> {
    try {
      const rows = await this.manager.query<IPledgeRow[]>(
        `INSERT INTO campaign_money_pledges AS pledge
           (campaign_id, funding_need_id, user_id, pledged_amount, show_name_publicly, note,
            bank_account_id, transfer_content)
         VALUES ($1, $2, $3, $4,
                 COALESCE($5::boolean,
                          (SELECT show_in_public_supporter_lists FROM users
                            WHERE global_id = $3),
                          false),
                 $6, $7, $8)
         RETURNING ${PledgeColumns}`,
        [
          input.campaignId,
          input.fundingNeedId,
          input.userId,
          input.pledgedAmount,
          input.showNamePublicly,
          input.note,
          input.bankAccountId,
          input.transferContent,
        ],
      );
      return toPledge(rows[0]);
    } catch (error) {
      if (
        isUniqueViolationOn(error, 'UQ_campaign_money_pledges_transfer_content')
      )
        return null;
      throw error;
    }
  }

  public async findById(pledgeId: string): Promise<ICharityMoneyPledge | null> {
    const rows = await this.manager.query<IPledgeRow[]>(
      `SELECT ${PledgeColumns} FROM campaign_money_pledges pledge
        WHERE pledge.global_id = $1`,
      [pledgeId],
    );
    return rows[0] ? toPledge(rows[0]) : null;
  }

  public async findRow(
    pledgeId: string,
  ): Promise<ICharityMoneyPledgeRow | null> {
    const rows = await this.manager.query<IPledgeJoinedRow[]>(
      `${JoinedSelect} WHERE pledge.global_id = $1`,
      [pledgeId],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  public async markCompleted(params: {
    pledgeId: string;
    userId: string;
  }): Promise<CharityMoneyPledgeLockedOutcome> {
    const rows = await updateReturning<IPledgeRow>(
      this.manager,
      `UPDATE campaign_money_pledges pledge
          SET status = 'COMPLETED', completed_at = now()
        WHERE pledge.global_id = $1 AND pledge.user_id = $2
          AND pledge.status = 'INTENDED' AND ${NotEnded}
        RETURNING ${PledgeColumns}`,
      [params.pledgeId, params.userId],
    );
    if (rows[0]) return { status: 'UPDATED', pledge: toPledge(rows[0]) };
    return this.explainMiss(
      params.pledgeId,
      (pledge) => pledge.userId === params.userId,
    );
  }

  public async setHidden(params: {
    pledgeId: string;
    hidden: boolean;
    actorId: string;
    reason: string | null;
  }): Promise<CharityMoneyPledgeLockedOutcome> {
    const rows = params.hidden
      ? await updateReturning<IPledgeRow>(
          this.manager,
          `UPDATE campaign_money_pledges pledge
              SET hidden_at = now(), hidden_by = $2, hidden_reason = $3
            WHERE pledge.global_id = $1 AND pledge.hidden_at IS NULL AND ${NotEnded}
            RETURNING ${PledgeColumns}`,
          [params.pledgeId, params.actorId, params.reason],
        )
      : await updateReturning<IPledgeRow>(
          this.manager,
          `UPDATE campaign_money_pledges pledge
              SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL
            WHERE pledge.global_id = $1 AND pledge.hidden_at IS NOT NULL
              AND ${NotEnded}
            RETURNING ${PledgeColumns}`,
          [params.pledgeId],
        );
    if (rows[0]) return { status: 'UPDATED', pledge: toPledge(rows[0]) };
    return this.explainMiss(params.pledgeId, () => true);
  }

  /**
   * `UPDATE` không chạm dòng nào: vì không có (hoặc không phải của người gọi), vì dự án đã kết
   * thúc, hay vì trạng thái không hợp.
   */
  private async explainMiss(
    pledgeId: string,
    visible: (pledge: ICharityMoneyPledge) => boolean,
  ): Promise<CharityMoneyPledgeLockedOutcome> {
    const rows = await this.manager.query<(IPledgeRow & { ended: boolean })[]>(
      `SELECT ${PledgeColumns}, NOT ${NotEnded} AS ended
         FROM campaign_money_pledges pledge WHERE pledge.global_id = $1`,
      [pledgeId],
    );
    const row = rows[0];
    if (!row) return { status: 'NOT_FOUND' };
    const pledge = toPledge(row);
    if (!visible(pledge)) return { status: 'NOT_FOUND' };
    if (row.ended) return { status: 'LOCKED' };
    return { status: 'CONFLICT', pledge };
  }

  public async listForCampaign(params: {
    campaignId: string;
    fundingNeedId: string | null;
    status: CharityMoneyPledgeStatus | null;
    includeHidden: boolean;
    cursor: ICharityMoneyPledgeCursor | null;
    limit: number;
  }): Promise<ICharityMoneyPledgePage> {
    const rows = await this.manager.query<IPledgeJoinedRow[]>(
      `${JoinedSelect}
        WHERE pledge.campaign_id = $1
          AND ($2::uuid IS NULL OR pledge.funding_need_id = $2::uuid)
          AND ($3::text IS NULL OR pledge.status = $3::text)
          AND ($4::boolean OR pledge.hidden_at IS NULL)
          AND ($5::timestamptz IS NULL OR (${SortKey}, pledge.id) < ($5::timestamptz, $6::bigint))
        ORDER BY ${SortKey} DESC, pledge.id DESC
        LIMIT $7`,
      [
        params.campaignId,
        params.fundingNeedId,
        params.status,
        params.includeHidden,
        params.cursor?.declaredAt ?? null,
        params.cursor?.id ?? null,
        params.limit,
      ],
    );
    return { rows: rows.map(toRow) };
  }

  public async listMine(params: {
    userId: string;
    campaignId: string | null;
    cursor: ICharityMoneyPledgeCursor | null;
    limit: number;
  }): Promise<ICharityMoneyPledgePage> {
    const rows = await this.manager.query<IPledgeJoinedRow[]>(
      `${JoinedSelect}
        WHERE pledge.user_id = $1
          AND ($2::uuid IS NULL OR pledge.campaign_id = $2::uuid)
          AND campaign.deleted_at IS NULL
          AND ($3::timestamptz IS NULL OR (${SortKey}, pledge.id) < ($3::timestamptz, $4::bigint))
        ORDER BY ${SortKey} DESC, pledge.id DESC
        LIMIT $5`,
      [
        params.userId,
        params.campaignId,
        params.cursor?.declaredAt ?? null,
        params.cursor?.id ?? null,
        params.limit,
      ],
    );
    return { rows: rows.map(toRow) };
  }

  public async totals(campaignId: string): Promise<ICharityMoneyPledgeTotals> {
    const rows = await this.manager.query<
      { funding_need_id: string | null; amount: string; count: string }[]
    >(
      `SELECT pledge.funding_need_id, SUM(pledge.pledged_amount)::text AS amount,
              count(*)::text AS count
         FROM campaign_money_pledges pledge
        WHERE pledge.campaign_id = $1 AND pledge.status = 'COMPLETED'
          AND pledge.hidden_at IS NULL
        GROUP BY pledge.funding_need_id`,
      [campaignId],
    );
    return {
      pledgedAmount: rows.reduce((sum, row) => sum + Number(row.amount), 0),
      pledgeCount: rows.reduce((sum, row) => sum + Number(row.count), 0),
      byFundingNeed: rows
        .filter((row) => row.funding_need_id !== null)
        .map((row) => ({
          fundingNeedId: row.funding_need_id as string,
          pledgedAmount: Number(row.amount),
          pledgeCount: Number(row.count),
        })),
    };
  }

  public async listAwardable(
    campaignId: string,
  ): Promise<ICharityMoneyPledge[]> {
    const rows = await this.manager.query<IPledgeRow[]>(
      `SELECT ${PledgeColumns} FROM campaign_money_pledges pledge
        WHERE pledge.campaign_id = $1 AND pledge.status = 'COMPLETED'
          AND pledge.hidden_at IS NULL
        ORDER BY pledge.id`,
      [campaignId],
    );
    return rows.map(toPledge);
  }

  public async listCampaignsWithUnawardedPledges(
    days: number,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.manager.query<{ campaign_id: string }[]>(
      `SELECT DISTINCT pledge.campaign_id
         FROM campaign_money_pledges pledge
         JOIN campaign_summaries summary
           ON summary.campaign_id = pledge.campaign_id
          AND summary.published_at IS NOT NULL
        WHERE summary.published_at > now() - make_interval(days => $1::int)
          AND pledge.status = 'COMPLETED' AND pledge.hidden_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM campaign_point_awards award
             WHERE award.rule_code = 'CHARITY_MONEY_PLEDGE'
               AND award.reference_type = 'CHARITY_MONEY_PLEDGE'
               AND award.reference_id = pledge.global_id::text)
        LIMIT $2`,
      [days, limit],
    );
    return rows.map((row) => row.campaign_id);
  }
}
