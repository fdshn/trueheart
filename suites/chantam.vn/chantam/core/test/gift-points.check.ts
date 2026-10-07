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
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { AffiliateRepository } from '../src/infrastructure/repository/affiliate.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { CheckInRepository } from '../src/infrastructure/repository/check-in.repository';
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
    new ChatRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    ),
    ledger,
    // `CheckInRepository` là tham số thật, không mock: ở đây chưa publish policy F83 nào nên
    // `accrueFromCompletedTransaction` thoát sớm. Nhờ vậy tám script này canh luôn
    // nhánh "tính năng tắt thì KHÔNG tích lượt bù" mà không phải viết gì thêm.
    new CheckInRepository(dataSource.manager, ledger),
    new AffiliateRepository(
      dataSource.manager,
      ledger,
      new AdminConfigRepository(dataSource.manager),
    ),
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
    // Dựng thẳng trạng thái ACCEPTED bằng SQL.
    //
    // `request()` và `accept()` đã bị gỡ ngày 28/09: `POST /transactions` là một
    // cửa sau bỏ qua mọi hàng rào mà luồng xin nhận áp. Phép kiểm này cần một
    // lượt trao ở trạng thái ACCEPTED để đo ĐIỂM, không cần đo lại đường tạo nó
    // — luồng đó đã có `request-lifecycle.check.ts` lo.
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at)
       VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())`,
      [transactionId, postId, GiverId, ReceiverId],
    );
    await dataSource.query(
      `UPDATE posts SET remaining_quantity = 0 WHERE global_id = $1`,
      [postId],
    );
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

    // CẢ HAI bên được cộng ngay tại đây, từ 07/10 (CHỐT-14).
    //
    // Tới 06/10 phép kiểm này khẳng định điều NGƯỢC LẠI — `balance === 0` — và nó
    // đúng với luật lúc đó: điểm người tặng là `mức trần × mức chính xác người
    // nhận chấm`, mà lúc hoàn tất chưa ai chấm. CHỐT-14 tách phần phụ thuộc
    // accuracy ra thành `value_bonus` riêng (chốt tại hạn, trong
    // `gift:settle-rewards`), nên `completion_points` còn lại là mức trần — một
    // con số đã biết ngay tại `COMPLETED`, không còn gì phải chờ.
    check(
      'người tặng được cộng NGAY — không còn chờ mức chính xác',
      giver.balance === 56,
      `balance=${giver.balance}`,
    );
    check(
      'người nhận cũng được cộng, nhưng ít hơn',
      receiver.balance === 28,
      `balance=${receiver.balance}`,
    );
    check(
      'và lifetime của người tặng nhích theo — rule có affects_lifetime',
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
      'đúng HAI bút toán lúc hoàn tất — một cho mỗi bên, không hơn',
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
    const receiverAfterCron = await ledger.getSummary(ReceiverId);
    check(
      'và người nhận cũng không được cộng lần hai',
      receiverAfterCron.balance === 28,
      `balance=${receiverAfterCron.balance}`,
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
      'lượt do cron đóng xử lý giống lượt bấm tay — người nhận được cộng',
      (await ledger.getSummary(ReceiverId)).balance === 56,
      `balance=${(await ledger.getSummary(ReceiverId)).balance}`,
    );
    check(
      'và người tặng cũng vậy — bấm tay hay cron đóng đều cộng đủ',
      (await ledger.getSummary(GiverId)).balance === 112,
      `balance=${(await ledger.getSummary(GiverId)).balance}`,
    );

    // ── 4. Chính sách điểm KHÔNG được làm hỏng việc xác nhận ────────────────
    console.log('\nKhi điểm không cộng được:\n');

    // Đạt trần theo ngày, hạ trần của RIÊNG rule người nhận. Từ 07/10 cả hai rule
    // đều cộng lúc hoàn tất, nên đặt trần một bên là cách dựng đúng ca đáng lo
    // nhất: một bên bị chặn thì bên kia PHẢI vẫn được cộng. `try/catch` nằm ngoài
    // vòng lặp sẽ làm cả hai mất điểm, và không phép kiểm nào khác thấy.
    await dataSource.query(
      `UPDATE point_rules SET daily_cap = 1 WHERE code = $1`,
      [GiftCompletedReceiverRuleCode],
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
      'người nhận không được cộng thêm vì đã đụng trần',
      (await ledger.getSummary(ReceiverId)).balance === 56,
      `balance=${(await ledger.getSummary(ReceiverId)).balance}`,
    );
    check(
      'nhưng người TẶNG vẫn được cộng — trần của bên kia không cuốn theo',
      (await ledger.getSummary(GiverId)).balance === 168,
      `balance=${(await ledger.getSummary(GiverId)).balance}`,
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
    check(
      'và thật sự không ai được cộng — cả hai bên đứng yên',
      (await ledger.getSummary(GiverId)).balance === 168 &&
        (await ledger.getSummary(ReceiverId)).balance === 56,
      `tặng=${(await ledger.getSummary(GiverId)).balance} nhận=${
        (await ledger.getSummary(ReceiverId)).balance
      }`,
    );

    // ── 5. Rule là cấu hình, không phải hằng số trong code ──────────────────
    console.log('\nAdmin chỉnh số điểm:\n');

    await dataSource.query(
      `UPDATE point_rules SET is_enabled = true WHERE code = ANY($1::text[])`,
      [[GiftCompletedGiverRuleCode, GiftCompletedReceiverRuleCode]],
    );
    await dataSource.query(
      `INSERT INTO point_rules (code, points, affects_lifetime, daily_cap, version)
       VALUES ($1, 200, false, NULL, 2)`,
      [GiftCompletedReceiverRuleCode],
    );
    const fifth = await acceptedTransaction();
    await transactions.confirmReceipt(fifth, ReceiverId);
    check(
      'phiên bản rule mới có hiệu lực ngay, không cần deploy',
      (await ledger.getSummary(ReceiverId)).balance === 256,
      `balance=${(await ledger.getSummary(ReceiverId)).balance}`,
    );
    check(
      'rule người tặng không bị đổi thì số điểm cũng không đổi',
      (await ledger.getSummary(GiverId)).balance === 224,
      `balance=${(await ledger.getSummary(GiverId)).balance}`,
    );
    check(
      'bút toán ghi lại đúng phiên bản rule đã dùng',
      (
        await dataSource.query<{ rule_version: number }[]>(
          `SELECT rule_version FROM point_ledger
           WHERE reference_id = $1 AND rule_code = $2`,
          [fifth, GiftCompletedReceiverRuleCode],
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
