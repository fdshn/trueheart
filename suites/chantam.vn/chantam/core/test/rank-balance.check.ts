/**
 * Kiểm mô hình thứ hạng trên Postgres THẬT (chốt 2026-09-24).
 *
 * Năm điều cần CHỨNG MINH chứ không khẳng định:
 *
 * 1. Hạng xét theo `balance`, không theo `lifetime` — người tiêu điểm phải tụt.
 * 2. Tụt theo ngưỡng hiện tại, KHÔNG ép đúng một bậc.
 * 3. Trượt nhiệm vụ duy trì chỉ đánh `FAILED`, không tự đổi hạng.
 * 4. Khoản trừ do trượt nhiệm vụ đi qua sổ điểm, có khoá chống trùng, và KHÔNG
 *    hạ `lifetime`.
 * 5. `getOwnSummary` trả mốc cảnh báo để client dựng được lời nhắc.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { RankRepository } from '../src/infrastructure/repository/rank.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_rank_balance_check';
const UserId = '99999999-9999-4999-8999-9999999c1001';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/** Đếm lượt tặng luôn khả dụng và đủ lớn, để rank không bị chặn bởi nhiệm vụ. */
const generousActivity = {
  countCompletedGifts: async () => ({ available: true, completedGifts: 0 }),
  countLifetimeCompletedGifts: async () => ({
    available: true,
    completedGifts: 99,
  }),
};

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const opened: DataSource[] = [];
  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  opened.push(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  const ranks = new RankRepository(
    dataSource.manager,
    generousActivity as never,
  );
  const ledger = new PointLedgerRepository(dataSource.manager);

  /** Đặt thẳng số dư, bỏ qua sổ — để dựng tình huống nhanh. */
  async function setBalance(
    balance: number,
    lifetime: number,
    rank: string,
  ): Promise<void> {
    await dataSource.query(`UPDATE users SET rank = $2 WHERE global_id = $1`, [
      UserId,
      rank,
    ]);
    await dataSource.query(
      `INSERT INTO user_point_balances (user_id, balance, raw_balance, lifetime)
       VALUES ($1, $2, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         balance = EXCLUDED.balance,
         raw_balance = EXCLUDED.raw_balance,
         lifetime = EXCLUDED.lifetime`,
      [UserId, balance, lifetime],
    );
  }

  async function currentRank(): Promise<string> {
    const [row] = await dataSource.query<{ rank: string }[]>(
      `SELECT rank FROM users WHERE global_id = $1`,
      [UserId],
    );
    return row.rank;
  }

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'nguoi-xet-hang', 'nguoi-xet-hang@chantam.test', 'x', 'MEMBER', 'ACTIVE')`,
      [UserId],
    );

    console.log('1. Hạng xét theo balance, không theo lifetime');
    // Lifetime cao (từng kiếm 2000) nhưng balance chỉ còn mức Thành viên.
    await setBalance(300, 2000, 'GOLD');
    const dropped = await ranks.reconcileNormalRank(UserId);
    check(
      'lifetime 2000 KHÔNG giữ được hạng Vàng khi balance chỉ 300',
      (await currentRank()) === 'MEMBER',
      `nay là ${await currentRank()}`,
    );
    check('trả về mô tả lần đổi', dropped !== null);
    check('và đánh dấu là tụt hạng', dropped?.demoted === true);
    check(
      'nói rõ đổi TỪ đâu SANG đâu',
      dropped?.fromRank === 'GOLD' && dropped?.toRank === 'MEMBER',
      `${dropped?.fromRank} → ${dropped?.toRank}`,
    );

    console.log('\n2. Tụt theo ngưỡng hiện tại, không ép một bậc');
    check(
      'Vàng (896) với 300 điểm tụt thẳng về Thành viên, bỏ qua Bạc',
      (await currentRank()) === 'MEMBER',
    );
    const [transition] = await dataSource.query<
      { from_rank: string; to_rank: string; reason: string }[]
    >(
      `SELECT from_rank, to_rank, reason FROM rank_transitions
       WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [UserId],
    );
    check(
      'ghi audit với lý do xét lại theo số dư',
      transition?.reason === 'BALANCE_REEVALUATION',
      `reason=${transition?.reason}`,
    );

    console.log('\n3. Tiêu điểm làm tụt hạng');
    await setBalance(700, 2000, 'SILVER');
    check('đang là Bạc với 700 điểm', (await currentRank()) === 'SILVER');
    // Tiêu 100 điểm qua sổ: 700 → 600, dưới ngưỡng Bạc 672.
    await ledger.appendAdjustment({
      userId: UserId,
      ruleCode: 'ITEM_REDEMPTION',
      delta: -100,
      referenceType: 'POST',
      referenceId: '88888888-8888-4888-8888-8888888c0001',
      idempotencyKey: 'ITEM_REDEMPTION:kiem-tra-1',
      actor: UserId,
      source: 'TEST',
      reason: 'Đổi vật phẩm',
    });
    await ranks.reconcileNormalRank(UserId);
    check(
      'tiêu 100 điểm từ 700 xuống 600 làm tụt khỏi Bạc',
      (await currentRank()) === 'MEMBER',
      `nay là ${await currentRank()}`,
    );

    console.log('\n4. Khoản trừ không hạ lifetime');
    const [afterSpend] = await dataSource.query<
      { balance: string; lifetime: string }[]
    >(`SELECT balance, lifetime FROM user_point_balances WHERE user_id = $1`, [
      UserId,
    ]);
    check(
      'balance giảm đúng 100',
      Number(afterSpend.balance) === 600,
      `balance=${afterSpend.balance}`,
    );
    check(
      'lifetime GIỮ NGUYÊN — khoản trừ là sự kiện có thật, không phải phủ nhận',
      Number(afterSpend.lifetime) === 2000,
      `lifetime=${afterSpend.lifetime}`,
    );

    console.log('\n5. Khoản trừ idempotent');
    const again = await ledger.appendAdjustment({
      userId: UserId,
      ruleCode: 'ITEM_REDEMPTION',
      delta: -100,
      referenceType: 'POST',
      referenceId: '88888888-8888-4888-8888-8888888c0001',
      idempotencyKey: 'ITEM_REDEMPTION:kiem-tra-1',
      actor: UserId,
      source: 'TEST',
      reason: 'Đổi vật phẩm',
    });
    check('lần hai không ghi gì', again.applied === false);
    const [{ count }] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM point_ledger WHERE idempotency_key = $1`,
      ['ITEM_REDEMPTION:kiem-tra-1'],
    );
    check('chỉ MỘT bút toán trong sổ', Number(count) === 1);

    console.log('\n6. Lý do nghiệp vụ vào cột log');
    const [entry] = await dataSource.query<{ reason: string }[]>(
      `SELECT reason FROM point_ledger WHERE idempotency_key = $1`,
      ['ITEM_REDEMPTION:kiem-tra-1'],
    );
    check(
      'giữ lý do đọc được, không chỉ mã rule',
      (entry?.reason ?? '').includes('Đổi vật phẩm'),
      `reason=${entry?.reason}`,
    );
    check(
      'kèm câu số học dựng ở máy chủ',
      (entry?.reason ?? '').includes('-100 điểm'),
      `reason=${entry?.reason}`,
    );

    console.log('\n7. Trượt nhiệm vụ chỉ đánh FAILED');
    await setBalance(700, 2000, 'SILVER');
    await dataSource.query(
      `INSERT INTO rank_maintenance_cycles
         (user_id, rank, cycle_start, cycle_end, required_gifts, required_referrals,
          policy_version, status)
       VALUES ($1, 'SILVER', now() - interval '4 months',
               now() - interval '1 day', 2, 2, 1, 'OPEN')`,
      [UserId],
    );
    await ranks.evaluateDueMaintenanceCycles();

    const [cycle] = await dataSource.query<{ id: string; status: string }[]>(
      `SELECT id, status FROM rank_maintenance_cycles
       WHERE user_id = $1 AND rank = 'SILVER' ORDER BY id ASC LIMIT 1`,
      [UserId],
    );
    check('chu kỳ đánh FAILED', cycle?.status === 'FAILED', cycle?.status);
    check(
      'nhưng hạng KHÔNG tự đổi — chờ khoản trừ tác động qua điểm',
      (await currentRank()) === 'SILVER',
      `nay là ${await currentRank()}`,
    );

    console.log('\n8. Chu kỳ trượt chờ bị trừ điểm');
    const pending = await ranks.findUnpenalizedFailedCycles(10);
    const mine = pending.find((row) => row.cycleId === cycle.id);
    check('có trong danh sách chờ trừ', Boolean(mine));
    check(
      'mức trừ đúng theo bậc Bạc (224)',
      mine?.penaltyPoints === 224,
      `nhận ${mine?.penaltyPoints}`,
    );

    await ledger.appendAdjustment({
      userId: UserId,
      ruleCode: 'MAINTENANCE_FAILED',
      delta: -224,
      referenceType: 'RANK_MAINTENANCE_CYCLE',
      referenceId: cycle.id,
      idempotencyKey: `MAINTENANCE_FAILED:${cycle.id}`,
      actor: 'SYSTEM',
      source: 'RANK_MAINTENANCE',
      reason: 'Trượt nhiệm vụ duy trì bậc SILVER',
    });
    const afterPenalty = await ranks.reconcileNormalRank(UserId);
    check(
      'trừ 224 từ 700 xuống 476 làm tụt khỏi Bạc',
      (await currentRank()) === 'MEMBER',
      `nay là ${await currentRank()}`,
    );
    check('và báo là tụt hạng', afterPenalty?.demoted === true);

    const stillPending = await ranks.findUnpenalizedFailedCycles(10);
    check(
      'chu kỳ đã trừ KHÔNG còn trong danh sách chờ',
      !stillPending.some((row) => row.cycleId === cycle.id),
    );

    console.log('\n9. Mốc cảnh báo có trong summary');
    await setBalance(460, 2000, 'SILVER');
    const summary = await ranks.getOwnSummary(UserId);
    check(
      'trả balancePoints — con số quyết định hạng',
      summary.balancePoints === 460,
      `${summary.balancePoints}`,
    );
    check(
      'trả lifetimePoints riêng — chỉ để hiển thị',
      summary.lifetimePoints === 2000,
      `${summary.lifetimePoints}`,
    );
    check(
      'trả mốc cảnh báo của bậc Bạc (470)',
      summary.currentTier.warningPoints === 470,
      `${summary.currentTier.warningPoints}`,
    );
    check(
      '460 đã dưới mốc 470 — client dựng được lời nhắc',
      summary.balancePoints < summary.currentTier.warningPoints,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Thứ hạng: balance quyết định, tiêu điểm thì tụt, nhiệm vụ tác động qua điểm'
        : `${failures.length} phép kiểm thất bại`
    }`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
