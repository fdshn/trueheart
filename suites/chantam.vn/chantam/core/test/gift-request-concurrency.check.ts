/**
 * Chạy hai luồng duyệt THẬT song song trên database thật.
 *
 * Vì sao cần script riêng: ba lỗi vừa sửa đều là lỗi ĐỒNG THỜI. Unit test mock
 * `query` nên chỉ kiểm được trình tự câu lệnh, còn CI chạy smoke test tuần tự
 * nên hai lượt duyệt không bao giờ gặp nhau. Cả hai đều xanh kể cả khi khoá sai.
 *
 * Ở đây mỗi luồng chạy trên một kết nối riêng của pool, nên chúng thật sự tranh
 * nhau khoá hàng trong Postgres.
 *
 *   npm run test:concurrency
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import { GiftRequestEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_concurrency_check';
const Rounds = 25;

const GiverId = '99999999-9999-4999-8999-999999999901';
const PostId = '88888888-8888-4888-8888-888888888801';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function requesterId(index: number): string {
  return `77777777-7777-4777-8777-7777777777${String(index).padStart(2, '0')}`;
}

/** Nhóm cuối của UUID phải đúng 12 ký tự hex, nên phải đệm cho đủ. */
function suffix(prefix: string, round: number, index: number): string {
  return `${prefix}${String(round).padStart(4, '0')}${String(index).padStart(2, '0')}`.padEnd(
    12,
    '0',
  );
}

function requestId(round: number, index: number): string {
  return `66666666-6666-4666-8666-${suffix('66', round, index)}`;
}

/** Postgres huỷ một bên của chờ vòng tròn với mã 40P01. */
function isDeadlock(error: unknown): boolean {
  const code = (error as { code?: string; driverError?: { code?: string } })
    ?.code;
  const driverCode = (error as { driverError?: { code?: string } })?.driverError
    ?.code;
  return code === '40P01' || driverCode === '40P01';
}

async function seedRound(
  dataSource: DataSource,
  round: number,
  stock: number,
  requesters: number,
): Promise<void> {
  await dataSource.query(
    `UPDATE posts SET remaining_quantity = $1, total_quantity = $1, status = 'PUBLISHED' WHERE global_id = $2`,
    [stock, PostId],
  );
  await dataSource.query(`DELETE FROM gift_transactions WHERE post_id = $1`, [
    PostId,
  ]);
  await dataSource.query(`DELETE FROM gift_requests WHERE post_id = $1`, [
    PostId,
  ]);

  for (let index = 0; index < requesters; index += 1)
    await dataSource.query(
      `INSERT INTO gift_requests
         (global_id, post_id, requester_id, message, status, queue_joined_at)
       VALUES ($1, $2, $3, 'Em xin món này ạ', 'PENDING', now())`,
      [requestId(round, index), PostId, requesterId(index)],
    );
}

async function remainingQuantity(dataSource: DataSource): Promise<number> {
  const [row] = await dataSource.query<{ remaining_quantity: number }[]>(
    `SELECT remaining_quantity FROM posts WHERE global_id = $1`,
    [PostId],
  );
  return Number(row.remaining_quantity);
}

async function countBy(dataSource: DataSource, sql: string): Promise<number> {
  const [row] = await dataSource.query<{ count: string }[]>(sql, [PostId]);
  return Number(row.count);
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);
  await admin.destroy();

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
    // Nhiều kết nối là điều kiện cần để hai transaction thật sự chạy song song.
    extra: { max: 10 },
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    // Người tặng và bốn người xin. `gift_requests` không có FK sang users,
    // nhưng `gift_transactions` thì có, nên phải tạo thật.
    for (const [index, userId] of [
      GiverId,
      requesterId(0),
      requesterId(1),
      requesterId(2),
      requesterId(3),
    ].entries())
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE') ON CONFLICT DO NOTHING`,
        [userId, `nguoidung${index}`],
      );

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, '30000000-0000-4000-8000-000000000001',
               'Bài kiểm tra đồng thời', 'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)
       ON CONFLICT DO NOTHING`,
      [PostId, GiverId],
    );

    const giftRequests = new GiftRequestRepository(
      GiftRequestEntity as never,
      dataSource.manager,
    );
    const giftTransactions = new GiftTransactionRepository(dataSource.manager);

    console.log(`Kiểm chứng (${Rounds} vòng mỗi kịch bản):\n`);

    // ── 1. Hai lượt duyệt tranh nhau món cuối cùng ──────────────────────────
    let oversold = 0;
    let doubleAccepted = 0;
    let deadlocks = 0;

    for (let round = 0; round < Rounds; round += 1) {
      await seedRound(dataSource, round, 1, 2);

      const results = await Promise.allSettled([
        giftRequests.acceptRequest({
          requestId: requestId(round, 0),
          postId: PostId,
          giverId: GiverId,
          transactionId: `55555555-5555-4555-8555-${suffix('55', round, 0)}`,
        }),
        giftRequests.acceptRequest({
          requestId: requestId(round, 1),
          postId: PostId,
          giverId: GiverId,
          transactionId: `55555555-5555-4555-8555-${suffix('55', round, 1)}`,
        }),
      ]);

      deadlocks += results.filter(
        (result) => result.status === 'rejected' && isDeadlock(result.reason),
      ).length;

      const remaining = await remainingQuantity(dataSource);
      if (remaining < 0) oversold += 1;

      const accepted = await countBy(
        dataSource,
        `SELECT COUNT(*) AS count FROM gift_requests WHERE post_id = $1 AND status = 'ACCEPTED'`,
      );
      if (accepted > 1) doubleAccepted += 1;
    }

    check(
      'tồn kho không bao giờ âm khi hai người cùng được duyệt',
      oversold === 0,
      `${oversold}/${Rounds} vòng bị âm`,
    );
    check(
      'chỉ MỘT yêu cầu được duyệt khi chỉ còn một món',
      doubleAccepted === 0,
      `${doubleAccepted}/${Rounds} vòng duyệt quá số lượng`,
    );

    // ── 2. Hai luồng duyệt KHÁC NHAU chạy chéo — chỗ từng khoá ngược ────────
    let crossDeadlocks = 0;
    let doubleDecrement = 0;

    for (let round = 0; round < Rounds; round += 1) {
      await seedRound(dataSource, round, 2, 1);

      // Luồng cũ tạo sẵn một lượt REQUESTED cho chính người xin đó.
      const legacyTransactionId = `44444444-4444-4444-8444-${suffix('44', round, 0)}`;
      await dataSource.query(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, quantity, status)
         VALUES ($1, $2, $3, $4, 1, 'REQUESTED')`,
        [legacyTransactionId, PostId, GiverId, requesterId(0)],
      );

      const results = await Promise.allSettled([
        giftRequests.acceptRequest({
          requestId: requestId(round, 0),
          postId: PostId,
          giverId: GiverId,
          transactionId: `55555555-5555-4555-8555-${suffix('56', round, 0)}`,
        }),
        giftTransactions.accept(legacyTransactionId, GiverId),
      ]);

      crossDeadlocks += results.filter(
        (result) => result.status === 'rejected' && isDeadlock(result.reason),
      ).length;

      // Một lượt bàn giao cho cùng một người: tồn kho chỉ được trừ MỘT lần,
      // nên từ 2 phải còn đúng 1.
      const remaining = await remainingQuantity(dataSource);
      if (remaining < 1) doubleDecrement += 1;
    }

    check(
      'hai luồng duyệt chạy chéo không gây deadlock',
      crossDeadlocks === 0,
      `${crossDeadlocks} lần gặp 40P01`,
    );
    check(
      'một lượt bàn giao chỉ trừ tồn kho MỘT lần',
      doubleDecrement === 0,
      `${doubleDecrement}/${Rounds} vòng bị trừ hai lần`,
    );

    // ── 3. Rút và duyệt tranh nhau cùng một yêu cầu ─────────────────────────
    let ghostState = 0;

    for (let round = 0; round < Rounds; round += 1) {
      await seedRound(dataSource, round, 1, 1);

      await Promise.allSettled([
        giftRequests.acceptRequest({
          requestId: requestId(round, 0),
          postId: PostId,
          giverId: GiverId,
          transactionId: `55555555-5555-4555-8555-${suffix('57', round, 0)}`,
        }),
        giftRequests.withdrawIfPending(PostId, requesterId(0)),
      ]);

      // Trạng thái ma: yêu cầu ghi là WITHDRAWN nhưng vẫn có giao dịch đang
      // sống — đúng thứ mà đọc-rồi-ghi để lại.
      const withdrawnButLive = await countBy(
        dataSource,
        `SELECT COUNT(*) AS count
         FROM gift_requests r
         JOIN gift_transactions t
           ON t.post_id = r.post_id AND t.receiver_id = r.requester_id
         WHERE r.post_id = $1
           AND r.status = 'WITHDRAWN'
           AND t.status IN ('ACCEPTED', 'DELIVERING')`,
      );
      if (withdrawnButLive > 0) ghostState += 1;
    }

    check(
      'không có yêu cầu WITHDRAWN nào còn giao dịch đang sống',
      ghostState === 0,
      `${ghostState}/${Rounds} vòng để lại trạng thái ma`,
    );

    check(
      'không có deadlock nào ở kịch bản tranh món cuối',
      deadlocks === 0,
      `${deadlocks} lần gặp 40P01`,
    );
  } finally {
    await dataSource.destroy();
    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
    console.log(`\nĐã xoá database nháp ${ScratchDatabase}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} kiểm chứng THẤT BẠI:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('\nHai luồng song song không giẫm lên nhau.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
