import {
  CheckInPolicyUnavailableException,
  CheckInRepairCreditInsufficientException,
  CheckInRepairDateInvalidException,
  CheckInRepairUnavailableException,
} from '@/domain/exceptions';
import {
  ICheckInEntryRow,
  ICheckInPolicyRevision,
  ICheckInRepository,
  ICheckInState,
  IPointLedgerRepository,
  IPublishCheckInPolicyParams,
  IRecordCheckInParams,
  IRecordCheckInResult,
  IRecordedMilestone,
} from '@/domain/ports/repository';
import {
  BusinessDate,
  CheckInDailyRuleCode,
  CheckInKind,
  CheckInRunStatus,
  CheckInStreakMilestoneRuleCode,
  addBusinessDays,
  businessDaysBetween,
  checkInPolicyGaps,
  isRepairableDate,
  milestonesNewlyReached,
  normalizeCheckInPolicy,
  summarizeCheckInRun,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IPolicyRow {
  version: number;
  enabled: boolean;
  daily_points: number;
  milestones_json: unknown;
  transactions_per_repair: number;
  repair_window_days: number;
  effective_at: Date;
  reason: string;
  created_by: string | null;
  created_at: Date;
}

interface IRunRow {
  id: string;
  start_date: string;
  latest_covered_date: string;
  status: CheckInRunStatus;
}

/**
 * Đọc một ngày nghiệp vụ từ driver.
 *
 * **Mọi truy vấn ở file này phải ép `::text` cho cột `date`**, và hàm này chỉ là
 * lưới hứng. Lý do: node-pg dựng `Date` cho cột `date` theo giờ ĐỊA PHƯƠNG của
 * tiến trình, nên `new Date('2026-10-01')` ở máy UTC+7 là `2026-09-30T17:00:00Z`,
 * và `toISOString().slice(0, 10)` ra **2026-09-30** — lùi đúng một ngày.
 *
 * Bug đó đã xảy ra thật ở lượt chạy đầu của `test/check-in-streak.check.ts`: chuỗi
 * ba ngày liên tiếp bị đọc thành một ngày với hai lỗ hổng. Và nó là loại bug tệ
 * nhất ở đây — chỉ hiện trên máy KHÔNG chạy UTC, tức đúng máy ở Việt Nam.
 *
 * Nên khi value là `Date`, lấy các thành phần ngày THEO GIỜ ĐỊA PHƯƠNG, đúng cách
 * driver đã dựng nó.
 */
function toBusinessDate(value: unknown): BusinessDate {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toRevision(row: IPolicyRow): ICheckInPolicyRevision {
  return {
    version: Number(row.version),
    policy: normalizeCheckInPolicy({
      enabled: row.enabled,
      dailyPoints: Number(row.daily_points),
      milestones: row.milestones_json,
      transactionsPerRepair: Number(row.transactions_per_repair),
      repairWindowDays: Number(row.repair_window_days),
    }),
    effectiveAt: row.effective_at,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const PolicyColumns = `version, enabled, daily_points, milestones_json,
       transactions_per_repair, repair_window_days, effective_at, reason,
       created_by, created_at`;

@Injectable()
export class CheckInRepository implements ICheckInRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async getActivePolicy(): Promise<ICheckInPolicyRevision | null> {
    // Bản đang chạy = **version lớn nhất** trong số đã tới hiệu lực. Không cột trạng
    // thái nào phải giữ đồng bộ, nên không có cột nào nói sai được.
    //
    // `ORDER BY version DESC`, KHÔNG `effective_at DESC`. Bản đầu sắp theo
    // `effective_at` và nó sai theo một chiều khó thấy: một bản publish SAU với mốc
    // hiệu lực sớm hơn sẽ bị một bản publish TRƯỚC với mốc muộn hơn đè lên. Cụ thể
    // hơn, ca mà `test/check-in-streak.check.ts` bắt được: migration seed bản nháp
    // v1 với `effective_at = now()`, rồi Admin publish v2 hiệu lực lùi một phút —
    // sắp theo `effective_at` thì bản NHÁP ĐANG TẮT thắng, và tính năng không bật
    // được bằng bất kỳ lượt publish nào.
    //
    // Version là thứ tự publish, tức thứ tự Ý ĐỊNH. Một bản hẹn giờ cho tương lai chỉ
    // là "chưa tới lượt"; khi tới lượt nó vẫn không được vượt một bản publish sau nó.
    const [row] = await this.manager.query<IPolicyRow[]>(
      `SELECT ${PolicyColumns} FROM check_in_policy_revisions
       WHERE effective_at <= now()
       ORDER BY version DESC
       LIMIT 1`,
    );
    return row ? toRevision(row) : null;
  }

  public async listPolicyHistory(
    limit: number,
  ): Promise<ICheckInPolicyRevision[]> {
    const rows = await this.manager.query<IPolicyRow[]>(
      `SELECT ${PolicyColumns} FROM check_in_policy_revisions
       ORDER BY version DESC LIMIT $1`,
      [limit],
    );
    return (rows ?? []).map(toRevision);
  }

  public async publishPolicy(
    params: IPublishCheckInPolicyParams,
  ): Promise<ICheckInPolicyRevision> {
    return this.manager.transaction(async (manager) => {
      // Khoá bảng theo tên chứ không theo hàng: bản mới CHƯA tồn tại, nên không
      // có hàng nào để khoá, và hai Admin publish cùng lúc sẽ cùng đọc version
      // lớn nhất rồi cùng ghi version+1 — một người ăn lỗi khoá chính, nhưng
      // người kia đã ghi đè quyết định của người đầu.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('check_in_policy_revisions'))",
      );

      const [latest] = await manager.query<{ version: number }[]>(
        `SELECT version FROM check_in_policy_revisions
         ORDER BY version DESC LIMIT 1`,
      );
      const currentVersion = latest ? Number(latest.version) : null;

      if ((params.expectedVersion ?? null) !== currentVersion)
        throw new ValidationFailedException([
          `expectedVersion: bản hiện tại là ${currentVersion ?? 'chưa có'}, không phải ${params.expectedVersion ?? 'chưa có'}`,
        ]);

      const gaps = checkInPolicyGaps(params.policy);
      if (gaps.length > 0) throw new ValidationFailedException(gaps);

      const nextVersion = (currentVersion ?? 0) + 1;
      await manager.query(
        `INSERT INTO check_in_policy_revisions
           (version, enabled, daily_points, milestones_json,
            transactions_per_repair, repair_window_days, effective_at, reason, created_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
        [
          nextVersion,
          params.policy.enabled,
          params.policy.dailyPoints,
          JSON.stringify(params.policy.milestones),
          params.policy.transactionsPerRepair,
          params.policy.repairWindowDays,
          params.effectiveAt,
          params.reason,
          params.actorUserId,
        ],
      );

      const [row] = await manager.query<IPolicyRow[]>(
        `SELECT ${PolicyColumns} FROM check_in_policy_revisions WHERE version = $1`,
        [nextVersion],
      );
      return toRevision(row);
    });
  }

  public async readState(
    userId: string,
    today: BusinessDate,
  ): Promise<ICheckInState> {
    const [run] = await this.manager.query<IRunRow[]>(
      `SELECT id, start_date::text AS start_date,
              latest_covered_date::text AS latest_covered_date, status
       FROM check_in_runs WHERE user_id = $1 AND status <> 'ENDED'
       LIMIT 1`,
      [userId],
    );

    const [credits] = await this.manager.query<{ balance: number }[]>(
      `SELECT COALESCE(
                (SELECT balance_after FROM repair_credit_ledger
                 WHERE user_id = $1 ORDER BY id DESC LIMIT 1), 0) AS balance`,
      [userId],
    );

    const [cohort] = await this.manager.query<
      {
        current_count: number;
        required_transactions: number;
        policy_version: number;
      }[]
    >(
      `SELECT current_count, required_transactions, policy_version
       FROM repair_credit_cohorts WHERE user_id = $1 AND status = 'OPEN' LIMIT 1`,
      [userId],
    );

    // Chuỗi DÀI NHẤT đọc từ entries, không từ một cột đếm sẵn: một cột như vậy
    // phải đúng sau mọi lần bù, và chỗ nào quên cập nhật là con số đứng im mãi.
    const [longest] = await this.manager.query<{ longest: number }[]>(
      `SELECT COALESCE(MAX(current_length), 0) AS longest
       FROM check_in_runs WHERE user_id = $1`,
      [userId],
    );

    const [todayEntry] = await this.manager.query<
      {
        policy_date: unknown;
        kind: CheckInKind;
        streak_day: number;
        daily_points_awarded: number;
        created_at: Date;
      }[]
    >(
      `SELECT policy_date::text AS policy_date, kind, streak_day,
              daily_points_awarded, created_at
       FROM check_in_entries WHERE user_id = $1 AND policy_date = $2::date`,
      [userId, today],
    );

    return {
      run: run ? await this.loadRun(this.manager, run) : null,
      todayEntry: todayEntry
        ? {
            policyDate: toBusinessDate(todayEntry.policy_date),
            kind: todayEntry.kind,
            streakDay: Number(todayEntry.streak_day),
            dailyPointsAwarded: Number(todayEntry.daily_points_awarded),
            milestoneDaysAwarded: null,
            createdAt: todayEntry.created_at,
          }
        : null,
      longestStreak: Number(longest?.longest ?? 0),
      repairCredits: Number(credits?.balance ?? 0),
      cohort: cohort
        ? {
            currentCount: Number(cohort.current_count),
            requiredTransactions: Number(cohort.required_transactions),
            policyVersion: Number(cohort.policy_version),
          }
        : null,
    };
  }

  /** Nạp ngày đã có dấu và mốc đã thưởng của một chuỗi. */
  private async loadRun(manager: EntityManager, run: IRunRow) {
    const covered = await manager.query<{ policy_date: unknown }[]>(
      `SELECT policy_date::text AS policy_date FROM check_in_entries
       WHERE run_id = $1 ORDER BY policy_date ASC`,
      [run.id],
    );
    const awarded = await manager.query<{ milestone_days: number }[]>(
      `SELECT milestone_days FROM check_in_milestone_awards WHERE run_id = $1`,
      [run.id],
    );

    return {
      id: String(run.id),
      startDate: toBusinessDate(run.start_date),
      latestCoveredDate: toBusinessDate(run.latest_covered_date),
      status: run.status,
      coveredDates: (covered ?? []).map((row) =>
        toBusinessDate(row.policy_date),
      ),
      awardedMilestoneDays: (awarded ?? []).map((row) =>
        Number(row.milestone_days),
      ),
    };
  }

  public async listHistory(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ items: ICheckInEntryRow[]; total: number }> {
    const rows = await this.manager.query<
      {
        policy_date: unknown;
        kind: CheckInKind;
        streak_day: number;
        daily_points_awarded: number;
        milestone_days: number | null;
        created_at: Date;
        total: string;
      }[]
    >(
      // LEFT JOIN qua `entry_id`: mốc gắn với đúng dấu điểm danh đã đưa chuỗi tới
      // đó, nên sau một lần bù con số vẫn trỏ đúng ngày.
      `SELECT entry.policy_date::text AS policy_date, entry.kind, entry.streak_day,
              entry.daily_points_awarded, award.milestone_days,
              entry.created_at, COUNT(*) OVER () AS total
       FROM check_in_entries entry
       LEFT JOIN check_in_milestone_awards award ON award.entry_id = entry.id
       WHERE entry.user_id = $1
       ORDER BY entry.policy_date DESC
       LIMIT $2 OFFSET $3`,
      [params.userId, params.take, params.skip],
    );

    return {
      items: (rows ?? []).map((row) => ({
        policyDate: toBusinessDate(row.policy_date),
        kind: row.kind,
        streakDay: Number(row.streak_day),
        dailyPointsAwarded: Number(row.daily_points_awarded),
        milestoneDaysAwarded:
          row.milestone_days === null ? null : Number(row.milestone_days),
        createdAt: row.created_at,
      })),
      total: Number(rows?.[0]?.total ?? 0),
    };
  }

  /** Số ngày liên tiếp kết thúc ĐÚNG tại `date`, tính trên tập ngày đã có dấu. */
  private contiguousEndingAt(
    covered: ReadonlySet<BusinessDate>,
    date: BusinessDate,
  ): number {
    let length = 0;
    let cursor = date;
    while (covered.has(cursor)) {
      length += 1;
      cursor = addBusinessDays(cursor, -1);
    }
    return length;
  }

  private async usablePolicy(
    manager: EntityManager,
  ): Promise<ICheckInPolicyRevision> {
    const [row] = await manager.query<IPolicyRow[]>(
      `SELECT ${PolicyColumns} FROM check_in_policy_revisions
       WHERE effective_at <= now()
       ORDER BY version DESC
       LIMIT 1`,
    );

    // Chưa publish, đang tắt, hoặc thiếu số — ba trạng thái khác nhau nhưng cùng
    // một hệ quả với người gọi: không ghi được gì. Và tuyệt đối KHÔNG lùi về một
    // mặc định có tác dụng phát điểm.
    if (!row) throw new CheckInPolicyUnavailableException();
    const revision = toRevision(row);
    if (!revision.policy.enabled) throw new CheckInPolicyUnavailableException();
    if (checkInPolicyGaps(revision.policy).length > 0)
      throw new CheckInPolicyUnavailableException();

    return revision;
  }

  public async record(
    params: IRecordCheckInParams,
  ): Promise<IRecordCheckInResult> {
    return this.manager.transaction(async (manager) => {
      // Khoá theo user cho CẢ lượt: hai request điểm danh đồng thời phải xếp hàng,
      // không thì cả hai đọc cùng một chuỗi rồi cùng ghi.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        params.userId,
      ]);

      const revision = await this.usablePolicy(manager);
      const policy = revision.policy;

      const [existing] = await manager.query<
        {
          kind: CheckInKind;
          streak_day: number;
          daily_points_awarded: number;
        }[]
      >(
        `SELECT kind, streak_day, daily_points_awarded FROM check_in_entries
         WHERE user_id = $1 AND policy_date = $2::date`,
        [params.userId, params.date],
      );

      const [runRow] = await manager.query<IRunRow[]>(
        `SELECT id, start_date::text AS start_date,
                latest_covered_date::text AS latest_covered_date, status
         FROM check_in_runs WHERE user_id = $1 AND status <> 'ENDED'
         FOR UPDATE`,
        [params.userId],
      );

      if (existing) {
        // Điểm danh lại trong cùng ngày KHÔNG phải lỗi của người dùng — một lần
        // bấm đôi thôi. Trả đúng số cũ và không cộng gì thêm.
        if (params.kind === 'NORMAL')
          return this.replay(manager, {
            params,
            revision,
            runRow,
            existing,
          });
        // Nhưng chọn BÙ một ngày đã có dấu thì là chọn sai, và phải nói ra.
        throw new CheckInRepairUnavailableException();
      }

      const run = runRow ? await this.loadRun(manager, runRow) : null;

      if (params.kind === 'REPAIR') {
        if (
          !isRepairableDate({
            date: params.date,
            today: params.today,
            repairWindowDays: policy.repairWindowDays,
          })
        )
          throw new CheckInRepairDateInvalidException(policy.repairWindowDays);

        // Chỉ bù được một LỖ HỔNG của chuỗi đang mở. Một ngày nằm ngoài khoảng
        // của chuỗi thì bù vào cũng không nối lại gì — và đó đúng là điều người
        // dùng cần biết, chứ không phải một lượt bù bị tiêu vô ích.
        const summary = run
          ? summarizeCheckInRun({
              startDate: run.startDate,
              latestCoveredDate: run.latestCoveredDate,
              coveredDates: run.coveredDates,
            })
          : null;
        if (!run || !summary?.pendingGapDates.includes(params.date))
          throw new CheckInRepairUnavailableException();
      }

      return this.write(manager, { params, revision, run });
    });
  }

  /** Lượt gọi lặp: trả đúng số hiện có, không ghi gì. */
  private async replay(
    manager: EntityManager,
    input: {
      params: IRecordCheckInParams;
      revision: ICheckInPolicyRevision;
      runRow: IRunRow | undefined;
      existing: {
        kind: CheckInKind;
        streak_day: number;
        daily_points_awarded: number;
      };
    },
  ): Promise<IRecordCheckInResult> {
    const run = input.runRow ? await this.loadRun(manager, input.runRow) : null;
    const summary = run
      ? summarizeCheckInRun({
          startDate: run.startDate,
          latestCoveredDate: run.latestCoveredDate,
          coveredDates: run.coveredDates,
        })
      : { currentStreak: 0, recoverableStreak: 0, pendingGapDates: [] };

    return {
      applied: false,
      kind: input.existing.kind,
      date: input.params.date,
      streakDay: Number(input.existing.streak_day),
      currentStreak: summary.currentStreak,
      recoverableStreak: summary.recoverableStreak,
      pendingGapDates: summary.pendingGapDates,
      runStatus: run?.status ?? 'ACTIVE',
      // 0 chứ không phải số của lần đầu: lượt gọi NÀY không phát điểm, và trả lại
      // con số cũ sẽ làm client cộng dồn hai lần vào màn hình "vừa nhận".
      dailyPointsAwarded: 0,
      milestonePointsAwarded: 0,
      milestones: [],
      repairCreditsRemaining: await this.creditBalance(
        manager,
        input.params.userId,
      ),
      policyVersion: input.revision.version,
    };
  }

  private async creditBalance(
    manager: EntityManager,
    userId: string,
  ): Promise<number> {
    const [row] = await manager.query<{ balance: number }[]>(
      `SELECT COALESCE(
                (SELECT balance_after FROM repair_credit_ledger
                 WHERE user_id = $1 ORDER BY id DESC LIMIT 1), 0) AS balance`,
      [userId],
    );
    return Number(row?.balance ?? 0);
  }

  /** Ghi thật: dựng/mở rộng chuỗi, chèn dấu, trừ lượt bù, cộng điểm, phát mốc. */
  private async write(
    manager: EntityManager,
    input: {
      params: IRecordCheckInParams;
      revision: ICheckInPolicyRevision;
      run: Awaited<ReturnType<CheckInRepository['loadRun']>> | null;
    },
  ): Promise<IRecordCheckInResult> {
    const { params, revision } = input;
    const policy = revision.policy;
    let run = input.run;

    // Trừ lượt bù TRƯỚC khi ghi dấu: hết lượt thì không được để lại một ngày đã
    // đánh dấu mà chưa trả giá.
    let creditsRemaining = await this.creditBalance(manager, params.userId);
    if (params.kind === 'REPAIR') {
      if (creditsRemaining < 1)
        throw new CheckInRepairCreditInsufficientException(
          policy.transactionsPerRepair,
        );
      creditsRemaining -= 1;
      await manager.query(
        `INSERT INTO repair_credit_ledger
           (user_id, event_type, delta, balance_after, reference_type,
            reference_id, idempotency_key, policy_version, note)
         VALUES ($1, 'SPEND', -1, $2, 'CHECK_IN_REPAIR', $3, $4, $5, $6)`,
        [
          params.userId,
          creditsRemaining,
          params.date,
          `CHECK_IN_REPAIR:${params.userId}:${params.date}`,
          revision.version,
          `Bù điểm danh ngày ${params.date}`,
        ],
      );
    }

    let runId: string;
    let newLatest: BusinessDate;

    if (params.kind === 'REPAIR') {
      // Bù không đẩy ngày cuối: nó lấp một lỗ ở giữa.
      runId = (run as NonNullable<typeof run>).id;
      newLatest = (run as NonNullable<typeof run>).latestCoveredDate;
    } else if (!run) {
      runId = await this.openRun(manager, params.userId, params.date);
      newLatest = params.date;
    } else {
      const gap = businessDaysBetween(run.latestCoveredDate, params.date);
      const oldestMissing = addBusinessDays(run.latestCoveredDate, 1);
      const gapStillRepairable =
        gap > 1 &&
        isRepairableDate({
          date: oldestMissing,
          today: params.date,
          repairWindowDays: policy.repairWindowDays,
        });

      if (gap === 1 || gapStillRepairable) {
        runId = run.id;
        newLatest = params.date;
      } else {
        // Lỗ hổng đã hết hạn bù: chuỗi cũ chốt lại, và đoạn từ hôm nay là một
        // chuỗi MỚI được xét mốc của chính nó. KHÔNG thu hồi mốc đã phát.
        await manager.query(
          `UPDATE check_in_runs SET status = 'ENDED', updated_at = now()
           WHERE id = $1`,
          [run.id],
        );
        runId = await this.openRun(manager, params.userId, params.date);
        newLatest = params.date;
        run = null;
      }
    }

    return this.finish(manager, {
      params,
      revision,
      runId,
      newLatest,
      creditsRemaining,
    });
  }

  private async openRun(
    manager: EntityManager,
    userId: string,
    date: BusinessDate,
  ): Promise<string> {
    const [row] = await manager.query<{ id: string }[]>(
      `INSERT INTO check_in_runs
         (user_id, start_date, latest_covered_date, current_length, status)
       VALUES ($1, $2::date, $2::date, 1, 'ACTIVE')
       RETURNING id`,
      [userId, date],
    );
    return String(row.id);
  }

  /** Chèn dấu, cập nhật chuỗi, cộng điểm ngày và phát mốc — cùng transaction. */
  private async finish(
    manager: EntityManager,
    input: {
      params: IRecordCheckInParams;
      revision: ICheckInPolicyRevision;
      runId: string;
      newLatest: BusinessDate;
      creditsRemaining: number;
    },
  ): Promise<IRecordCheckInResult> {
    const { params, revision } = input;
    const policy = revision.policy;

    const [fresh] = await manager.query<IRunRow[]>(
      `SELECT id, start_date::text AS start_date,
              latest_covered_date::text AS latest_covered_date, status
       FROM check_in_runs WHERE id = $1`,
      [input.runId],
    );
    const loaded = await this.loadRun(manager, fresh);

    const covered = new Set<BusinessDate>([
      ...loaded.coveredDates,
      params.date,
    ]);
    const streakDay = this.contiguousEndingAt(covered, params.date);
    const dailyPoints = params.kind === 'NORMAL' ? policy.dailyPoints : 0;

    const [entry] = await manager.query<{ id: string }[]>(
      `INSERT INTO check_in_entries
         (user_id, policy_date, kind, run_id, streak_day, policy_version,
          daily_points_awarded)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        params.userId,
        params.date,
        params.kind,
        input.runId,
        streakDay,
        revision.version,
        dailyPoints,
      ],
    );

    const summary = summarizeCheckInRun({
      startDate: loaded.startDate,
      latestCoveredDate: input.newLatest,
      coveredDates: [...covered],
    });
    const runStatus: CheckInRunStatus =
      summary.pendingGapDates.length > 0 ? 'AT_RISK' : 'ACTIVE';

    await manager.query(
      `UPDATE check_in_runs
       SET latest_covered_date = $2::date, current_length = $3, status = $4,
           version = version + 1, updated_at = now()
       WHERE id = $1`,
      [input.runId, input.newLatest, summary.currentStreak, runStatus],
    );

    if (dailyPoints > 0)
      await this.ledger.appendAdjustmentWithinTransaction(manager, {
        userId: params.userId,
        ruleCode: CheckInDailyRuleCode,
        delta: dailyPoints,
        referenceType: 'CHECK_IN',
        referenceId: params.date,
        // Khoá theo user+ngày: đúng khoá nghiệp vụ, nên dù `Idempotency-Key` của
        // client thiếu hay khác nhau thì vẫn không cộng hai lần cho một ngày.
        idempotencyKey: `${CheckInDailyRuleCode}:${params.userId}:${params.date}`,
        actor: 'SYSTEM',
        source: 'CHECK_IN',
        reason: `Điểm danh ngày ${params.date}`,
      });

    // Mốc xét theo chuỗi LIÊN TIẾP, nên "không phát mốc qua lỗ hổng" là hệ quả tự
    // nhiên: còn lỗ thì `currentStreak` chưa chạm mốc. Và một lần bù lấp xong lỗ
    // có thể nhảy qua NHIỀU mốc cùng lúc — tất cả được phát ở đây, mỗi mốc một lần.
    const milestones: IRecordedMilestone[] = [];
    let milestonePointsAwarded = 0;
    for (const milestone of milestonesNewlyReached({
      streakLength: summary.currentStreak,
      milestones: policy.milestones,
      alreadyAwarded: loaded.awardedMilestoneDays,
    })) {
      const award = await this.ledger.appendAdjustmentWithinTransaction(
        manager,
        {
          userId: params.userId,
          ruleCode: CheckInStreakMilestoneRuleCode,
          delta: milestone.bonusPoints,
          referenceType: 'CHECK_IN_MILESTONE',
          referenceId: `${input.runId}:${milestone.streakDays}`,
          idempotencyKey: `${CheckInStreakMilestoneRuleCode}:${input.runId}:${milestone.streakDays}`,
          actor: 'SYSTEM',
          source: 'CHECK_IN',
          reason: `Thưởng mốc ${milestone.streakDays} ngày liên tiếp`,
        },
      );

      await manager.query(
        `INSERT INTO check_in_milestone_awards
           (run_id, user_id, entry_id, milestone_days, bonus_points,
            point_ledger_id, policy_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.runId,
          params.userId,
          entry.id,
          milestone.streakDays,
          milestone.bonusPoints,
          award.entryId,
          revision.version,
        ],
      );

      milestones.push({
        milestoneDays: milestone.streakDays,
        bonusPoints: milestone.bonusPoints,
      });
      milestonePointsAwarded += milestone.bonusPoints;
    }

    return {
      applied: true,
      kind: params.kind,
      date: params.date,
      streakDay,
      currentStreak: summary.currentStreak,
      recoverableStreak: summary.recoverableStreak,
      pendingGapDates: summary.pendingGapDates,
      runStatus,
      dailyPointsAwarded: dailyPoints,
      milestonePointsAwarded,
      milestones,
      repairCreditsRemaining: input.creditsRemaining,
      policyVersion: revision.version,
    };
  }

  public async accrueFromCompletedTransaction(
    manager: EntityManager,
    params: { transactionId: string; giverId: string; receiverId: string },
  ): Promise<void> {
    const [row] = await manager.query<IPolicyRow[]>(
      `SELECT ${PolicyColumns} FROM check_in_policy_revisions
       WHERE effective_at <= now()
       ORDER BY version DESC
       LIMIT 1`,
    );
    // Chưa bật thì KHÔNG tích gì. Tích sẵn khi tắt nghe có vẻ tốt hơn, nhưng
    // ngưỡng được ghim theo nhóm nên tích trước lúc chưa có ngưỡng là ghim một
    // con số chưa ai duyệt.
    if (!row) return;
    const revision = toRevision(row);
    if (!revision.policy.enabled) return;
    if (revision.policy.transactionsPerRepair < 1) return;

    // Người tặng tự nhận quà của chính mình (nếu có đường nào làm được) thì chỉ
    // tính MỘT lần — tập hợp khử trùng trước khi đi vòng.
    const beneficiaries: [string, 'GIVER' | 'RECEIVER'][] = [
      [params.giverId, 'GIVER'],
      [params.receiverId, 'RECEIVER'],
    ];
    const seen = new Set<string>();

    for (const [userId, role] of beneficiaries) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      await this.accrueOne(manager, {
        userId,
        role,
        transactionId: params.transactionId,
        revision,
      });
    }
  }

  /**
   * Tích một giao dịch cho MỘT bên, và phát lượt khi nhóm về đích.
   *
   * `ON CONFLICT DO NOTHING` trên khoá `(user_id, transaction_id)` là chỗ quyết
   * định tính một-lần: lượt hoàn tất gọi lại, hay hai tiến trình chạy song song,
   * đều chỉ chèn được một dòng. Đọc trước rồi mới ghi sẽ lọt ở ca song song.
   *
   * Và phải kiểm `rowCount` chứ không `SELECT` lại: dòng bị bỏ qua nghĩa là giao
   * dịch này đã tích rồi, và cộng `current_count` thêm lần nữa là làm nhóm về
   * đích sớm bằng một giao dịch đếm hai lần.
   */
  private async accrueOne(
    manager: EntityManager,
    input: {
      userId: string;
      role: 'GIVER' | 'RECEIVER';
      transactionId: string;
      revision: ICheckInPolicyRevision;
    },
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      input.userId,
    ]);

    // Nhóm đang mở, hoặc mở mới GHIM ngưỡng của policy hiện hành. Giao dịch sau
    // đó hoàn thành nhóm cũ theo con số đã ghim, không theo con số mới.
    let [cohort] = await manager.query<
      { id: string; current_count: number; required_transactions: number }[]
    >(
      `SELECT id, current_count, required_transactions FROM repair_credit_cohorts
       WHERE user_id = $1 AND status = 'OPEN' FOR UPDATE`,
      [input.userId],
    );

    if (!cohort) {
      const [created] = await manager.query<
        { id: string; current_count: number; required_transactions: number }[]
      >(
        `INSERT INTO repair_credit_cohorts
           (user_id, policy_version, required_transactions, current_count, status)
         VALUES ($1, $2, $3, 0, 'OPEN')
         RETURNING id, current_count, required_transactions`,
        [
          input.userId,
          input.revision.version,
          input.revision.policy.transactionsPerRepair,
        ],
      );
      cohort = created;
    }

    const inserted = await manager.query(
      `INSERT INTO repair_transaction_progress
         (user_id, transaction_id, cohort_id, role, policy_version)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, transaction_id) DO NOTHING
       RETURNING id`,
      [
        input.userId,
        input.transactionId,
        cohort.id,
        input.role,
        input.revision.version,
      ],
    );
    // `INSERT ... RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]` (chỉ
    // UPDATE/DELETE bị), nên đọc `.length` ở đây là đúng — xem update-returning.ts.
    if (!Array.isArray(inserted) || inserted.length === 0) return;

    const nextCount = Number(cohort.current_count) + 1;
    const required = Number(cohort.required_transactions);

    if (nextCount < required) {
      await manager.query(
        `UPDATE repair_credit_cohorts SET current_count = $2 WHERE id = $1`,
        [cohort.id, nextCount],
      );
      return;
    }

    // Đủ ngưỡng: đóng nhóm và phát MỘT lượt. Nhóm kế tiếp mở ở giao dịch sau, theo
    // policy lúc đó — không mở sẵn ở đây, vì mở sẵn là ghim ngưỡng cho một nhóm
    // chưa có giao dịch nào.
    await manager.query(
      `UPDATE repair_credit_cohorts
       SET current_count = $2, status = 'CLOSED', closed_at = now()
       WHERE id = $1`,
      [cohort.id, nextCount],
    );

    const balance = await this.creditBalance(manager, input.userId);
    await manager.query(
      `INSERT INTO repair_credit_ledger
         (user_id, event_type, delta, balance_after, reference_type,
          reference_id, idempotency_key, policy_version, note)
       VALUES ($1, 'ISSUE', 1, $2, 'REPAIR_COHORT', $3, $4, $5, $6)`,
      [
        input.userId,
        balance + 1,
        cohort.id,
        `REPAIR_COHORT:${cohort.id}`,
        input.revision.version,
        `Đủ ${required} lượt tặng/nhận quà hoàn tất`,
      ],
    );
  }
}
