/**
 * Kiểm vòng đời yêu cầu xin nhận trên Postgres THẬT.
 *
 * Bốn câu SQL mới, và cả bốn chỉ sai ở đây — unit test mock `query` nên một
 * câu sai cú pháp lọt tới tận prod:
 *
 *   1. **`listByRequester`** — JOIN LATERAL lấy ảnh đầu, `COUNT(*) OVER ()`
 *      đếm trước khi cắt trang.
 *   2. **`closeOpenForPosts`** — `UPDATE ... FROM posts ... RETURNING` đi qua
 *      `updateReturning`, vì TypeORM bọc kết quả UPDATE thành `[rows, affected]`.
 *   3. **`rejectIfOpen`** — chỉ đụng PENDING/STANDBY, KHÔNG đụng ACCEPTED.
 *   4. **`countOpenByRequester`** — sau khi thêm JOIN sang `posts`, yêu cầu treo
 *      dưới bài đã đóng không còn ăn suất trong trần. Đây là lỗi khiến một
 *      người xin năm món mà cả năm bài hết hạn sẽ bị khoá VĨNH VIỄN.
 *
 *   npm run test:request-lifecycle
 */
import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_request_lifecycle_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const OwnerId = '99999999-9999-4999-8999-9999999f1001';
const AliceId = '99999999-9999-4999-8999-9999999f1002';
const BobId = '99999999-9999-4999-8999-9999999f1003';
// Nguoi thu tu: chi muc duy nhat la (post_id, requester_id), nen mot nguoi khong
// the vua co yeu cau bi tu choi vua co yeu cau da duyet tren cung mot bai.
const CarolId = '99999999-9999-4999-8999-9999999f1004';
const OpenPostId = '88888888-8888-4888-8888-8888888f1001';
const ExpiredPostId = '88888888-8888-4888-8888-8888888f1002';

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

  const requests = new GiftRequestRepository(
    entities.GiftRequestEntity as never,
    dataSource.manager,
    {
      openRoomWithinTransaction: async () => undefined,
      lockRoomWithinTransaction: async () => undefined,
    } as never,
  );

  async function insertRequest(
    globalId: string,
    postId: string,
    requesterId: string,
    status: GiftRequestStatuses,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO gift_requests
         (global_id, post_id, requester_id, message, status, queue_joined_at)
       VALUES ($1, $2, $3, 'Em xin ạ', $4, now())`,
      [globalId, postId, requesterId, status],
    );
  }

  async function statusOf(globalId: string): Promise<string> {
    const [row] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM gift_requests WHERE global_id = $1`,
      [globalId],
    );
    return row.status;
  }

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'chubai_yc', 'x', 'MEMBER', 'ACTIVE'),
              ($2, 'alice_yc', 'x', 'MEMBER', 'ACTIVE'),
              ($3, 'bob_yc', 'x', 'MEMBER', 'ACTIVE'),
              ($4, 'carol_yc', 'x', 'MEMBER', 'ACTIVE')`,
      [OwnerId, AliceId, BobId, CarolId],
    );

    for (const [postId, title, status] of [
      [OpenPostId, 'Tặng nồi cơm điện', GiftPostStatuses.PUBLISHED],
      [ExpiredPostId, 'Tặng xe đạp cũ', GiftPostStatuses.EXPIRED],
    ] as [string, string, GiftPostStatuses][])
      await dataSource.query(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count)
         VALUES ($1, 'OFFER', $2, $3, $4, 'Mô tả đủ dài cho bài kiểm tra',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', $5, 1, 1, '{}'::jsonb, 0)`,
        [postId, OwnerId, CategoryId, title, status],
      );

    await dataSource.query(
      `INSERT INTO post_media (post_id, r2_key, sort_order)
       VALUES ($1, 'users/o/posts/p/media/first.webp', 0),
              ($1, 'users/o/posts/p/media/second.webp', 1)`,
      [OpenPostId],
    );

    // ── 1. Danh sách yêu cầu của tôi ────────────────────────────────────────
    console.log('Yêu cầu của tôi:\n');

    const openRequest = '77777777-7777-4777-8777-7777777f1001';
    const strandedRequest = '77777777-7777-4777-8777-7777777f1002';
    await insertRequest(
      openRequest,
      OpenPostId,
      AliceId,
      GiftRequestStatuses.PENDING,
    );
    await insertRequest(
      strandedRequest,
      ExpiredPostId,
      AliceId,
      GiftRequestStatuses.PENDING,
    );

    const mine = await requests.listByRequester({
      requesterId: AliceId,
      skip: 0,
      take: 20,
    });
    check('trả đủ cả hai yêu cầu', mine.items.length === 2, `${mine.items.length}`);
    check('và total đếm đúng', mine.total === 2, `${mine.total}`);

    const onOpenPost = mine.items.find(
      (item) => item.request.postId === OpenPostId,
    );
    check(
      'kèm tiêu đề bài ngay trên dòng',
      onOpenPost?.postTitle === 'Tặng nồi cơm điện',
      String(onOpenPost?.postTitle),
    );
    check(
      'kèm ĐÚNG ảnh đầu tiên, không phải một ảnh bất kỳ',
      onOpenPost?.postThumbnailKey === 'users/o/posts/p/media/first.webp',
      String(onOpenPost?.postThumbnailKey),
    );

    const onExpiredPost = mine.items.find(
      (item) => item.request.postId === ExpiredPostId,
    );
    check(
      'yêu cầu treo dưới bài đã hết hạn VẪN hiện ra — đây là cái người dùng cần tìm để rút',
      onExpiredPost?.postStatus === GiftPostStatuses.EXPIRED,
      String(onExpiredPost?.postStatus),
    );

    const paged = await requests.listByRequester({
      requesterId: AliceId,
      skip: 0,
      take: 1,
    });
    check(
      'cắt trang một dòng mà total vẫn là số thật',
      paged.items.length === 1 && paged.total === 2,
      `${paged.items.length} dòng / total=${paged.total}`,
    );

    const filtered = await requests.listByRequester({
      requesterId: AliceId,
      status: GiftRequestStatuses.STANDBY,
      skip: 0,
      take: 20,
    });
    check('lọc theo trạng thái chạy được', filtered.items.length === 0);

    // ── 2. Trần yêu cầu đang mở không đếm bài đã đóng ───────────────────────
    console.log('\nTrần yêu cầu đang mở:\n');

    const openCount = await requests.countOpenByRequester(AliceId);
    check(
      'chỉ đếm yêu cầu dưới bài CÒN MỞ — bài hết hạn không ăn suất nữa',
      openCount === 1,
      `${openCount} (có 2 yêu cầu, 1 dưới bài EXPIRED)`,
    );

    // ── 3. Từ chối một yêu cầu ──────────────────────────────────────────────
    console.log('\nChủ bài từ chối:\n');

    const bobRequest = '77777777-7777-4777-8777-7777777f1003';
    await insertRequest(
      bobRequest,
      OpenPostId,
      BobId,
      GiftRequestStatuses.PENDING,
    );

    const rejected = await requests.rejectIfOpen({
      postId: OpenPostId,
      requestId: bobRequest,
    });
    check(
      'PENDING chuyển sang REJECTED',
      rejected?.status === GiftRequestStatuses.REJECTED,
      String(rejected?.status),
    );
    check(
      'và ghi xuống database thật, không chỉ trong object trả về',
      (await statusOf(bobRequest)) === GiftRequestStatuses.REJECTED,
    );

    const twice = await requests.rejectIfOpen({
      postId: OpenPostId,
      requestId: bobRequest,
    });
    check('từ chối lần nữa trả null, không ghi đè gì', twice === null);

    const acceptedRequest = '77777777-7777-4777-8777-7777777f1004';
    await insertRequest(
      acceptedRequest,
      OpenPostId,
      CarolId,
      GiftRequestStatuses.ACCEPTED,
    );
    const acceptedReject = await requests.rejectIfOpen({
      postId: OpenPostId,
      requestId: acceptedRequest,
    });
    check(
      'yêu cầu đã ACCEPTED KHÔNG từ chối được ở đây',
      acceptedReject === null &&
        (await statusOf(acceptedRequest)) === GiftRequestStatuses.ACCEPTED,
      await statusOf(acceptedRequest),
    );

    // ── 4. Đóng yêu cầu treo khi bài đóng lại ───────────────────────────────
    console.log('\nĐóng yêu cầu treo:\n');

    const standbyRequest = '77777777-7777-4777-8777-7777777f1005';
    await insertRequest(
      standbyRequest,
      ExpiredPostId,
      BobId,
      GiftRequestStatuses.STANDBY,
    );

    const closed = await requests.closeOpenForPosts({
      postIds: [ExpiredPostId],
      status: GiftRequestStatuses.CANCELLED,
    });
    check(
      'đóng cả PENDING lẫn STANDBY của bài đó',
      closed.length === 2,
      `${closed.length} dòng`,
    );
    check(
      'và trả kèm TIÊU ĐỀ BÀI để còn báo cho người xin',
      closed.every((row) => row.postTitle === 'Tặng xe đạp cũ'),
      closed.map((row) => row.postTitle).join(' | '),
    );
    check(
      'ghi xuống database thật',
      (await statusOf(strandedRequest)) === GiftRequestStatuses.CANCELLED &&
        (await statusOf(standbyRequest)) === GiftRequestStatuses.CANCELLED,
    );
    check(
      'KHÔNG đụng yêu cầu của bài khác',
      (await statusOf(openRequest)) === GiftRequestStatuses.PENDING,
      await statusOf(openRequest),
    );
    check(
      'và KHÔNG đụng yêu cầu đã ACCEPTED',
      (await statusOf(acceptedRequest)) === GiftRequestStatuses.ACCEPTED,
    );

    const again = await requests.closeOpenForPosts({
      postIds: [ExpiredPostId],
      status: GiftRequestStatuses.CANCELLED,
    });
    check('chạy lại không đóng thêm gì', again.length === 0);

    const empty = await requests.closeOpenForPosts({
      postIds: [],
      status: GiftRequestStatuses.CANCELLED,
    });
    check('danh sách bài rỗng thì không chạm database', empty.length === 0);
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
  console.log(
    '\nVòng đời yêu cầu: không còn yêu cầu treo, và trần không đếm bài đã đóng.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
