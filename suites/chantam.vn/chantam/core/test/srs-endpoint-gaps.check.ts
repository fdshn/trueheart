/**
 * Bốn endpoint vá lỗ SRS, kiểm trên Postgres THẬT.
 *
 * Năm thứ unit test mock `query` không thể thấy, vì tất cả nằm TRONG câu SQL hoặc
 * trong hành vi transaction:
 *
 * 1. Bộ lọc `isSos` của `findNearbyPosts` lọc đúng, và bỏ trống thì KHÔNG lọc.
 * 2. `acceptRequestsBatch` duyệt N người trong một transaction, trừ tồn kho MỘT
 *    lần, và quét `STANDBY` đúng một lần ở cuối.
 * 3. **Vòng lặp gọi `acceptRequest` thì KHÔNG làm được việc đó** — đây là lý do
 *    endpoint batch tồn tại, và là phép kiểm quan trọng nhất file này. Nó dựng
 *    đúng tình huống rồi đo cái hỏng.
 * 4. Hết suất giữa lô thì KHÔNG duyệt một phần nào cả — tồn kho và trạng thái
 *    yêu cầu phải y nguyên sau khi lô bị từ chối.
 * 5. Migration `1797000000000` dựng được `offering_post_id` kèm khoá ngoại
 *    `ON DELETE SET NULL`: xoá bài mang ra tặng thì yêu cầu CÒN, chỉ mất liên kết.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_srs_endpoints_check';

const CategoryId = 'c1000000-0000-4000-8000-00000000c001';
const GiverId = 'a1000000-0000-4000-8000-00000000a001';
const PlainPostId = 'b1000000-0000-4000-8000-00000000b001';
const SosPostId = 'b1000000-0000-4000-8000-00000000b002';
const BatchPostId = 'b1000000-0000-4000-8000-00000000b003';
const LoopPostId = 'b1000000-0000-4000-8000-00000000b004';
const ShortPostId = 'b1000000-0000-4000-8000-00000000b005';
const EvenPostId = 'b1000000-0000-4000-8000-00000000b008';
const WantedPostId = 'b1000000-0000-4000-8000-00000000b006';
const OfferingPostId = 'b1000000-0000-4000-8000-00000000b007';

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

  const posts = new PostRepository(
    entities.PostEntity as never,
    dataSource.manager,
  );
  // Phòng chat mở trong cùng transaction với lượt duyệt, nên repository cần một
  // `IChatRepository`. Ở đây chỉ cần nó ghi được hàng, không cần hành vi nào khác.
  const chat = {
    openRoomWithinTransaction: async (
      manager: { query: (sql: string, params: unknown[]) => Promise<unknown> },
      params: {
        globalId: string;
        transactionId: string;
        postId: string;
        giverId: string;
        receiverId: string;
      },
    ) => {
      await manager.query(
        `INSERT INTO chat_rooms (global_id, transaction_id, post_id, giver_id, receiver_id, status)
         VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
        [
          params.globalId,
          params.transactionId,
          params.postId,
          params.giverId,
          params.receiverId,
        ],
      );
    },
  };
  const requests = new GiftRequestRepository(
    entities.GiftRequestEntity as never,
    dataSource.manager,
    chat as never,
  );

  const addPost = async (
    id: string,
    options: { isSos?: boolean; quantity?: number; postType?: string } = {},
  ) => {
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count, is_sos)
       VALUES ($1, $2, $3, $4, 'Bài kiểm endpoint SRS',
               'Mô tả đủ dài cho bài kiểm bốn endpoint vá lỗ SRS',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', $5, $5, '{}'::jsonb, 0, $6)`,
      [
        id,
        options.postType ?? 'OFFER',
        GiverId,
        CategoryId,
        options.quantity ?? 1,
        options.isSos ?? false,
      ],
    );
  };

  let userSeq = 0;
  const addRequester = async () => {
    userSeq += 1;
    const id = `d1000000-0000-4000-8000-00000000d0${String(userSeq).padStart(2, '0')}`;
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
      [id, `nguoi-xin-${userSeq}`],
    );
    return id;
  };

  let requestSeq = 0;
  const addRequest = async (postId: string, requesterId: string) => {
    requestSeq += 1;
    const id = `e1000000-0000-4000-8000-00000000e0${String(requestSeq).padStart(2, '0')}`;
    await dataSource.query(
      `INSERT INTO gift_requests
         (global_id, post_id, requester_id, message, status, queue_joined_at)
       VALUES ($1, $2, $3, 'Mình xin món này', 'PENDING', now())`,
      [id, postId, requesterId],
    );
    return id;
  };

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'chu-bai-srs', 'x', 'MEMBER', 'ACTIVE')`,
      [GiverId],
    );
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, sort_order, is_active)
       VALUES ($1, 'Đồ điện tử', 'do-dien-tu', 1, true)`,
      [CategoryId],
    );

    // ── 1. Bộ lọc isSos ────────────────────────────────────────────────────
    console.log('1. Bộ lọc isSos của findNearbyPosts');
    await addPost(PlainPostId);
    await addPost(SosPostId, { isSos: true });

    const sosOnly = await posts.findNearbyPosts({ isSos: true, skip: 0, take: 20 });
    check(
      'isSos=true chỉ trả bài SOS',
      sosOnly.total === 1 &&
        sosOnly.items[0]?.post.globalId === SosPostId,
      `total=${sosOnly.total}`,
    );

    const noFilter = await posts.findNearbyPosts({ skip: 0, take: 20 });
    check(
      'bỏ trống isSos thì trả CẢ HAI loại',
      noFilter.total === 2,
      `total=${noFilter.total}`,
    );

    const falseFilter = await posts.findNearbyPosts({
      isSos: false,
      skip: 0,
      take: 20,
    });
    check(
      'isSos=false cũng KHÔNG lọc, không phải "chỉ bài không gấp"',
      falseFilter.total === 2,
      `total=${falseFilter.total}`,
    );

    // ── 2. Lô duyệt nguyên tử ──────────────────────────────────────────────
    console.log('\n2. acceptRequestsBatch trên một bài 5 suất');
    await addPost(BatchPostId, { quantity: 5 });
    const batchUsers = [
      await addRequester(),
      await addRequester(),
      await addRequester(),
    ];
    const batchRequests: string[] = [];
    for (const user of batchUsers)
      batchRequests.push(await addRequest(BatchPostId, user));
    // Một người thứ tư xin nhưng KHÔNG nằm trong lô — dùng để đo phép quét STANDBY.
    const bystander = await addRequest(BatchPostId, await addRequester());

    const batch = await requests.acceptRequestsBatch({
      postId: BatchPostId,
      giverId: GiverId,
      requestIds: batchRequests,
    });

    check('duyệt đủ 3 người', batch.accepted.length === 3);
    check(
      'tồn kho trừ ĐÚNG 3, không trừ từng lần rồi lệch',
      batch.remainingQuantity === 2,
      `remaining=${batch.remainingQuantity}`,
    );
    check(
      'còn suất thì KHÔNG ai bị đẩy sang STANDBY',
      batch.standbyCount === 0,
      `standby=${batch.standbyCount}`,
    );

    const [batchPost] = await dataSource.query<
      { status: string; remaining_quantity: number }[]
    >(`SELECT status, remaining_quantity FROM posts WHERE global_id = $1`, [
      BatchPostId,
    ]);
    check(
      'bài vẫn PUBLISHED vì còn suất',
      batchPost.status === 'PUBLISHED' &&
        Number(batchPost.remaining_quantity) === 2,
      `${batchPost.status}/${batchPost.remaining_quantity}`,
    );

    const [{ count: txCount }] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM gift_transactions WHERE post_id = $1`,
      [BatchPostId],
    );
    check('tạo đúng 3 lượt trao', Number(txCount) === 3, `count=${txCount}`);

    const [{ count: roomCount }] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM chat_rooms WHERE post_id = $1`,
      [BatchPostId],
    );
    check(
      'mở đúng 3 phòng chat, trong CÙNG transaction',
      Number(roomCount) === 3,
      `count=${roomCount}`,
    );

    const [bystanderRow] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM gift_requests WHERE global_id = $1`,
      [bystander],
    );
    check(
      'người ngoài lô vẫn PENDING, chưa bị đụng tới',
      bystanderRow.status === 'PENDING',
      bystanderRow.status,
    );

    // ── 3. Vòng lặp acceptRequest để lại trạng thái NỬA VỜI ───────────────
    console.log('\n3. Cùng tình huống, vòng lặp acceptRequest để lại gì');
    // Bài 2 suất, 3 người xin — ĐÚNG tình huống mục 4 dưới đây đưa cho lô.
    //
    // Đo A/B: đường vòng lặp duyệt được 2 người rồi chết, và 2 lượt đó ĐÃ COMMIT;
    // đường lô từ chối trọn vẹn và để bài y nguyên. Đó là khác biệt thật giữa hai
    // đường, và là lý do `acceptRequestsBatch` tồn tại.
    await addPost(LoopPostId, { quantity: 2 });
    const loopRequests: string[] = [];
    for (let index = 0; index < 3; index += 1)
      loopRequests.push(await addRequest(LoopPostId, await addRequester()));

    let loopFailedAt = -1;
    let loopError = '';
    for (const [index, requestId] of loopRequests.entries()) {
      try {
        await requests.acceptRequest({
          requestId,
          postId: LoopPostId,
          giverId: GiverId,
          transactionId: `f1000000-0000-4000-8000-00000000f0${String(index + 1).padStart(2, '0')}`,
        });
      } catch (error) {
        loopFailedAt = index;
        loopError = (error as Error).constructor.name;
        break;
      }
    }

    check(
      'vòng lặp chết ở người thứ 3 sau khi đã commit 2 lượt',
      loopFailedAt === 2,
      loopFailedAt === -1 ? 'không chết' : `chết ở index ${loopFailedAt} với ${loopError}`,
    );

    const loopStatuses = await dataSource.query<
      { global_id: string; status: string }[]
    >(
      `SELECT global_id, status FROM gift_requests WHERE post_id = $1 ORDER BY global_id`,
      [LoopPostId],
    );
    const loopAccepted = loopStatuses.filter((row) => row.status === 'ACCEPTED');
    const loopStandby = loopStatuses.filter((row) => row.status === 'STANDBY');
    check(
      'và để lại trạng thái NỬA VỜI không có đường lùi: 2 ACCEPTED + 1 STANDBY',
      loopAccepted.length === 2 && loopStandby.length === 1,
      `accepted=${loopAccepted.length} standby=${loopStandby.length}`,
    );

    const [loopPost] = await dataSource.query<
      { status: string; remaining_quantity: number }[]
    >(`SELECT status, remaining_quantity FROM posts WHERE global_id = $1`, [
      LoopPostId,
    ]);
    check(
      'bài đã chuyển RESERVED và cạn suất — không bấm lại được',
      loopPost.status === 'RESERVED' &&
        Number(loopPost.remaining_quantity) === 0,
      `${loopPost.status}/${loopPost.remaining_quantity}`,
    );

    // Và điều KHÔNG đúng, ghi lại để không ai dựng lại giả định sai: khi số yêu
    // cầu bằng đúng số suất, vòng lặp KHÔNG tự phá. Phép quét STANDBY chỉ chạy
    // lúc suất về 0, và lúc đó mọi yêu cầu trong lô đã ACCEPTED nên không còn gì
    // để nó cướp. Giá trị của lô nằm ở tính nguyên tử, không ở chỗ đó.
    await addPost(EvenPostId, { quantity: 2 });
    const evenRequests: string[] = [];
    for (let index = 0; index < 2; index += 1)
      evenRequests.push(await addRequest(EvenPostId, await addRequester()));

    let evenFailed = false;
    for (const [index, requestId] of evenRequests.entries()) {
      try {
        await requests.acceptRequest({
          requestId,
          postId: EvenPostId,
          giverId: GiverId,
          transactionId: `f2000000-0000-4000-8000-00000000f1${String(index + 1).padStart(2, '0')}`,
        });
      } catch {
        evenFailed = true;
      }
    }
    check(
      'số yêu cầu BẰNG số suất thì vòng lặp chạy hết — phép quét STANDBY không cướp ai',
      !evenFailed,
      evenFailed ? 'có lượt chết' : 'cả hai đều duyệt được',
    );

    // ── 4. Hết suất giữa lô thì không duyệt một phần ───────────────────────
    console.log('\n4. Lô vượt tồn kho bị từ chối TRỌN VẸN');
    await addPost(ShortPostId, { quantity: 2 });
    const shortRequests: string[] = [];
    for (let index = 0; index < 3; index += 1)
      shortRequests.push(await addRequest(ShortPostId, await addRequester()));

    let shortError = '';
    try {
      await requests.acceptRequestsBatch({
        postId: ShortPostId,
        giverId: GiverId,
        requestIds: shortRequests,
      });
    } catch (error) {
      shortError = (error as Error).constructor.name;
    }
    check(
      'lô 3 trên bài 2 suất bị từ chối',
      shortError === 'GiftTransactionOutOfStockException',
      shortError || 'không ném',
    );

    const [shortPost] = await dataSource.query<
      { status: string; remaining_quantity: number }[]
    >(`SELECT status, remaining_quantity FROM posts WHERE global_id = $1`, [
      ShortPostId,
    ]);
    check(
      'tồn kho Y NGUYÊN sau khi lô bị từ chối',
      Number(shortPost.remaining_quantity) === 2 &&
        shortPost.status === 'PUBLISHED',
      `${shortPost.status}/${shortPost.remaining_quantity}`,
    );

    const [{ count: shortAccepted }] = await dataSource.query<
      { count: string }[]
    >(
      `SELECT COUNT(*) AS count FROM gift_requests
       WHERE post_id = $1 AND status <> 'PENDING'`,
      [ShortPostId],
    );
    check(
      'KHÔNG yêu cầu nào bị đổi trạng thái — không duyệt một phần',
      Number(shortAccepted) === 0,
      `đã đổi=${shortAccepted}`,
    );

    const [{ count: shortTx }] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM gift_transactions WHERE post_id = $1`,
      [ShortPostId],
    );
    check(
      'và KHÔNG lượt trao nào được tạo',
      Number(shortTx) === 0,
      `count=${shortTx}`,
    );

    // ── 5. offering_post_id và ON DELETE SET NULL ──────────────────────────
    console.log('\n5. Cột offering_post_id của migration 1797000000000');
    await addPost(WantedPostId, { postType: 'WANTED' });
    await addPost(OfferingPostId, { postType: 'OFFER' });
    const offerer = await addRequester();
    const offerRequestId = 'e9000000-0000-4000-8000-00000000e901';
    await dataSource.query(
      `INSERT INTO gift_requests
         (global_id, post_id, requester_id, message, status, queue_joined_at,
          offering_post_id)
       VALUES ($1, $2, $3, 'Mình có sẵn món này muốn tặng bạn!', 'PENDING',
               now(), $4)`,
      [offerRequestId, WantedPostId, offerer, OfferingPostId],
    );

    const [linked] = await dataSource.query<
      { offering_post_id: string | null }[]
    >(`SELECT offering_post_id FROM gift_requests WHERE global_id = $1`, [
      offerRequestId,
    ]);
    check(
      'lời tặng ghi được bài mang ra',
      linked.offering_post_id === OfferingPostId,
      String(linked.offering_post_id),
    );

    // Xoá CỨNG bài mang ra tặng để đo đúng hành vi của khoá ngoại. Đường nghiệp
    // vụ thật là xoá mềm, nhưng xoá mềm không chạm tới khoá ngoại nên không kiểm
    // được điều cần kiểm ở đây.
    await dataSource.query(`DELETE FROM posts WHERE global_id = $1`, [
      OfferingPostId,
    ]);

    const survivor = await dataSource.query<
      { status: string; offering_post_id: string | null }[]
    >(
      `SELECT status, offering_post_id FROM gift_requests WHERE global_id = $1`,
      [offerRequestId],
    );
    check(
      'xoá bài mang ra tặng thì yêu cầu CÒN, chỉ mất liên kết (SET NULL, không CASCADE)',
      survivor.length === 1 &&
        survivor[0].offering_post_id === null &&
        survivor[0].status === 'PENDING',
      survivor.length === 0
        ? 'yêu cầu đã bị xoá theo — khoá ngoại đang là CASCADE'
        : `offering=${survivor[0].offering_post_id}`,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `
${
      failures.length === 0
        ? 'Bốn endpoint vá lỗ SRS: isSos lọc đúng, lô duyệt nguyên tử, vòng lặp acceptRequest để lại trạng thái nửa vời ở đúng ca lô đông hơn số suất, và lời tặng sống sót khi bài nguồn biến mất'
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
