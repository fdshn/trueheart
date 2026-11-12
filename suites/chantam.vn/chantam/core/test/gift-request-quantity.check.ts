/**
 * Xin nhận theo SỐ LƯỢNG thật (12/11) — kiểm trên Postgres THẬT, database nháp.
 *
 * Unit test mock `query` nên không thấy luật nằm trong SQL: khoá dòng, phép cân hàng chờ, ràng
 * buộc "một request đang chờ", hoàn kho đúng `quantity`. Kịch bản bám đúng đặc tả:
 *
 * > Bài 10 món, A xin 8, B xin 8. Duyệt A → A đủ 8, còn 2; B KHÔNG tự giảm còn 2, KHÔNG duyệt
 * > một phần, mà sang STANDBY lý do không đủ số lượng. B giảm xuống ≤ 2, rút, hoặc chờ hàng hoàn
 * > về. Huỷ lượt trao hoàn đúng `quantity` và xét lại STANDBY. Bài hoàn tất thì request chờ
 * > còn lại CANCELLED kèm lý do. Không trừ kho hai lần, không duyệt vượt kho.
 *
 *   npm run test:gift-request-quantity
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import { GiftRequestEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { AffiliateRepository } from '../src/infrastructure/repository/affiliate.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { CheckInRepository } from '../src/infrastructure/repository/check-in.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_gift_request_quantity_check';

const OwnerId = '99999999-9999-4999-8999-99999999a001';
const UserA = '99999999-9999-4999-8999-99999999a00a';
const UserB = '99999999-9999-4999-8999-99999999a00b';
const UserC = '99999999-9999-4999-8999-99999999a00c';
const PostId = '88888888-8888-4888-8888-88888888a001';
const WantedPostId = '88888888-8888-4888-8888-88888888a002';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

let txCounter = 0;
const nextTxId = () =>
  `55555555-5555-4555-8555-${String(++txCounter).padStart(12, '0')}`;
let reqCounter = 0;
const nextReqId = () =>
  `66666666-6666-4666-8666-${String(++reqCounter).padStart(12, '0')}`;

interface RequestRow {
  global_id: string;
  status: string;
  requested_quantity: number;
  status_reason: string | null;
  queue_joined_at: Date;
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

  const db = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
    extra: { max: 10 },
  });
  await db.initialize();
  await db.runMigrations();

  try {
    for (const [index, id] of [OwnerId, UserA, UserB, UserC].entries())
      await db.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, `soluong${index}`],
      );

    const ledger = () => new PointLedgerRepository(db.manager);
    const chat = new ChatRepository(
      db.manager,
      new AdminConfigRepository(db.manager),
    );
    const requests = new GiftRequestRepository(
      GiftRequestEntity as never,
      db.manager,
      chat,
      ledger(),
    );
    const transactions = new GiftTransactionRepository(
      db.manager,
      chat,
      ledger(),
      new CheckInRepository(db.manager, ledger()),
      new AffiliateRepository(
        db.manager,
        ledger(),
        new AdminConfigRepository(db.manager),
      ),
    );

    const resetPost = async (
      postId: string,
      postType: string,
      stock: number,
    ) => {
      await db.query(
        `DELETE FROM chat_rooms WHERE transaction_id IN
           (SELECT global_id FROM gift_transactions WHERE post_id = $1)`,
        [postId],
      );
      await db.query(
        `DELETE FROM recipient_selection_audits WHERE post_id = $1`,
        [postId],
      );
      await db.query(`DELETE FROM gift_transactions WHERE post_id = $1`, [
        postId,
      ]);
      await db.query(`DELETE FROM gift_requests WHERE post_id = $1`, [postId]);
      await db.query(`DELETE FROM posts WHERE global_id = $1`, [postId]);
      await db.query(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity, details, renewed_count)
         VALUES ($1, $2, $3, $4, 'Bài kiểm số lượng', 'Mô tả đủ dài cho bài kiểm số lượng',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'PUBLISHED', $5, $5, '{}'::jsonb, 0)`,
        [postId, postType, OwnerId, CategoryId, stock],
      );
    };
    const addRequest = async (
      postId: string,
      requesterId: string,
      quantity: number,
      secondsOffset = 0,
    ) => {
      const id = nextReqId();
      await db.query(
        `INSERT INTO gift_requests
           (global_id, post_id, requester_id, message, status, queue_joined_at, requested_quantity)
         VALUES ($1, $2, $3, 'Xin ạ', 'PENDING', now() + ($4 * interval '1 second'), $5)`,
        [id, postId, requesterId, secondsOffset, quantity],
      );
      return id;
    };
    const readRequest = async (id: string): Promise<RequestRow> =>
      (
        await db.query<RequestRow[]>(
          `SELECT global_id, status, requested_quantity, status_reason, queue_joined_at
             FROM gift_requests WHERE global_id = $1`,
          [id],
        )
      )[0];
    const readPost = async (postId = PostId) =>
      (
        await db.query<{ status: string; remaining_quantity: number }[]>(
          `SELECT status, remaining_quantity FROM posts WHERE global_id = $1`,
          [postId],
        )
      )[0];
    const accept = (requestId: string, postId = PostId) =>
      requests.acceptRequest({
        requestId,
        postId,
        actorUserId: OwnerId,
        transactionId: nextTxId(),
      });
    const errorName = async (work: () => Promise<unknown>) => {
      try {
        await work();
        return 'OK';
      } catch (error) {
        return (error as Error).constructor.name;
      }
    };

    // ── 1. Kịch bản đặc tả: 10 món, A xin 8, B xin 8 ──────────────────────
    console.log('1. Bài 10 món, A xin 8, B xin 8, duyệt A trước\n');
    await resetPost(PostId, 'OFFER', 10);
    const reqA = await addRequest(PostId, UserA, 8, 0);
    const reqB = await addRequest(PostId, UserB, 8, 10);
    const queueBefore = (await readRequest(reqB)).queue_joined_at;
    const dealA = await accept(reqA);
    const movedB = dealA.rebalanced.find((row) => row.requestId === reqB);
    check(
      'lượt duyệt trả về B vừa bị chuyển (để báo): PENDING → STANDBY, còn 2, xin 8, có tên bài',
      movedB?.fromStatus === 'PENDING' &&
        movedB?.toStatus === 'STANDBY' &&
        movedB?.remainingQuantity === 2 &&
        movedB?.requestedQuantity === 8 &&
        movedB?.postTitle === 'Bài kiểm số lượng',
      JSON.stringify(movedB),
    );

    const afterA = await readPost();
    const bAfter = await readRequest(reqB);
    const [txA] = await db.query<{ quantity: number; request_id: string }[]>(
      `SELECT quantity, request_id FROM gift_transactions WHERE global_id = $1`,
      [dealA.transactionId],
    );
    check(
      'A được duyệt ĐỦ 8 món (lượt trao quantity = 8, gắn đúng request)',
      Number(txA.quantity) === 8 && txA.request_id === reqA,
      JSON.stringify(txA),
    );
    check(
      'kho còn 2, bài vẫn PUBLISHED (còn hàng)',
      Number(afterA.remaining_quantity) === 2 && afterA.status === 'PUBLISHED',
      JSON.stringify(afterA),
    );
    check(
      'B sang STANDBY lý do INSUFFICIENT_QUANTITY',
      bAfter.status === 'STANDBY' &&
        bAfter.status_reason === 'INSUFFICIENT_QUANTITY',
      `${bAfter.status}/${bAfter.status_reason}`,
    );
    check(
      'B KHÔNG bị tự giảm số lượng — vẫn 8',
      Number(bAfter.requested_quantity) === 8,
    );
    check(
      'B không bị duyệt một phần: không có lượt trao nào của B',
      Number(
        (
          await db.query<{ n: string }[]>(
            `SELECT count(*) n FROM gift_transactions WHERE request_id = $1`,
            [reqB],
          )
        )[0].n,
      ) === 0,
    );
    check(
      'duyệt B (đang STANDBY) bị từ chối, kho không đổi',
      (await errorName(() => accept(reqB))) ===
        'GiftRequestNotFoundException' &&
        Number((await readPost()).remaining_quantity) === 2,
    );

    // ── 2. B giảm số lượng ───────────────────────────────────────────────
    console.log('\n2. B chỉnh request xuống tối đa 2 món\n');
    check(
      'tăng số lượng bị chặn (chỉ được giảm)',
      (await errorName(() =>
        requests.updateRequestedQuantity({
          postId: PostId,
          requesterId: UserB,
          requestedQuantity: 9,
        }),
      )) === 'GiftRequestInvalidQuantityException',
    );
    await requests.updateRequestedQuantity({
      postId: PostId,
      requesterId: UserB,
      requestedQuantity: 3,
    });
    const b3 = await readRequest(reqB);
    check(
      'giảm còn 3 (> 2 còn lại) thì vẫn STANDBY INSUFFICIENT_QUANTITY',
      b3.status === 'STANDBY' &&
        Number(b3.requested_quantity) === 3 &&
        b3.status_reason === 'INSUFFICIENT_QUANTITY',
      `${b3.status}/${b3.requested_quantity}`,
    );
    await requests.updateRequestedQuantity({
      postId: PostId,
      requesterId: UserB,
      requestedQuantity: 2,
    });
    const b2 = await readRequest(reqB);
    check(
      'giảm còn 2 thì về PENDING, xoá lý do',
      b2.status === 'PENDING' &&
        Number(b2.requested_quantity) === 2 &&
        b2.status_reason === null,
      `${b2.status}/${b2.status_reason}`,
    );
    check(
      'về PENDING GIỮ nguyên chỗ trong hàng (queue_joined_at không đổi)',
      new Date(b2.queue_joined_at).getTime() ===
        new Date(queueBefore).getTime(),
    );

    // ── 3. Huỷ lượt trao: hoàn đúng quantity, xét lại STANDBY ──────────────
    console.log('\n3. Huỷ lượt trao của A — hoàn đúng 8, xét lại hàng chờ\n');
    await resetPost(PostId, 'OFFER', 10);
    const reqA3 = await addRequest(PostId, UserA, 8, 0);
    const reqB3 = await addRequest(PostId, UserB, 8, 10);
    const reqC3 = await addRequest(PostId, UserC, 1, 20);
    const deal3 = await accept(reqA3);
    check(
      'trước khi huỷ: B STANDBY (8 > 2), C PENDING (1 ≤ 2)',
      (await readRequest(reqB3)).status === 'STANDBY' &&
        (await readRequest(reqC3)).status === 'PENDING',
    );
    const closed = await transactions.close({
      transactionId: deal3.transactionId,
      actorUserId: OwnerId,
      status: 'CANCELLED',
      reason: 'Kiểm hoàn kho theo số lượng',
    });
    const after3 = await readPost();
    const a3 = await readRequest(reqA3);
    const b3r = await readRequest(reqB3);
    check(
      'kho hoàn ĐÚNG 8 → về 10',
      Number(after3.remaining_quantity) === 10,
      String(after3.remaining_quantity),
    );
    check(
      'request của A sang CANCELLED lý do TRANSACTION_CANCELLED',
      a3.status === 'CANCELLED' && a3.status_reason === 'TRANSACTION_CANCELLED',
      `${a3.status}/${a3.status_reason}`,
    );
    check(
      'B (8 ≤ 10) được xét lại → PENDING, số lượng giữ nguyên 8',
      b3r.status === 'PENDING' &&
        Number(b3r.requested_quantity) === 8 &&
        b3r.status_reason === null,
    );
    check(
      'hàng đợi báo đúng số người được mở lại (và trả danh sách để báo từng người)',
      closed.queue.reopenedCount === 1 &&
        closed.queue.rebalanced.some(
          (row) =>
            row.requestId === reqB3 &&
            row.fromStatus === 'STANDBY' &&
            row.toStatus === 'PENDING',
        ),
      String(closed.queue.reopenedCount),
    );
    // Gọi `close()` lần hai trên lượt đã huỷ không ném lỗi (hành vi có từ trước 12/11) — điều
    // phải giữ là KHÔNG hoàn kho lần hai: hoàn chỉ chạy khi lượt còn ACCEPTED / DELIVERING.
    await errorName(() =>
      transactions.close({
        transactionId: deal3.transactionId,
        actorUserId: OwnerId,
        status: 'CANCELLED',
        reason: 'lần hai',
      }),
    );
    check(
      'huỷ lần hai KHÔNG hoàn kho lần nữa (vẫn 10)',
      Number((await readPost()).remaining_quantity) === 10,
      String((await readPost()).remaining_quantity),
    );

    // ── 4. Hết hàng → OUT_OF_STOCK; hoàn tất KHÔNG trừ kho thêm ────────────
    console.log('\n4. Duyệt hết kho, hoàn tất lượt trao, đóng request chờ\n');
    await resetPost(PostId, 'OFFER', 5);
    const reqA4 = await addRequest(PostId, UserA, 5, 0);
    const reqB4 = await addRequest(PostId, UserB, 1, 10);
    const deal4 = await accept(reqA4);
    const post4 = await readPost();
    const b4 = await readRequest(reqB4);
    check(
      'kho về 0 → bài RESERVED',
      Number(post4.remaining_quantity) === 0 && post4.status === 'RESERVED',
    );
    check(
      'B sang STANDBY lý do OUT_OF_STOCK',
      b4.status === 'STANDBY' && b4.status_reason === 'OUT_OF_STOCK',
      `${b4.status}/${b4.status_reason}`,
    );
    await transactions.markHandedOver({
      transactionId: deal4.transactionId,
      giverId: OwnerId,
      evidenceKeys: [],
    });
    await transactions.confirmReceipt(deal4.transactionId, UserA, []);
    const done4 = await readPost();
    check(
      'hoàn tất KHÔNG trừ kho lần nữa (vẫn 0), bài COMPLETED',
      Number(done4.remaining_quantity) === 0 && done4.status === 'COMPLETED',
      JSON.stringify(done4),
    );
    const closedRows = await requests.closeOpenForPosts({
      postIds: [PostId],
      status: 'CANCELLED' as never,
      statusReason: 'POST_COMPLETED' as never,
      onlyIfPostStatus: 'COMPLETED' as never,
    });
    const b4c = await readRequest(reqB4);
    check(
      'request chờ còn lại → CANCELLED lý do POST_COMPLETED',
      closedRows.length === 1 &&
        b4c.status === 'CANCELLED' &&
        b4c.status_reason === 'POST_COMPLETED',
      `${b4c.status}/${b4c.status_reason}`,
    );

    await resetPost(PostId, 'OFFER', 3);
    const reqOpen = await addRequest(PostId, UserB, 1, 0);
    const notClosed = await requests.closeOpenForPosts({
      postIds: [PostId],
      status: 'CANCELLED' as never,
      statusReason: 'POST_COMPLETED' as never,
      onlyIfPostStatus: 'COMPLETED' as never,
    });
    check(
      'bài còn hàng (PUBLISHED) thì KHÔNG đóng request chờ',
      notClosed.length === 0 &&
        (await readRequest(reqOpen)).status === 'PENDING',
    );

    // ── 5. Lịch sử request: gửi lại là dòng mới ───────────────────────────
    console.log(
      '\n5. Rút rồi gửi lại là request MỚI — một request chờ mỗi người\n',
    );
    await resetPost(PostId, 'OFFER', 3);
    const first = await addRequest(PostId, UserB, 1, 0);
    let duplicateBlocked = false;
    try {
      await addRequest(PostId, UserB, 1, 5);
    } catch (error) {
      duplicateBlocked =
        (error as { code?: string; driverError?: { code?: string } })
          .driverError?.code === '23505' ||
        (error as { code?: string }).code === '23505';
    }
    check(
      'database chặn request ĐANG CHỜ thứ hai cho cùng người (23505)',
      duplicateBlocked,
    );
    await requests.withdrawIfPending(PostId, UserB);
    const second = await addRequest(PostId, UserB, 2, 10);
    const latest = await requests.findByPostAndRequester(PostId, UserB);
    const history = await requests.listByPostAndRequester(PostId, UserB);
    check(
      'rút xong gửi lại được — dòng cũ WITHDRAWN giữ nguyên làm lịch sử',
      (await readRequest(first)).status === 'WITHDRAWN' && history.length === 2,
    );
    check(
      '"request của tôi" là request MỚI NHẤT',
      latest?.globalId === second && Number(latest?.requestedQuantity) === 2,
    );
    const statuses = await requests.findStatusesByPostIdsAndRequester(
      [PostId],
      UserB,
    );
    check(
      'myRequestStatus đọc request mới nhất (PENDING), không đọc WITHDRAWN cũ',
      statuses.get(PostId) === 'PENDING',
    );
    const counts = await requests.countActiveByPostIds([PostId]);
    check(
      'requestCount đếm NGƯỜI, không đếm dòng',
      counts.get(PostId) === 1,
      String(counts.get(PostId)),
    );

    // ── 6. Hai lượt duyệt song song không vượt kho ────────────────────────
    console.log('\n6. Duyệt song song A(8) và B(8) trên 10 món — 25 vòng\n');
    let oversold = 0;
    let bothAccepted = 0;
    for (let round = 0; round < 25; round += 1) {
      await resetPost(PostId, 'OFFER', 10);
      const ra = await addRequest(PostId, UserA, 8, 0);
      const rb = await addRequest(PostId, UserB, 8, 1);
      const results = await Promise.allSettled([accept(ra), accept(rb)]);
      const ok = results.filter(
        (result) => result.status === 'fulfilled',
      ).length;
      const left = Number((await readPost()).remaining_quantity);
      if (left < 0 || (ok === 1 && left !== 2)) oversold += 1;
      if (ok === 2) bothAccepted += 1;
    }
    check(
      'không vòng nào duyệt vượt kho / lệch số còn lại',
      oversold === 0,
      `${oversold} vòng lệch`,
    );
    check(
      'không vòng nào duyệt CẢ HAI (16 > 10)',
      bothAccepted === 0,
      `${bothAccepted} vòng`,
    );

    // ── 7. Duyệt lô cộng đủ số lượng ──────────────────────────────────────
    console.log('\n7. Duyệt lô — mỗi request ăn đủ số nó xin\n');
    await resetPost(PostId, 'OFFER', 6);
    const l1 = await addRequest(PostId, UserA, 2, 0);
    const l2 = await addRequest(PostId, UserB, 3, 1);
    const l3 = await addRequest(PostId, UserC, 4, 2);
    const batch = await requests.acceptRequestsBatch({
      postId: PostId,
      actorUserId: OwnerId,
      requestIds: [l1, l2],
    });
    const c7 = await readRequest(l3);
    check('lô 2 + 3 trên 6 món → còn 1', batch.remainingQuantity === 1);
    check(
      'C (4 > 1) sang STANDBY INSUFFICIENT_QUANTITY, đếm vào standbyCount',
      c7.status === 'STANDBY' &&
        c7.status_reason === 'INSUFFICIENT_QUANTITY' &&
        batch.standbyCount === 1,
    );
    await resetPost(PostId, 'OFFER', 4);
    const m1 = await addRequest(PostId, UserA, 3, 0);
    const m2 = await addRequest(PostId, UserB, 2, 1);
    check(
      'lô vượt kho (3 + 2 > 4) dừng cả lô, kho không đổi',
      (await errorName(() =>
        requests.acceptRequestsBatch({
          postId: PostId,
          actorUserId: OwnerId,
          requestIds: [m1, m2],
        }),
      )) === 'GiftTransactionOutOfStockException' &&
        Number((await readPost()).remaining_quantity) === 4,
    );

    // ── 8. Chủ bài sửa tổng số lượng → cân lại hàng chờ ───────────────────
    console.log('\n8. Chủ bài bổ sung / bớt hàng\n');
    await resetPost(PostId, 'OFFER', 10);
    const e1 = await addRequest(PostId, UserA, 8, 0);
    const e2 = await addRequest(PostId, UserB, 5, 1);
    await accept(e1);
    check(
      'trước khi bổ sung: B (5 > 2) STANDBY',
      (await readRequest(e2)).status === 'STANDBY',
    );
    await db.query(
      `UPDATE posts SET total_quantity = 13, remaining_quantity = 5 WHERE global_id = $1`,
      [PostId],
    );
    await requests.rebalanceOpenRequests(PostId);
    check(
      'bổ sung lên còn 5 → B về PENDING',
      (await readRequest(e2)).status === 'PENDING',
    );
    await db.query(
      `UPDATE posts SET total_quantity = 11, remaining_quantity = 3 WHERE global_id = $1`,
      [PostId],
    );
    await requests.rebalanceOpenRequests(PostId);
    const e2b = await readRequest(e2);
    check(
      'bớt còn 3 → B STANDBY INSUFFICIENT_QUANTITY, vẫn xin 5',
      e2b.status === 'STANDBY' &&
        e2b.status_reason === 'INSUFFICIENT_QUANTITY' &&
        Number(e2b.requested_quantity) === 5,
    );

    // ── 10. Đồng hồ tự chọn với hàng lẻ, nhắc người STANDBY ───────────────
    console.log(
      '\n10. Đồng hồ tự chọn giữ khi còn hàng lẻ; nhắc người STANDBY\n',
    );
    await resetPost(PostId, 'OFFER', 10);
    await db.query(
      `UPDATE posts SET selection_deadline = now() + interval '3 days' WHERE global_id = $1`,
      [PostId],
    );
    const d1 = await addRequest(PostId, UserA, 8, 0);
    const d2 = await addRequest(PostId, UserB, 5, 1);
    await accept(d1);
    const [clock] = await db.query<{ selection_deadline: Date | null }[]>(
      `SELECT selection_deadline FROM posts WHERE global_id = $1`,
      [PostId],
    );
    check(
      'còn 2 món lẻ → GIỮ selection_deadline (job tới hạn vẫn chọn tiếp)',
      clock.selection_deadline !== null,
    );
    check(
      'chưa quá hạn xét thì CHƯA nhắc người STANDBY',
      !(await requests.findStandbyNudges(50)).some(
        (row) => row.requestId === d2,
      ),
    );
    await db.query(
      `UPDATE posts SET selection_deadline = now() - interval '1 minute' WHERE global_id = $1`,
      [PostId],
    );
    const nudges = await requests.findStandbyNudges(50);
    const nudgeB = nudges.find((row) => row.requestId === d2);
    check(
      'quá hạn, không còn ai vừa số → nhắc B (còn 2, B xin 5)',
      nudgeB?.remainingQuantity === 2 && nudgeB?.requestedQuantity === 5,
      JSON.stringify(nudgeB),
    );
    const due = await requests.findPostsDueForSelection(50);
    check(
      'job không coi bài là "tới hạn chọn" khi không còn ai vừa số',
      !due.some((row) => row.postId === PostId),
    );
    await addRequest(PostId, UserC, 1, 5);
    check(
      'có người vừa số (C xin 1) thì job chọn C trước, chưa nhắc B',
      (await requests.findPostsDueForSelection(50)).some(
        (row) => row.postId === PostId,
      ) &&
        !(await requests.findStandbyNudges(50)).some(
          (row) => row.requestId === d2,
        ),
    );
    const last = await addRequest(PostId, UserB, 1, 0).catch(() => null);
    check(
      'B vẫn chỉ có MỘT request đang chờ (không tạo thêm được)',
      last === null,
    );
    const [cDeal] = await db.query<{ global_id: string }[]>(
      `SELECT global_id FROM gift_requests WHERE post_id = $1 AND requester_id = $2 AND status = 'PENDING'`,
      [PostId, UserC],
    );
    await accept(cDeal.global_id);
    const [clock2] = await db.query<
      { selection_deadline: Date | null; remaining_quantity: number }[]
    >(
      `SELECT selection_deadline, remaining_quantity FROM posts WHERE global_id = $1`,
      [PostId],
    );
    check(
      'kho chưa về 0 (còn 1) thì vẫn giữ mốc',
      clock2.selection_deadline !== null &&
        Number(clock2.remaining_quantity) === 1,
    );
    await resetPost(PostId, 'OFFER', 2);
    await db.query(
      `UPDATE posts SET selection_deadline = now() + interval '3 days' WHERE global_id = $1`,
      [PostId],
    );
    const z1 = await addRequest(PostId, UserA, 2, 0);
    await accept(z1);
    const [clock3] = await db.query<{ selection_deadline: Date | null }[]>(
      `SELECT selection_deadline FROM posts WHERE global_id = $1`,
      [PostId],
    );
    check('kho về 0 thì xoá mốc như cũ', clock3.selection_deadline === null);

    // ── 9. Bài Muốn Nhận: huỷ hủy đúng request của người TẶNG ─────────────
    console.log('\n9. Bài Muốn Nhận — người xin là người tặng\n');
    await resetPost(WantedPostId, 'WANTED', 3);
    const w1 = await addRequest(WantedPostId, UserA, 2, 0);
    const wDeal = await accept(w1, WantedPostId);
    await transactions.close({
      transactionId: wDeal.transactionId,
      actorUserId: OwnerId,
      status: 'CANCELLED',
      reason: 'kiểm',
    });
    const wReq = await readRequest(w1);
    check(
      'huỷ lượt trao ở bài Muốn Nhận đóng ĐÚNG request của người tặng',
      wReq.status === 'CANCELLED' &&
        wReq.status_reason === 'TRANSACTION_CANCELLED',
      `${wReq.status}/${wReq.status_reason}`,
    );
    check(
      'và hoàn đúng 2 món',
      Number((await readPost(WantedPostId)).remaining_quantity) === 3,
    );
  } finally {
    await db.destroy();
    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} kiểm chứng THẤT BẠI:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    '\nXin nhận theo số lượng: không vượt kho, không trừ hai lần, không tự giảm số đã xin.',
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
