/**
 * Kiểm vòng đời TRẠNG THÁI BÀI theo lượt trao, trên Postgres THẬT.
 *
 * Vì sao cần script riêng: `syncPostStatus` là một câu `UPDATE ... CASE` có
 * `EXISTS` lồng bên trong và so enum với `text[]`. Unit test mock `query` nên
 * không chạm tới nó. Và thứ cần chứng minh là một chuỗi trạng thái đi qua nhiều
 * lượt trao — chỉ dữ liệu thật mới dựng lại được.
 *
 * Lỗi mà script này canh: trước khi sửa, `accept()` trừ tồn kho nhưng không đổi
 * trạng thái bài, nên bài đứng mãi ở `PUBLISHED` và **ăn một suất quota đăng bài
 * của tác giả vĩnh viễn**. Người càng tặng nhiều càng sớm hết chỗ đăng bài.
 *
 *   npm run test:post-status
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { QuotaStatuses } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_post_status_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const GiverId = '99999999-9999-4999-8999-99999999c001';
const ReceiverOneId = '99999999-9999-4999-8999-99999999c002';
const ReceiverTwoId = '99999999-9999-4999-8999-99999999c003';

const PostId = '88888888-8888-4888-8888-88888888c001';
const ExpiredPostId = '88888888-8888-4888-8888-88888888c002';
const TransactionOneId = '55555555-5555-4555-8555-55555555c001';
const TransactionTwoId = '55555555-5555-4555-8555-55555555c002';
const ExpiredTransactionId = '55555555-5555-4555-8555-55555555c003';

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

  async function postStatus(postId = PostId): Promise<string> {
    const [row] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM posts WHERE global_id = $1`,
      [postId],
    );
    return row.status;
  }

  /** Số bài đang ăn quota đăng bài của tác giả — cùng định nghĩa với chỗ chặn. */
  async function quotaUsed(): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM posts
       WHERE author_id = $1 AND deleted_at IS NULL
         AND status::text = ANY($2::text[])`,
      [GiverId, QuotaStatuses],
    );
    return Number(row.count);
  }

  try {
    const users: [string, string][] = [
      [GiverId, 'nguoitang_baidang'],
      [ReceiverOneId, 'nguoinhan_mot'],
      [ReceiverTwoId, 'nguoinhan_hai'],
    ];
    for (const [id, username] of users)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    // Bài hai món: đủ để thấy trạng thái đi qua từng bước, không nhảy thẳng.
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm vòng đời trạng thái',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 2, 2, '{}'::jsonb, 0)`,
      [PostId, GiverId, CategoryId],
    );

    const transactions = new GiftTransactionRepository(
      dataSource.manager,
      new ChatRepository(
        dataSource.manager,
        new AdminConfigRepository(dataSource.manager),
      ),
      new PointLedgerRepository(dataSource.manager),
    );

    console.log('Bài hai món, tặng dần:\n');

    check('mới đăng thì PUBLISHED', (await postStatus()) === 'PUBLISHED');
    check('và ăn một suất quota', (await quotaUsed()) === 1);

    await transactions.request({
      globalId: TransactionOneId,
      postId: PostId,
      receiverId: ReceiverOneId,
      quantity: 1,
    });
    check(
      'có người xin nhưng chưa duyệt thì VẪN PUBLISHED — xin chưa trừ kho',
      (await postStatus()) === 'PUBLISHED',
      await postStatus(),
    );

    await transactions.accept(TransactionOneId, GiverId);
    check(
      'duyệt một món, còn một món thì vẫn PUBLISHED',
      (await postStatus()) === 'PUBLISHED',
      await postStatus(),
    );

    await transactions.request({
      globalId: TransactionTwoId,
      postId: PostId,
      receiverId: ReceiverTwoId,
      quantity: 1,
    });
    await transactions.accept(TransactionTwoId, GiverId);
    check(
      'duyệt nốt món cuối thì bài sang RESERVED',
      (await postStatus()) === 'RESERVED',
      await postStatus(),
    );
    check(
      'RESERVED vẫn ăn quota — tác giả còn một nghĩa vụ chưa xong',
      (await quotaUsed()) === 1,
    );

    await transactions.confirmReceipt(TransactionOneId, ReceiverOneId);
    check(
      'một người đã nhận, người kia chưa thì bài vẫn RESERVED',
      (await postStatus()) === 'RESERVED',
      await postStatus(),
    );

    await transactions.confirmReceipt(TransactionTwoId, ReceiverTwoId);
    check(
      'người cuối nhận xong thì bài COMPLETED',
      (await postStatus()) === 'COMPLETED',
      await postStatus(),
    );
    check(
      'và quota được TRẢ LẠI — đây chính là lỗi cũ: bài tặng xong vẫn chiếm chỗ mãi',
      (await quotaUsed()) === 0,
      `${await quotaUsed()} bài còn ăn quota`,
    );
    check(
      'bài COMPLETED biến khỏi bảng tin và bản đồ',
      !['PUBLISHED', 'RESERVED'].includes(await postStatus()),
    );

    // ── Huỷ thì bài phải hiện lại ───────────────────────────────────────────
    console.log('\nHuỷ lượt trao:\n');

    await dataSource.query(
      `UPDATE posts SET status = 'PUBLISHED', remaining_quantity = 1
       WHERE global_id = $1`,
      [PostId],
    );
    const cancelId = '55555555-5555-4555-8555-55555555c004';
    await transactions.request({
      globalId: cancelId,
      postId: PostId,
      receiverId: ReceiverOneId,
      quantity: 1,
    });
    await transactions.accept(cancelId, GiverId);
    check(
      'duyệt xong, hết hàng → RESERVED',
      (await postStatus()) === 'RESERVED',
    );

    await transactions.close({
      transactionId: cancelId,
      actorUserId: ReceiverOneId,
      status: 'CANCELLED',
      reason: 'Không nhận được nữa',
    });
    check(
      'huỷ thì bài VỀ LẠI PUBLISHED để người khác xin được',
      (await postStatus()) === 'PUBLISHED',
      await postStatus(),
    );
    check(
      'tồn kho cũng được trả',
      Number(
        (
          await dataSource.query<{ remaining_quantity: string }[]>(
            `SELECT remaining_quantity FROM posts WHERE global_id = $1`,
            [PostId],
          )
        )[0].remaining_quantity,
      ) === 1,
    );

    // ── Không được hồi sinh bài đã hết hạn ──────────────────────────────────
    console.log('\nBài ở trạng thái khác:\n');

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài sẽ hết hạn giữa chừng',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [ExpiredPostId, GiverId, CategoryId],
    );
    await transactions.request({
      globalId: ExpiredTransactionId,
      postId: ExpiredPostId,
      receiverId: ReceiverTwoId,
      quantity: 1,
    });
    await transactions.accept(ExpiredTransactionId, GiverId);

    // Giả lập bài bị chuyển sang một trạng thái ngoài vòng đời lượt trao.
    await dataSource.query(
      `UPDATE posts SET status = 'ARCHIVED' WHERE global_id = $1`,
      [ExpiredPostId],
    );
    await transactions.close({
      transactionId: ExpiredTransactionId,
      actorUserId: GiverId,
      status: 'CANCELLED',
      reason: 'Đã chuyển kho từ thiện',
    });
    check(
      'huỷ KHÔNG hồi sinh bài đã ARCHIVED thành PUBLISHED',
      (await postStatus(ExpiredPostId)) === 'ARCHIVED',
      await postStatus(ExpiredPostId),
    );

    // ── Yêu cầu bỏ quên không được giữ bài mãi ──────────────────────────────
    console.log('\nYêu cầu chưa duyệt bị bỏ quên:\n');

    const strayId = '55555555-5555-4555-8555-55555555c005';
    const lastId = '55555555-5555-4555-8555-55555555c006';
    await transactions.request({
      globalId: strayId,
      postId: PostId,
      receiverId: ReceiverTwoId,
      quantity: 1,
    });
    await transactions.request({
      globalId: lastId,
      postId: PostId,
      receiverId: ReceiverOneId,
      quantity: 1,
    });
    await transactions.accept(lastId, GiverId);
    await transactions.confirmReceipt(lastId, ReceiverOneId);
    check(
      'một REQUESTED bỏ quên KHÔNG giữ bài ở RESERVED mãi',
      (await postStatus()) === 'COMPLETED',
      await postStatus(),
    );
    check(
      'quota vẫn được trả dù còn yêu cầu treo',
      (await quotaUsed()) === 0,
      `${await quotaUsed()} bài còn ăn quota`,
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
  console.log('\nTrạng thái bài bám đúng tồn kho và các lượt trao đang mở.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
