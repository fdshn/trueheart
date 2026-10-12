import {
  CheckInDailyRuleCode,
  CheckInStreakMilestoneRuleCode,
} from '@chantam.vn/chantam.core-lib/models';
import { ISeedContext, Personas, SeedDomains, seedId } from './seed-context';

/**
 * Điểm danh và tín dụng bù của người tặng demo (F57).
 *
 * Chính sách điểm danh v1 do migration seed đang TẮT (bản nháp chờ Bên A). Seed KHÔNG
 * bật nó và KHÔNG thêm revision mới; lịch sử dưới đây ghi theo số của v1 để các API
 * đọc (lịch, chuỗi, mốc, tín dụng bù) có dữ liệu. Điểm danh MỚI vẫn bị từ chối cho tới
 * khi Admin bật chính sách — đúng hành vi thật.
 *
 * Kịch bản: chuỗi 9 ngày tới hôm nay, ngày thứ 5 là một lần BÙ (tiêu 1 tín dụng),
 * chạm mốc 7 ngày. Tín dụng có được nhờ 4 giao dịch hoàn tất (một cohort đã đóng), và
 * cohort kế tiếp đang mở với 1/4.
 */
export async function seedCheckIns(ctx: ISeedContext): Promise<void> {
  const userId = Personas.giver;
  const [policy] = await ctx.q<{
    version: number;
    daily_points: number;
    milestones_json: { streakDays: number; bonusPoints: number }[];
  }>(
    `SELECT version, daily_points, milestones_json FROM check_in_policy_revisions ORDER BY version LIMIT 1`,
  );
  if (!policy) return;
  const repairPolicyVersion = policy.version;

  // Lịch sử neo theo NGÀY seed lần đầu. Chạy lại vào hôm khác mà ghi tiếp thì ra
  // một chuỗi có ngày mới nhưng `streak_day` cũ — nên đã có chuỗi là thôi.
  const [seeded] = await ctx.q(
    `SELECT 1 FROM check_in_runs WHERE global_id = $1`,
    [seedId(SeedDomains.checkInRuns, 1)],
  );
  if (seeded) return;

  await ctx.q(
    `
      INSERT INTO check_in_runs (global_id, user_id, start_date, latest_covered_date, current_length, status)
      VALUES ($1, $2, current_date - 8, current_date, 9, 'ACTIVE')
      ON CONFLICT DO NOTHING
    `,
    [seedId(SeedDomains.checkInRuns, 1), userId],
  );
  const [run] = await ctx.q<{ id: string }>(
    `SELECT id FROM check_in_runs WHERE global_id = $1`,
    [seedId(SeedDomains.checkInRuns, 1)],
  );
  if (!run) return;

  // Tín dụng bù: cohort đóng với 4 giao dịch, cấp 1 tín dụng; cohort mở có 1 giao dịch.
  const giverDeals = [3, 7, 8, 9, 10].map((n) =>
    seedId(SeedDomains.transactions, n),
  );
  const cohortId = await ensureCohort(
    ctx,
    userId,
    repairPolicyVersion,
    'CLOSED',
    4,
  );
  const openCohortId = await ensureCohort(
    ctx,
    userId,
    repairPolicyVersion,
    'OPEN',
    1,
  );
  for (const [index, deal] of giverDeals.entries())
    await ctx.q(
      `
        INSERT INTO repair_transaction_progress (user_id, transaction_id, cohort_id, role, policy_version)
        VALUES ($1, $2, $3, 'GIVER', $4)
        ON CONFLICT (user_id, transaction_id) DO NOTHING
      `,
      [userId, deal, index < 4 ? cohortId : openCohortId, repairPolicyVersion],
    );
  const repairDate = await ctx.q<{ day: string }>(
    `SELECT (current_date - 4)::text AS day`,
  );
  for (const [type, delta, balance, refType, refId, key, note] of [
    [
      'ISSUE',
      1,
      1,
      'REPAIR_COHORT',
      cohortId,
      `REPAIR_COHORT:${cohortId}`,
      'Đủ 4 lượt tặng/nhận quà hoàn tất',
    ],
    [
      'SPEND',
      -1,
      0,
      'CHECK_IN_REPAIR',
      repairDate[0].day,
      `CHECK_IN_REPAIR:${userId}:${repairDate[0].day}`,
      `Bù điểm danh ngày ${repairDate[0].day}`,
    ],
  ] as const)
    await ctx.q(
      `
        INSERT INTO repair_credit_ledger
          (user_id, event_type, delta, balance_after, reference_type, reference_id,
           idempotency_key, policy_version, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        userId,
        type,
        delta,
        balance,
        refType,
        String(refId),
        key,
        repairPolicyVersion,
        note,
      ],
    );

  const days = await ctx.q<{ day: string; offset: number }>(
    `SELECT (current_date - g)::text AS day, g AS offset FROM generate_series(8, 0, -1) g`,
  );
  for (const [index, { day, offset }] of days.entries()) {
    const repair = offset === 4;
    const points = repair ? 0 : policy.daily_points;
    await ctx.q(
      `
        INSERT INTO check_in_entries (user_id, policy_date, kind, run_id, streak_day, policy_version, daily_points_awarded)
        VALUES ($1, $2::date, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, policy_date) DO NOTHING
      `,
      [
        userId,
        day,
        repair ? 'REPAIR' : 'NORMAL',
        run.id,
        index + 1,
        policy.version,
        points,
      ],
    );
    if (points > 0)
      await ctx.ledger.appendAdjustment({
        userId,
        ruleCode: CheckInDailyRuleCode,
        delta: points,
        referenceType: 'CHECK_IN',
        referenceId: day,
        idempotencyKey: `${CheckInDailyRuleCode}:${userId}:${day}`,
        actor: 'SYSTEM',
        source: 'CHECK_IN',
        reason: `Điểm danh ngày ${day}`,
      });
  }

  const milestone = policy.milestones_json.find(
    (one) => one.streakDays <= days.length,
  );
  if (!milestone) return;
  const award = await ctx.ledger.appendAdjustment({
    userId,
    ruleCode: CheckInStreakMilestoneRuleCode,
    delta: milestone.bonusPoints,
    referenceType: 'CHECK_IN_MILESTONE',
    referenceId: `${run.id}:${milestone.streakDays}`,
    idempotencyKey: `${CheckInStreakMilestoneRuleCode}:${run.id}:${milestone.streakDays}`,
    actor: 'SYSTEM',
    source: 'CHECK_IN',
    reason: `Thưởng mốc ${milestone.streakDays} ngày liên tiếp`,
  });
  await ctx.q(
    `
      INSERT INTO check_in_milestone_awards
        (run_id, user_id, entry_id, milestone_days, bonus_points, point_ledger_id, policy_version)
      SELECT $1, $2, entry.id, $3, $4, $5, $6
      FROM check_in_entries entry
      WHERE entry.user_id = $2 AND entry.run_id = $1 AND entry.streak_day = $3
      ON CONFLICT (run_id, milestone_days) DO NOTHING
    `,
    [
      run.id,
      userId,
      milestone.streakDays,
      milestone.bonusPoints,
      award.entryId,
      policy.version,
    ],
  );
}

/** Cohort không có khoá tự nhiên ngoài "một cohort OPEN mỗi người" — tìm theo trạng thái. */
async function ensureCohort(
  ctx: ISeedContext,
  userId: string,
  policyVersion: number,
  status: 'OPEN' | 'CLOSED',
  count: number,
): Promise<string> {
  const [existing] = await ctx.q<{ id: string }>(
    `SELECT id FROM repair_credit_cohorts WHERE user_id = $1 AND status = $2 ORDER BY id LIMIT 1`,
    [userId, status],
  );
  if (existing) return existing.id;
  const [created] = await ctx.q<{ id: string }>(
    `
      INSERT INTO repair_credit_cohorts
        (user_id, policy_version, required_transactions, current_count, status, closed_at)
      SELECT $1, $2, transactions_per_repair, $3, $4::text,
             CASE WHEN $4::text = 'CLOSED' THEN now() - interval '5 days' END
      FROM check_in_policy_revisions WHERE version = $2
      RETURNING id
    `,
    [userId, policyVersion, count, status],
  );
  return created.id;
}
