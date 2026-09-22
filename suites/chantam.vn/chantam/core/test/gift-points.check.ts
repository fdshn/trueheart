/**
 * Kiểm điểm khi một lượt trao hoàn tất, trên Postgres THẬT.
 *
 * Hai điều cần chứng minh, và cả hai chỉ thấy được trên database thật:
 *
 *   1. **Nhận KHÔNG cộng `lifetime`.** Đây là lớp chặn cày hạng: hai người
 *      chuyền qua chuyền lại một món đồ thì vẫn có điểm tiêu được, nhưng hạng
 *      không nhúc nhích. Claim này nằm ở cột `affects_lifetime` của point rule —
 *      unit test mock `query` nên không bao giờ đọc tới nó.
 *   2. **Chính sách điểm không được làm hỏng việc xác nhận.** Đạt trần theo
 *      ngày hoặc Admin tắt rule thì người nhận VẪN bấm xác nhận được. Món đồ đã
 *      đến tay là một sự thật; thưởng bao nhiêu là một chính sách.
 *
 *   npm run test:gift-points
 */
import {
  GiftCompletedGiverRuleCode,
  GiftCompletedReceiverRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_gift_points_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const GiverId = '99999999-9999-4999-8999-99999999d001';
const ReceiverId = '99999999-9999-4999-8999-99999999d002';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

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

  const ledger = new PointLedgerRepository(dataSource.manager);
  const transactions = new GiftTransactionRepository(
    dataSource.manager,
    new ChatRepository(dataSource.manager),
    ledger,
  );

  let sequence = 0;

  /** Dựng một bài một món rồi đi hết tới lúc đã duyệt. */
  async function acceptedTransaction(): Promise<string> {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const postId = `88888888-8888-4888-8888-88888888d${suffix}`;
    const transactionId = `55555555-5555-4555-8555-55555555d${suffix}`;

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, $4, 'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [postId, GiverId, CategoryId, `Bài kiểm điểm số ${sequence}`],
    );
    await transactions.request({
      globalId: transactionId,
      postId,
      receiverId: ReceiverId,
      quantity: 1,
    });
    await transactions.accept(transactionId, GiverId);
    return transactionId;
  }

  try {
    const users: [string, string][] = [
      [GiverId, 'nguoitang_diem'],
      [ReceiverId, 'nguoinhan_diem'],
    ];
    for (const [id, username] of users)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    // ── 1. Cộng điểm cho cả hai bên ─────────────────────────────────────────
    console.log('Hoàn tất một lượt trao:\n');

    const first = await acceptedTransaction();

    const beforeGiver = await ledger.getSummary(GiverId);
    check(
      'trước khi trao, cả hai đều 0 điểm',
      beforeGiver.balance === 0 && beforeGiver.lifetime === 0,
      JSON.stringify(beforeGiver),
    );

    await transactions.confirmReceipt(first, ReceiverId);

    const giver = await ledger.getSummary(GiverId);
    const receiver = await ledger.getSummary(ReceiverId);

    check(
      'người tặng được cộng điểm',
      giver.balance === 56,
      `balance=${giver.balance}`,
    );
    check(
      'người nhận cũng được cộng, nhưng ít hơn',
      receiver.balance === 28,
      `balance=${receiver.balance}`,
    );
    check(
      'TẶNG đẩy lifetime — tức đẩy được hạng',
      giver.lifetime === 56,
      `lifetime=${giver.lifetime}`,
    );
    check(
      'NHẬN không đẩy lifetime — chặn đường chuyền đồ qua lại để cùng lên hạng',
      receiver.lifetime === 0,
      `lifetime=${receiver.lifetime}`,
    );

    // ── 2. Không thưởng hai lần ─────────────────────────────────────────────
    console.log('\nChống thưởng trùng:\n');

    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM point_ledger
       WHERE reference_id = $1 AND rule_code = ANY($2::text[])`,
      [first, [GiftCompletedGiverRuleCode, GiftCompletedReceiverRuleCode]],
    );
    check(
      'đúng hai bút toán cho một lượt trao, không hơn',
      Number(rows[0].count) === 2,
      `${rows[0].count} bút toán`,
    );

    // Cron tự hoàn tất chạy lại trên lượt ĐÃ xong: không được thưởng thêm.
    await transactions.completeDueDeliveries(0);
    const afterCron = await ledger.getSummary(GiverId);
    check(
      'cron chạy lại không thưởng thêm cho lượt đã hoàn tất',
      afterCron.balance === 56,
      `balance=${afterCron.balance}`,
    );

    // ── 3. Tự hoàn tất cũng được thưởng ─────────────────────────────────────
    console.log('\nCron tự hoàn tất:\n');

    const second = await acceptedTransaction();
    await dataSource.query(
      `UPDATE gift_transactions SET accepted_at = now() - interval '10 days'
       WHERE global_id = $1`,
      [second],
    );
    await transactions.completeDueDeliveries(5);

    check(
      'lượt do cron đóng cũng được thưởng như lượt bấm tay',
      (await ledger.getSummary(GiverId)).balance === 112,
      `balance=${(await ledger.getSummary(GiverId)).balance}`,
    );

    // ── 4. Chính sách điểm KHÔNG được làm hỏng việc xác nhận ────────────────
    console.log('\nKhi điểm không cộng được:\n');

    // Đạt trần theo ngày: hạ trần xuống đúng số đã thưởng.
    await dataSource.query(
      `UPDATE point_rules SET daily_cap = 1 WHERE code = $1`,
      [GiftCompletedGiverRuleCode],
    );
    const third = await acceptedTransaction();
    let confirmFailed = false;
    try {
      await transactions.confirmReceipt(third, ReceiverId);
    } catch {
      confirmFailed = true;
    }
    check(
      'đạt trần điểm trong ngày thì VẪN xác nhận được',
      !confirmFailed,
      confirmFailed ? 'xác nhận bị chặn vì trần điểm' : '',
    );
    check(
      'và lượt trao thật sự COMPLETED',
      (
        await dataSource.query<{ status: string }[]>(
          `SELECT status FROM gift_transactions WHERE global_id = $1`,
          [third],
        )
      )[0].status === 'COMPLETED',
    );
    check(
      'người tặng không được cộng thêm vì đã đụng trần',
      (await ledger.getSummary(GiverId)).balance === 112,
      `balance=${(await ledger.getSummary(GiverId)).balance}`,
    );
    check(
      'nhưng người nhận vẫn được cộng — trần của mỗi rule là riêng',
      (await ledger.getSummary(ReceiverId)).balance === 84,
      `balance=${(await ledger.getSummary(ReceiverId)).balance}`,
    );

    // Admin tắt rule.
    await dataSource.query(
      `UPDATE point_rules SET is_enabled = false, daily_cap = NULL
       WHERE code = ANY($1::text[])`,
      [[GiftCompletedGiverRuleCode, GiftCompletedReceiverRuleCode]],
    );
    const fourth = await acceptedTransaction();
    let confirmFailedNoRule = false;
    try {
      await transactions.confirmReceipt(fourth, ReceiverId);
    } catch {
      confirmFailedNoRule = true;
    }
    check(
      'Admin tắt rule thì VẪN xác nhận được',
      !confirmFailedNoRule,
      confirmFailedNoRule ? 'xác nhận bị chặn vì thiếu rule' : '',
    );
    check(
      'lượt trao vẫn COMPLETED dù không ai được điểm',
      (
        await dataSource.query<{ status: string }[]>(
          `SELECT status FROM gift_transactions WHERE global_id = $1`,
          [fourth],
        )
      )[0].status === 'COMPLETED',
    );

    // ── 5. Rule là cấu hình, không phải hằng số trong code ──────────────────
    console.log('\nAdmin chỉnh số điểm:\n');

    await dataSource.query(
      `UPDATE point_rules SET is_enabled = true WHERE code = ANY($1::text[])`,
      [[GiftCompletedGiverRuleCode, GiftCompletedReceiverRuleCode]],
    );
    await dataSource.query(
      `INSERT INTO point_rules (code, points, affects_lifetime, daily_cap, version)
       VALUES ($1, 200, true, NULL, 2)`,
      [GiftCompletedGiverRuleCode],
    );
    const fifth = await acceptedTransaction();
    await transactions.confirmReceipt(fifth, ReceiverId);
    check(
      'phiên bản rule mới có hiệu lực ngay, không cần deploy',
      (await ledger.getSummary(GiverId)).balance === 312,
      `balance=${(await ledger.getSummary(GiverId)).balance}`,
    );
    check(
      'bút toán ghi lại đúng phiên bản rule đã dùng',
      (
        await dataSource.query<{ rule_version: number }[]>(
          `SELECT rule_version FROM point_ledger
           WHERE reference_id = $1 AND rule_code = $2`,
          [fifth, GiftCompletedGiverRuleCode],
        )
      )[0].rule_version === 2,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
    console.log(`\nĐã xoá database nháp ${ScratchDatabase}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} phép kiểm KHÔNG đạt:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nTặng và nhận đều có điểm, và điểm không cản việc xác nhận.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
