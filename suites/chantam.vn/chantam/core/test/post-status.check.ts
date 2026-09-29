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
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
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

  /** Số món còn lại trong kho của bài — xin nhận không được trừ vào đây. */
  async function remainingQuantity(postId = PostId): Promise<number> {
    const [row] = await dataSource.query<{ remaining_quantity: string }[]>(
      `SELECT remaining_quantity FROM posts WHERE global_id = $1`,
      [postId],
    );
    return Number(row.remaining_quantity);
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

    // Luồng XIN NHẬN là đường sống duy nhất tạo ra một lượt trao kể từ 28/09:
    // `request()`/`accept()` trên repository lượt trao đã bị gỡ vì
    // `POST /transactions` là cửa sau bỏ qua mọi hàng rào mà luồng xin nhận áp.
    // Phép kiểm này vì thế lái bằng `acceptRequest`, không dựng trạng thái bằng
    // SQL — nó đang đo chính phản ứng của trạng thái BÀI trước từng bước đó.
    const requests = new GiftRequestRepository(
      entities.GiftRequestEntity as never,
      dataSource.manager,
      {
        openRoomWithinTransaction: async () => undefined,
        lockRoomWithinTransaction: async () => undefined,
      } as never,
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

    /**
     * Ghi một lượt xin đang chờ duyệt, trả về id của nó.
     *
     * Mỗi lượt một NGƯỜI XIN MỚI: `UQ_gift_requests_post_requester` là unique một
     * phần trên `(post_id, requester_id) WHERE deleted_at IS NULL`, tức một người
     * chỉ xin một bài đúng một lần. Dùng lại người cũ là phép kiểm tự đâm vào
     * ràng buộc nghiệp vụ chứ không đo được gì.
     */
    let requesterSequence = 0;
    async function seedRequest(
      postId: string = PostId,
    ): Promise<{ requestId: string; requesterId: string }> {
      requesterSequence += 1;
      const requesterId = `99999999-9999-4999-8999-9999999d${String(
        requesterSequence,
      ).padStart(4, '0')}`;
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')
         ON CONFLICT DO NOTHING`,
        [requesterId, `nguoixin_${requesterSequence}`],
      );

      const [{ global_id }] = await dataSource.query<{ global_id: string }[]>(
        `INSERT INTO gift_requests (global_id, post_id, requester_id, message, status)
         VALUES (gen_random_uuid(), $1, $2, 'Xin nhận cho bài kiểm tra', 'PENDING')
         RETURNING global_id`,
        [postId, requesterId],
      );
      return { requestId: global_id, requesterId };
    }

    const requestOne = await seedRequest();
    check(
      'có người xin nhưng chưa duyệt thì VẪN PUBLISHED — xin chưa trừ kho',
      (await postStatus()) === 'PUBLISHED',
      await postStatus(),
    );
    check(
      'và kho chưa bị trừ',
      (await remainingQuantity()) === 2,
      String(await remainingQuantity()),
    );

    await requests.acceptRequest({
      requestId: requestOne.requestId,
      postId: PostId,
      giverId: GiverId,
      transactionId: TransactionOneId,
    });
    check(
      'duyệt một món, còn một món thì vẫn PUBLISHED',
      (await postStatus()) === 'PUBLISHED',
      await postStatus(),
    );

    const requestTwo = await seedRequest();
    await requests.acceptRequest({
      requestId: requestTwo.requestId,
      postId: PostId,
      giverId: GiverId,
      transactionId: TransactionTwoId,
    });
    // `acceptRequest` ghi `DELIVERING`, còn `syncPostStatus` quy về `RESERVED`.
    // Hai tên cho MỘT trạng thái "kho đã cạn, lượt trao đang chạy", và mọi chỗ
    // đọc đều phải kiểm cả hai. Phép kiểm này đo Ý NGHĨA, không đo tên; việc chọn
    // một tên rồi bỏ tên kia đã ghi ở `21-open-issues.md`.
    check(
      'duyệt nốt món cuối thì bài bị khoá kho (RESERVED/DELIVERING)',
      ['RESERVED', 'DELIVERING'].includes(await postStatus()),
      await postStatus(),
    );
    check(
      'bài bị khoá kho vẫn ăn quota — tác giả còn một nghĩa vụ chưa xong',
      (await quotaUsed()) === 1,
    );

    await transactions.confirmReceipt(TransactionOneId, requestOne.requesterId);
    check(
      'một người đã nhận, người kia chưa thì bài vẫn bị khoá kho',
      ['RESERVED', 'DELIVERING'].includes(await postStatus()),
      await postStatus(),
    );

    await transactions.confirmReceipt(TransactionTwoId, requestTwo.requesterId);
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
    const requestCancel = await seedRequest();
    await requests.acceptRequest({
      requestId: requestCancel.requestId,
      postId: PostId,
      giverId: GiverId,
      transactionId: cancelId,
    });
    check(
      'duyệt xong, hết hàng → bài bị khoá kho',
      ['RESERVED', 'DELIVERING'].includes(await postStatus()),
      await postStatus(),
    );

    await transactions.close({
      transactionId: cancelId,
      actorUserId: requestCancel.requesterId,
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
    await requests.acceptRequest({
      requestId: (await seedRequest(ExpiredPostId)).requestId,
      postId: ExpiredPostId,
      giverId: GiverId,
      transactionId: ExpiredTransactionId,
    });

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

    const lastId = '55555555-5555-4555-8555-55555555c006';
    // Lượt xin bỏ quên nay là một dòng `gift_requests` đang PENDING. Trạng thái
    // `gift_transactions.REQUESTED` đã bị gỡ ngày 28/09: một lượt trao chỉ tồn
    // tại sau khi đã duyệt, còn "đang xin" thuộc về bảng lượt xin.
    const strayRequest = await seedRequest();
    const requestLast = await seedRequest();
    await requests.acceptRequest({
      requestId: requestLast.requestId,
      postId: PostId,
      giverId: GiverId,
      transactionId: lastId,
    });
    await transactions.confirmReceipt(lastId, requestLast.requesterId);
    check(
      'một lượt XIN bỏ quên KHÔNG giữ bài ở RESERVED mãi',
      (await postStatus()) === 'COMPLETED',
      await postStatus(),
    );
    const [stray] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM gift_requests WHERE global_id = $1`,
      [strayRequest.requestId],
    );
    check(
      'và lượt xin bỏ quên đó đã được đóng lại, không treo mãi',
      stray?.status !== 'PENDING',
      `status=${stray?.status}`,
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
