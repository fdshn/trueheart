/**
 * Kiểm hai đường trả thưởng lượt trao trên Postgres THẬT (F40).
 *
 * Năm thứ unit test mock không thấy được:
 *
 * 1. Hệ số nhân thật sự đổi `delta` trong `point_ledger`, và làm tròn đúng.
 * 2. Khoá chống trùng chặn được **cả hai** đường: đánh giá tới trước thì job
 *    không trả thêm, và ngược lại.
 * 3. Câu `findUnreviewedCompletions` lọc đúng — chỉ đếm đánh giá của NGƯỜI NHẬN,
 *    và loại lượt đã có bút toán.
 * 4. Chấm 0% vẫn ghi bút toán delta = 0, nên job sau đó KHÔNG trả mức mặc định.
 * 5. `lifetime` cộng theo delta đã nhân, không theo mức trần của rule.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { TransactionReviewRepository } from '../src/infrastructure/repository/transaction-review.repository';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_gift_rewards_check';
const CategoryId = '30000000-0000-4000-8000-0000000b0001';
const GiverId = '99999999-9999-4999-8999-9999999b1001';
const ReceiverId = '99999999-9999-4999-8999-9999999b1002';
const PostId = '88888888-8888-4888-8888-8888888b1001';
/** Người tặng riêng cho vòng kiểm làm tròn, để không đụng cap 5 lượt/ngày. */
const RoundingGiverId = '99999999-9999-4999-8999-9999999b1003';

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
  const adminConfig = new AdminConfigRepository(dataSource.manager);
  const reviews = new TransactionReviewRepository(
    dataSource.manager,
    adminConfig,
  );

  /** Dựng một lượt trao COMPLETED, hoàn tất cách đây `daysAgo` ngày. */
  async function seedDeal(
    id: string,
    daysAgo: number,
    giverId: string = GiverId,
  ): Promise<string> {
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at, completed_at)
       VALUES ($1, $2, $3, $4, 1, 'COMPLETED',
               now() - ($5 || ' days')::interval,
               now() - ($5 || ' days')::interval)`,
      [id, PostId, giverId, ReceiverId, String(daysAgo)],
    );
    return id;
  }

  try {
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm thưởng', 'kiem-thuong', true)`,
      [CategoryId],
    );
    for (const [id, name] of [
      [GiverId, 'nguoi-tang'],
      [ReceiverId, 'nguoi-nhan'],
      [RoundingGiverId, 'nguoi-tang-lam-tron'],
    ] as const)
      await dataSource.query(
        `INSERT INTO users (global_id, username, email, password_hash, rank, status)
         VALUES ($1, $2, $3, 'x', 'MEMBER', 'ACTIVE')`,
        [id, name, `${name}@chantam.test`],
      );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm thưởng',
               'Mô tả đủ dài cho bài kiểm trả thưởng lượt trao',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'COMPLETED', 9, 9, '{}'::jsonb, 0)`,
      [PostId, GiverId, CategoryId],
    );

    console.log('1. Hệ số nhân đổi delta thật trong ledger');
    const dealA = await seedDeal('77777777-7777-4777-8777-7777777a0001', 0);
    const awardA = await ledger.appendByRule({
      userId: GiverId,
      ruleCode: 'GIFT_COMPLETED',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: dealA,
      idempotencyKey: `GIFT_COMPLETED:${dealA}`,
      actor: ReceiverId,
      source: 'REVIEW',
      multiplierPercent: 90,
      reason: 'Người nhận chấm 90%',
    });
    check(
      '56 × 90% = 50 (50,4 làm tròn xuống)',
      awardA.delta === 50,
      `delta=${awardA.delta}`,
    );
    check('applied = true ở lần đầu', awardA.applied === true);

    const [rowA] = await dataSource.query<
      { delta: string; lifetime_after: string; rule_version: string }[]
    >(
      `SELECT delta, lifetime_after, rule_version FROM point_ledger
       WHERE idempotency_key = $1`,
      [`GIFT_COMPLETED:${dealA}`],
    );
    check(
      'ledger lưu delta đã nhân, không lưu mức trần 56',
      Number(rowA?.delta) === 50,
      `trong DB là ${rowA?.delta}`,
    );
    check(
      'lifetime cộng theo delta đã nhân',
      Number(rowA?.lifetime_after) === 50,
      `lifetime=${rowA?.lifetime_after}`,
    );
    check(
      'ghi lại phiên bản rule để tra ngược',
      Number(rowA?.rule_version) >= 1,
    );

    console.log('\n2. Làm tròn ở các mức lẻ');
    for (const [percent, expected] of [
      [43, 24],
      [50, 28],
      [1, 1],
      [100, 56],
    ] as const) {
      // Đoạn cuối UUID phải đúng 12 ký tự hex, nên 9 ký tự cố định + 3 ký tự số.
      const deal = await seedDeal(
        `77777777-7777-4777-8777-7777777a1${String(percent).padStart(3, '0')}`,
        0,
        RoundingGiverId,
      );
      const result = await ledger.appendByRule({
        userId: RoundingGiverId,
        ruleCode: 'GIFT_COMPLETED',
        referenceType: 'GIFT_TRANSACTION',
        referenceId: deal,
        idempotencyKey: `GIFT_COMPLETED:${deal}`,
        actor: ReceiverId,
        source: 'REVIEW',
        multiplierPercent: percent,
      });
      check(
        `56 × ${percent}% = ${expected}`,
        result.delta === expected,
        `nhận ${result.delta}`,
      );
    }

    console.log('\n3. Chấm 0% vẫn ghi bút toán delta = 0');
    const dealZero = await seedDeal('77777777-7777-4777-8777-7777777a0002', 30);
    const awardZero = await ledger.appendByRule({
      userId: GiverId,
      ruleCode: 'GIFT_COMPLETED',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: dealZero,
      idempotencyKey: `GIFT_COMPLETED:${dealZero}`,
      actor: ReceiverId,
      source: 'REVIEW',
      multiplierPercent: 0,
    });
    check('ghi được, applied = true', awardZero.applied === true);
    check('delta = 0', awardZero.delta === 0, `delta=${awardZero.delta}`);

    console.log('\n4. Khoá chống trùng chặn cả hai đường');
    const again = await ledger.appendByRule({
      userId: GiverId,
      ruleCode: 'GIFT_COMPLETED',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: dealA,
      idempotencyKey: `GIFT_COMPLETED:${dealA}`,
      actor: 'SYSTEM',
      source: 'GRACE_EXPIRED',
      multiplierPercent: 80,
    });
    check(
      'job không trả thêm cho lượt đánh giá đã trả',
      again.applied === false,
      `applied=${again.applied}`,
    );
    check(
      'và trả về đúng delta cũ, không phải delta mới',
      again.delta === 50,
      `delta=${again.delta}`,
    );
    const [{ count: entryCount }] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM point_ledger WHERE idempotency_key = $1`,
      [`GIFT_COMPLETED:${dealA}`],
    );
    check('chỉ MỘT bút toán trong sổ', Number(entryCount) === 1);

    console.log('\n5. findUnreviewedCompletions lọc đúng');
    // Lượt quá hạn, chưa đánh giá, chưa trả thưởng → PHẢI có trong danh sách.
    const dealDue = await seedDeal('77777777-7777-4777-8777-7777777a0003', 30);
    // Lượt mới hoàn tất hôm nay → CHƯA tới hạn.
    const dealFresh = await seedDeal('77777777-7777-4777-8777-7777777a0004', 1);
    // Lượt quá hạn nhưng NGƯỜI TẶNG đã đánh giá người nhận → vẫn phải có, vì
    // đánh giá của người tặng không nói gì về chất lượng món quà.
    const dealGiverOnly = await seedDeal(
      '77777777-7777-4777-8777-7777777a0005',
      30,
    );
    await dataSource.query(
      `INSERT INTO transaction_reviews
         (global_id, transaction_id, reviewer_id, reviewee_id, reviewer_role, rating, accuracy_percent)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GIVER', 5, NULL)`,
      [dealGiverOnly, GiverId, ReceiverId],
    );
    // Lượt quá hạn và NGƯỜI NHẬN đã đánh giá → KHÔNG được có.
    const dealReviewed = await seedDeal(
      '77777777-7777-4777-8777-7777777a0006',
      30,
    );
    await dataSource.query(
      `INSERT INTO transaction_reviews
         (global_id, transaction_id, reviewer_id, reviewee_id, reviewer_role, rating, accuracy_percent)
       VALUES (gen_random_uuid(), $1, $2, $3, 'RECEIVER', 5, 95)`,
      [dealReviewed, ReceiverId, GiverId],
    );

    const due = await reviews.findUnreviewedCompletions({
      graceDays: 7,
      limit: 100,
    });
    const dueIds = new Set(due.map((row) => row.transactionId));

    check('lượt quá hạn chưa đánh giá có trong danh sách', dueIds.has(dealDue));
    check('lượt mới hoàn tất KHÔNG có', !dueIds.has(dealFresh));
    check(
      'lượt chỉ người TẶNG đánh giá VẪN có — đánh giá đó không nói về món quà',
      dueIds.has(dealGiverOnly),
    );
    check(
      'lượt người NHẬN đã đánh giá KHÔNG có',
      !dueIds.has(dealReviewed),
      dueIds.has(dealReviewed) ? 'bị lọt' : '',
    );
    check(
      'lượt đã có bút toán KHÔNG có — kể cả khi chấm 0%',
      !dueIds.has(dealZero) && !dueIds.has(dealA),
    );
    check(
      'trả kèm giver_id để job biết cộng cho ai',
      due.every((row) => row.giverId === GiverId),
      due.map((row) => row.giverId).join(', '),
    );

    console.log('\n6. Khoản phạt không nhận hệ số nhân');
    let rejectedPenaltyScaling = false;
    try {
      await ledger.appendByRule({
        userId: GiverId,
        ruleCode: 'SHIP_UNPAID_PENALTY',
        referenceType: 'GIFT_TRANSACTION',
        referenceId: dealDue,
        idempotencyKey: `PENALTY_SCALE_TEST:${dealDue}`,
        actor: 'SYSTEM',
        source: 'TEST',
        multiplierPercent: 60,
      });
    } catch {
      rejectedPenaltyScaling = true;
    }
    check(
      'từ chối nhân hệ số vào khoản phạt',
      rejectedPenaltyScaling,
      rejectedPenaltyScaling ? '' : 'đã cho qua — mở đường giảm nhẹ hình phạt',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Thưởng lượt trao: nhân đúng, làm tròn đúng, hai đường không trả trùng'
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
