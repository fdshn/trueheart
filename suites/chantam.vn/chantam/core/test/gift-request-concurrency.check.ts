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
import {
  ICandidateMetrics,
  pickNextCandidate,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import { GiftRequestEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

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
  // Phòng chat trước giao dịch: khoá ngoại KHÔNG cascade (cascade sẽ đụng
  // trigger chỉ-ghi-thêm của chat_messages), nên thứ tự xoá là bắt buộc.
  await dataSource.query(
    `DELETE FROM chat_rooms WHERE transaction_id IN
       (SELECT global_id FROM gift_transactions WHERE post_id = $1)`,
    [PostId],
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
       VALUES ($1, $2, $3, 'Em xin món này ạ', 'PENDING', now() + ($4 * interval '1 second'))`,
      [requestId(round, index), PostId, requesterId(index), index * 10],
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

    // ChatRepository THẬT, không mock: duyệt mở phòng chat trong cùng
    // transaction (F34), nên chạy hai lượt duyệt song song ở đây cũng kiểm luôn
    // rằng UNIQUE(transaction_id) không cho hai phòng cho một lượt trao.
    const chat = new ChatRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    );
    const giftRequests = new GiftRequestRepository(
      GiftRequestEntity as never,
      dataSource.manager,
      chat,
    );
    const giftTransactions = new GiftTransactionRepository(
      dataSource.manager,
      chat,
      new PointLedgerRepository(dataSource.manager),
    );

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

    // ── 3. Giá trị TRẢ VỀ của rút yêu cầu ───────────────────────────────────
    // Không phải chuyện đồng thời, nhưng chỉ database thật mới lộ ra: `query()`
    // bọc kết quả UPDATE thành `[rows, affected]`. Đọc sai hình dạng đó từng
    // khiến hàm trả về yêu cầu của NGƯỜI KHÁC, vì `findOne` nhận `undefined`
    // rồi bỏ qua luôn điều kiện lọc.
    console.log('\nGiá trị trả về của rút yêu cầu:\n');

    await seedRound(dataSource, 900, 1, 2);

    const withdrawn = await giftRequests.withdrawIfPending(
      PostId,
      requesterId(0),
    );
    check(
      'rút yêu cầu trả về ĐÚNG yêu cầu của người gọi',
      withdrawn?.requesterId === requesterId(0),
      `trả về của ${withdrawn?.requesterId ?? 'null'}`,
    );
    check(
      'yêu cầu trả về mang trạng thái WITHDRAWN',
      withdrawn?.status === 'WITHDRAWN',
      String(withdrawn?.status),
    );
    check(
      'yêu cầu của người khác không bị đụng tới',
      (await countBy(
        dataSource,
        `SELECT COUNT(*) AS count FROM gift_requests
         WHERE post_id = $1 AND status = 'PENDING'`,
      )) === 1,
    );

    const withdrawnAgain = await giftRequests.withdrawIfPending(
      PostId,
      requesterId(0),
    );
    check(
      'rút lần hai trả về null, không phải một yêu cầu bất kỳ',
      withdrawnAgain === null,
      withdrawnAgain === null ? '' : 'trả về một bản ghi',
    );

    // ── 4. Hàng đợi dự phòng (F33, F35) ─────────────────────────────────────
    // Mock không chạy câu SQL nào, nên toàn bộ phép biến đổi trạng thái hàng
    // đợi chỉ lộ ra ở đây.
    console.log('\nHàng đợi dự phòng:\n');

    await seedRound(dataSource, 800, 1, 3);

    const accepted = await giftRequests.acceptRequest({
      requestId: requestId(800, 0),
      postId: PostId,
      giverId: GiverId,
      transactionId: `55555555-5555-4555-8555-${suffix('58', 800, 0)}`,
    });

    check(
      'hết hàng thì hai người còn lại vào STANDBY, không bị REJECTED',
      (await countBy(
        dataSource,
        `SELECT COUNT(*) AS count FROM gift_requests
         WHERE post_id = $1 AND status = 'STANDBY'`,
      )) === 2 &&
        (await countBy(
          dataSource,
          `SELECT COUNT(*) AS count FROM gift_requests
           WHERE post_id = $1 AND status = 'REJECTED'`,
        )) === 0,
    );

    check(
      'người trong hàng đợi VẪN được đếm là ứng viên đang sống',
      (await giftRequests.countActiveByPostIds([PostId])).get(PostId) === 3,
      String((await giftRequests.countActiveByPostIds([PostId])).get(PostId)),
    );

    // Người STANDBY rút được — phải có đường ra khỏi hàng đợi.
    const withdrewFromQueue = await giftRequests.withdrawIfPending(
      PostId,
      requesterId(2),
    );
    check(
      'người đang STANDBY rút được yêu cầu',
      withdrewFromQueue?.requesterId === requesterId(2),
      String(withdrewFromQueue?.status),
    );

    // Huỷ lượt trao: hàng đợi mở lại.
    const closed = await giftTransactions.close({
      transactionId: accepted.transactionId,
      actorUserId: GiverId,
      status: 'CANCELLED',
      reason: 'Kiểm tra hàng đợi dự phòng',
    });

    check(
      'huỷ xong thì đếm đúng số người được mở lại',
      closed.queue.reopenedCount === 1,
      `reopened=${closed.queue.reopenedCount}`,
    );
    // Repository chỉ cấp SỐ ĐO; xếp hạng là chính sách và Admin cấu hình được
    // (CH-1). Ở đây áp cả hai thứ tự trên CÙNG một tập ứng viên để chứng minh
    // đổi cấu hình là đổi người được đề xuất — trên database thật, không mock.
    check(
      'mặc định: người vào hàng đợi SỚM NHẤT được đề xuất',
      pickNextCandidate(closed.queue.candidates, null)?.requesterId ===
        requesterId(1),
      String(pickNextCandidate(closed.queue.candidates, null)?.requesterId),
    );
    check(
      'số đo lấy được đủ để xếp theo mọi tiêu chí',
      closed.queue.candidates.every(
        (entry: ICandidateMetrics) =>
          typeof entry.receivedCount === 'number' &&
          typeof entry.cancellationCount === 'number' &&
          entry.queueJoinedAt instanceof Date &&
          Number.isInteger(entry.requestId),
      ),
      JSON.stringify(closed.queue.candidates[0]),
    );
    check(
      'người vừa bị huỷ KHÔNG quay lại hàng đợi',
      (await countBy(
        dataSource,
        `SELECT COUNT(*) AS count FROM gift_requests
         WHERE post_id = $1 AND requester_id = '${requesterId(0)}'
           AND status = 'CANCELLED'`,
      )) === 1,
    );
    check(
      'người đã rút KHÔNG bị kéo trở lại hàng đợi',
      (await countBy(
        dataSource,
        `SELECT COUNT(*) AS count FROM gift_requests
         WHERE post_id = $1 AND requester_id = '${requesterId(2)}'
           AND status = 'WITHDRAWN'`,
      )) === 1,
    );
    check(
      'tồn kho được trả lại sau khi huỷ',
      (await remainingQuantity(dataSource)) === 1,
      String(await remainingQuantity(dataSource)),
    );
    check(
      'ghi lại ai đã huỷ, để đếm được số lần huỷ (F35)',
      (await giftTransactions.countClosedBy(GiverId, 'CANCELLED')) >= 1,
      String(await giftTransactions.countClosedBy(GiverId, 'CANCELLED')),
    );

    // Hàng đợi rỗng thì không có đề xuất nào.
    await seedRound(dataSource, 801, 1, 1);
    const soloAccepted = await giftRequests.acceptRequest({
      requestId: requestId(801, 0),
      postId: PostId,
      giverId: GiverId,
      transactionId: `55555555-5555-4555-8555-${suffix('59', 801, 0)}`,
    });
    const soloClosed = await giftTransactions.close({
      transactionId: soloAccepted.transactionId,
      actorUserId: GiverId,
      status: 'CANCELLED',
      reason: 'Không còn ai trong hàng đợi',
    });
    check(
      'không còn ai thì không đề xuất người kế tiếp',
      soloClosed.queue.candidates.length === 0 &&
        soloClosed.queue.reopenedCount === 0,
      JSON.stringify(soloClosed.queue),
    );

    // ── 5. Thứ tự ưu tiên do Admin cấu hình (CH-1) ──────────────────────────
    console.log('\nThứ tự ưu tiên chọn người nhận:\n');

    // Ba người xin: người xin SỚM NHẤT có hạng thấp nhất, để hai chính sách cho
    // hai kết quả khác nhau rõ rệt.
    await seedRound(dataSource, 802, 1, 3);
    await dataSource.query(
      `UPDATE users SET rank = 'DIAMOND' WHERE global_id = $1`,
      [requesterId(2)],
    );

    const rankAccepted = await giftRequests.acceptRequest({
      requestId: requestId(802, 0),
      postId: PostId,
      giverId: GiverId,
      transactionId: `55555555-5555-4555-8555-${suffix('5a', 802, 0)}`,
    });
    const rankClosed = await giftTransactions.close({
      transactionId: rankAccepted.transactionId,
      actorUserId: GiverId,
      status: 'CANCELLED',
      reason: 'Kiểm tra thứ tự ưu tiên',
    });

    check(
      'ưu tiên ai xin trước thì chọn người xin sớm hơn',
      pickNextCandidate(rankClosed.queue.candidates, ['QUEUE_JOINED_EARLIEST'])
        ?.requesterId === requesterId(1),
      String(
        pickNextCandidate(rankClosed.queue.candidates, [
          'QUEUE_JOINED_EARLIEST',
        ])?.requesterId,
      ),
    );
    check(
      'ưu tiên hạng cao thì chọn người Kim Cương, dù họ xin sau',
      pickNextCandidate(rankClosed.queue.candidates, ['HIGHEST_RANK'])
        ?.requesterId === requesterId(2),
      String(
        pickNextCandidate(rankClosed.queue.candidates, ['HIGHEST_RANK'])
          ?.requesterId,
      ),
    );
    check(
      'cấu hình rác vẫn chạy, rơi về mặc định',
      pickNextCandidate(rankClosed.queue.candidates, ['KHONG_TON_TAI'])
        ?.requesterId === requesterId(1),
    );

    // Nhánh ST_Distance: người xin ở xa VÀ người ở gần, để câu SQL tính khoảng
    // cách thật sự chạy. Không đặt Vị trí mặc định thì `distance_meters` luôn
    // NULL và tiêu chí NEAREST chưa từng được kiểm.
    await seedRound(dataSource, 803, 1, 3);
    await dataSource.query(
      `UPDATE users SET default_location =
         ST_SetSRID(ST_MakePoint(106.700, 10.7730), 4326)::geography
       WHERE global_id = $1`,
      [requesterId(2)],
    );
    await dataSource.query(
      `UPDATE users SET default_location =
         ST_SetSRID(ST_MakePoint(108.200, 16.0500), 4326)::geography
       WHERE global_id = $1`,
      [requesterId(1)],
    );

    const nearAccepted = await giftRequests.acceptRequest({
      requestId: requestId(803, 0),
      postId: PostId,
      giverId: GiverId,
      transactionId: `55555555-5555-4555-8555-${suffix('5b', 803, 0)}`,
    });
    const nearClosed = await giftTransactions.close({
      transactionId: nearAccepted.transactionId,
      actorUserId: GiverId,
      status: 'CANCELLED',
      reason: 'Kiểm tra tiêu chí khoảng cách',
    });

    const withDistance = nearClosed.queue.candidates.filter(
      (entry: ICandidateMetrics) => entry.distanceMeters !== null,
    );
    check(
      'ST_Distance trả về số thật cho người đã đặt Vị trí mặc định',
      withDistance.length === 2 &&
        withDistance.every(
          (entry: ICandidateMetrics) => Number(entry.distanceMeters) > 0,
        ),
      JSON.stringify(
        withDistance.map((entry: ICandidateMetrics) => entry.distanceMeters),
      ),
    );
    check(
      'ưu tiên gần nhất thì chọn người ở Quận 1, không phải người ở Đà Nẵng',
      pickNextCandidate(nearClosed.queue.candidates, ['NEAREST'])
        ?.requesterId === requesterId(2),
      String(
        pickNextCandidate(nearClosed.queue.candidates, ['NEAREST'])
          ?.requesterId,
      ),
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
