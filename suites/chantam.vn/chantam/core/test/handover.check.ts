/**
 * Kiểm bước trao đồ, ảnh bằng chứng, và report đóng lượt trao — Postgres THẬT.
 *
 * Ba thứ chỉ database thật trả lời được:
 *
 *   1. **Trần ba ảnh mỗi mốc do DATABASE giữ**, bằng `slot` 1–3 + UNIQUE, chứ
 *      không phải một phép đếm ở tầng ứng dụng vốn thua cuộc khi hai request
 *      vào cùng lúc.
 *   2. **Đồng hồ tự hoàn tất đếm từ `handed_over_at`.** Trước đây đếm từ
 *      `accepted_at`, nên ship liên tỉnh 4–5 ngày bị cron đóng trước khi hàng
 *      tới nơi. Muốn thấy khác biệt phải có dữ liệu ngày tháng thật.
 *   3. **Báo hoàn hàng thì đóng luôn lượt trao.** Không đóng thì cron đánh dấu
 *      COMPLETED sau 5 ngày — người nhận vừa bị trừ điểm vừa được ghi công đã
 *      nhận quà.
 *
 *   npm run test:handover
 */
import {
  GiftEvidenceKinds,
  ShipUnpaidPenaltyRuleCode,
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

const ScratchDatabase = 'chantam_handover_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const GiverId = '99999999-9999-4999-8999-99999999e001';
const ReceiverId = '99999999-9999-4999-8999-99999999e002';

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

  const transactions = new GiftTransactionRepository(
    dataSource.manager,
    new ChatRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    ),
    new PointLedgerRepository(dataSource.manager),
    // `CheckInRepository` là tham số thật, không mock: ở đây chưa publish policy F83 nào nên
    // `accrueFromCompletedTransaction` thoát sớm. Nhờ vậy tám script này canh luôn
    // nhánh "tính năng tắt thì KHÔNG tích lượt bù" mà không phải viết gì thêm.
    new CheckInRepository(
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
    ),
    new AffiliateRepository(
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
      new AdminConfigRepository(dataSource.manager),
    ),
  );

  let sequence = 0;

  async function acceptedTransaction(
    shipPayer: 'GIVER' | 'RECEIVER' | null = 'RECEIVER',
  ): Promise<string> {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const postId = `88888888-8888-4888-8888-88888888e${suffix}`;
    const transactionId = `55555555-5555-4555-8555-55555555e${suffix}`;

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count, delivery_method, ship_payer)
       VALUES ($1, 'OFFER', $2, $3, $4, 'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0,
               $5::posts_delivery_method_enum, $6::posts_ship_payer_enum)`,
      [
        postId,
        GiverId,
        CategoryId,
        `Bài kiểm trao đồ ${sequence}`,
        shipPayer ? 'GIVER_SHIPS' : 'SELF_PICKUP',
        shipPayer,
      ],
    );
    // Dựng thẳng bản ghi ở ACCEPTED, đúng hình dạng mà `acceptRequest` của
    // luồng xin nhận ghi ra. Trước 28/09 chỗ này gọi `transactions.request()`
    // rồi `.accept()` — cửa phụ đó đã gỡ vì nó tạo lượt trao mà bỏ qua mọi cổng
    // của luồng xin nhận. Đây là FIXTURE, còn thứ script này kiểm là bàn giao và
    // báo bom ship, không phải đường tạo ra lượt trao.
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at)
       VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())`,
      [transactionId, postId, GiverId, ReceiverId],
    );
    // `acceptRequest` trừ kho trong cùng transaction; giữ cho fixture khớp,
    // nếu không `syncPostStatus` sẽ thấy bài còn hàng và tính sai trạng thái.
    await dataSource.query(
      `UPDATE posts SET remaining_quantity = GREATEST(0, remaining_quantity - 1)
       WHERE global_id = $1`,
      [postId],
    );
    return transactionId;
  }

  try {
    const users: [string, string][] = [
      [GiverId, 'nguoitang_trao'],
      [ReceiverId, 'nguoinhan_trao'],
    ];
    for (const [id, username] of users)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    // ── 1. Bước trao đồ ─────────────────────────────────────────────────────
    console.log('Người tặng báo đã trao:\n');

    const first = await acceptedTransaction();
    const handed = await transactions.markHandedOver({
      transactionId: first,
      giverId: GiverId,
      evidenceKeys: [
        `users/${GiverId}/transactions/${first}/evidence/a.webp`,
        `users/${GiverId}/transactions/${first}/evidence/b.webp`,
      ],
    });

    check(
      'sang DELIVERING — trạng thái trước đây không ai chuyển tới được',
      handed.status === 'DELIVERING',
      String(handed.status),
    );
    check(
      'ghi mốc handedOverAt',
      handed.handedOverAt !== null,
      String(handed.handedOverAt),
    );
    check(
      'hai ảnh được đính',
      (await transactions.listEvidence(first)).length === 2,
    );
    check(
      'ảnh mang đúng loại HANDOVER',
      await transactions.hasEvidence(first, GiftEvidenceKinds.HANDOVER),
    );

    let receiverBlocked = false;
    try {
      await transactions.markHandedOver({
        transactionId: first,
        giverId: ReceiverId,
        evidenceKeys: [],
      });
    } catch {
      receiverBlocked = true;
    }
    check('người nhận KHÔNG báo trao hộ được', receiverBlocked);

    // ── 2. Trần ba ảnh do database giữ ──────────────────────────────────────
    console.log('\nTrần ba ảnh mỗi mốc:\n');

    await dataSource.manager.transaction(async (manager) => {
      await transactions.attachEvidenceWithinTransaction(manager, {
        transactionId: first,
        kind: GiftEvidenceKinds.HANDOVER,
        uploadedBy: GiverId,
        storageKeys: [
          `users/${GiverId}/transactions/${first}/evidence/c.webp`,
          `users/${GiverId}/transactions/${first}/evidence/d.webp`,
          `users/${GiverId}/transactions/${first}/evidence/e.webp`,
        ],
      });
    });
    const handoverShots = (await transactions.listEvidence(first)).filter(
      (item) => item.kind === GiftEvidenceKinds.HANDOVER,
    );
    check(
      'gửi thêm 3 tấm khi đã có 2 thì chỉ nhận đúng 1, dừng ở trần',
      handoverShots.length === 3,
      `${handoverShots.length} tấm`,
    );
    check(
      'slot chạy 1..3, không trùng',
      handoverShots.map((item) => item.slot).join(',') === '1,2,3',
      handoverShots.map((item) => item.slot).join(','),
    );

    let slotRejected = false;
    try {
      await dataSource.query(
        `INSERT INTO gift_transaction_evidence
           (global_id, transaction_id, kind, slot, uploaded_by, storage_key)
         VALUES (gen_random_uuid(), $1, 'HANDOVER', 4, $2, 'khong-hop-le')`,
        [first, GiverId],
      );
    } catch {
      slotRejected = true;
    }
    check('DATABASE chặn tấm thứ tư, không chỉ tầng ứng dụng', slotRejected);

    let evidenceDeleteBlocked = false;
    try {
      await dataSource.query(
        `DELETE FROM gift_transaction_evidence WHERE transaction_id = $1`,
        [first],
      );
    } catch {
      evidenceDeleteBlocked = true;
    }
    check('bằng chứng chỉ ghi thêm, xoá bị chặn', evidenceDeleteBlocked);

    // ── 3. Đồng hồ tự hoàn tất đếm từ lúc trao ──────────────────────────────
    console.log('\nĐồng hồ tự hoàn tất:\n');

    const shipped = await acceptedTransaction();
    await transactions.markHandedOver({
      transactionId: shipped,
      giverId: GiverId,
      evidenceKeys: [],
    });
    // Duyệt từ 10 ngày trước, nhưng MỚI trao hôm nay: hàng còn đang trên đường.
    await dataSource.query(
      `UPDATE gift_transactions
       SET accepted_at = now() - interval '10 days', handed_over_at = now()
       WHERE global_id = $1`,
      [shipped],
    );

    const closedByCron = await transactions.completeDueDeliveries(5);
    check(
      'duyệt 10 ngày trước nhưng mới trao hôm nay thì KHÔNG bị đóng',
      closedByCron.completed === 0,
      `${closedByCron.completed} lượt bị đóng`,
    );

    await dataSource.query(
      `UPDATE gift_transactions
       SET handed_over_at = now() - interval '6 days'
       WHERE global_id = $1`,
      [shipped],
    );
    // Báo xấu ĐANG MỞ vào bài thì giữ lại, không đóng: đánh một lượt trao đang
    // bị nghi là "thành công" vừa cộng điểm cho người có thể gian lận, vừa ghi
    // công người nhận đã nhận món đồ mà họ chưa nhận.
    await dataSource.query(
      `INSERT INTO reports
         (global_id, reporter_user_id, target_type, target_id, reason, description, status)
       SELECT gen_random_uuid(), $1, 'POST', deal.post_id, 'SCAM', 'Nghi lừa đảo', 'PENDING'
       FROM gift_transactions deal WHERE deal.global_id = $2`,
      [ReceiverId, shipped],
    );
    const held = await transactions.completeDueDeliveries(5);
    check(
      'đang có báo xấu chưa xử thì GIỮ LẠI, không đóng',
      held.completed === 0 && held.heldForDispute === 1,
      `completed=${held.completed} held=${held.heldForDispute}`,
    );

    // Admin đóng báo xấu → lần chạy sau tự xử lý, không cần hàng đợi riêng.
    await dataSource.query(
      `UPDATE reports SET status = 'DISMISSED'
       WHERE target_id = (
         SELECT post_id FROM gift_transactions WHERE global_id = $1
       )`,
      [shipped],
    );
    const afterResolved = await transactions.completeDueDeliveries(5);
    check(
      'báo xấu đã xử xong thì lần chạy sau đóng bình thường',
      afterResolved.completed === 1 && afterResolved.heldForDispute === 0,
      `completed=${afterResolved.completed} held=${afterResolved.heldForDispute}`,
    );

    // ── 4. Báo hoàn hàng đóng lượt trao ─────────────────────────────────────
    console.log('\nBáo hàng bị hoàn:\n');

    const reported = await acceptedTransaction();
    await transactions.markHandedOver({
      transactionId: reported,
      giverId: GiverId,
      evidenceKeys: [
        `users/${GiverId}/transactions/${reported}/evidence/ship.webp`,
      ],
    });

    const ledger = new PointLedgerRepository(dataSource.manager);
    await ledger.appendByRule({
      userId: ReceiverId,
      ruleCode: ShipUnpaidPenaltyRuleCode,
      referenceType: 'GIFT_TRANSACTION',
      referenceId: reported,
      idempotencyKey: `${ShipUnpaidPenaltyRuleCode}:${reported}`,
      actor: GiverId,
      source: 'SHIP_REPORT',
      reason: 'Hàng bị hoàn, người nhận không thanh toán phí ship',
    });
    const closed = await transactions.close({
      transactionId: reported,
      actorUserId: GiverId,
      status: 'CANCELLED',
      reason: 'Hàng bị hoàn, người nhận không thanh toán phí ship',
      closedByUserId: ReceiverId,
      evidence: {
        kind: GiftEvidenceKinds.RETURNED,
        uploadedBy: GiverId,
        storageKeys: [
          `users/${GiverId}/transactions/${reported}/evidence/hoan.webp`,
        ],
      },
    });

    check(
      'lượt trao bị ĐÓNG, không để cron đánh dấu thành công sau 5 ngày',
      closed.transaction.status === 'CANCELLED',
      String(closed.transaction.status),
    );
    check(
      'lượt huỷ tính cho NGƯỜI NHẬN, không phải người bấm báo',
      (
        await dataSource.query<{ closed_by: string }[]>(
          `SELECT closed_by FROM gift_transactions WHERE global_id = $1`,
          [reported],
        )
      )[0].closed_by === ReceiverId,
    );
    check(
      'và nó chảy vào bộ đếm huỷ của người nhận (tiêu chí CH-1)',
      (await transactions.countClosedBy(ReceiverId, 'CANCELLED')) === 1,
    );
    check(
      'ảnh hàng hoàn được ghi trong CÙNG transaction đóng lượt trao',
      await transactions.hasEvidence(reported, GiftEvidenceKinds.RETURNED),
    );

    // Quét với ngưỡng 0 ngày để cron ăn MỌI lượt còn mở — cách thô bạo nhất để
    // xem lượt đã đóng có bị kéo ngược lại không. Đếm tổng số lượt cron đóng là vô
    // nghĩa ở đây (nó đóng cả những lượt khác của script); phải hỏi đích danh.
    await transactions.completeDueDeliveries(0);
    check(
      'cron không hồi sinh lượt đã đóng thành COMPLETED',
      (
        await dataSource.query<{ status: string }[]>(
          `SELECT status FROM gift_transactions WHERE global_id = $1`,
          [reported],
        )
      )[0].status === 'CANCELLED',
    );
    check(
      'tồn kho được trả lại cho người tặng',
      Number(
        (
          await dataSource.query<{ remaining_quantity: string }[]>(
            `SELECT p.remaining_quantity FROM posts p
             JOIN gift_transactions t ON t.post_id = p.global_id
             WHERE t.global_id = $1`,
            [reported],
          )
        )[0].remaining_quantity,
      ) === 1,
    );
    // ── Mở lại lượt đóng nhầm ───────────────────────────────────────────────
    //
    // Tồn kho là chỗ dễ sai nhất và chỉ sai trên database thật: duyệt yêu cầu
    // đã TRỪ kho, huỷ thì TRẢ lại, còn hoàn tất thì KHÔNG trả. Nên mở lại một
    // lượt CANCELLED phải trừ lần nữa, mở lại một lượt COMPLETED thì không.
    console.log('\nMở lại lượt đóng nhầm:\n');

    async function remaining(postId: string): Promise<number> {
      const [row] = await dataSource.query<{ remaining_quantity: number }[]>(
        `SELECT remaining_quantity FROM posts WHERE global_id = $1`,
        [postId],
      );
      return Number(row.remaining_quantity);
    }

    async function postIdOf(transactionId: string): Promise<string> {
      const [row] = await dataSource.query<{ post_id: string }[]>(
        `SELECT post_id FROM gift_transactions WHERE global_id = $1`,
        [transactionId],
      );
      return row.post_id;
    }

    // 1. Mở lại một lượt ĐÃ HUỶ: kho phải bị trừ lại.
    const cancelledDeal = await acceptedTransaction();
    const cancelledPost = await postIdOf(cancelledDeal);
    await transactions.close({
      transactionId: cancelledDeal,
      actorUserId: GiverId,
      status: 'CANCELLED',
      reason: 'Kiểm mở lại',
    });
    const afterCancel = await remaining(cancelledPost);

    const reopenedCancelled = await transactions.reopen({
      transactionId: cancelledDeal,
      actorUserId: GiverId,
      reason: 'Huỷ nhầm',
    });
    check(
      'lượt ĐÃ HUỶ mở lại về ACCEPTED',
      reopenedCancelled.status === 'ACCEPTED',
      reopenedCancelled.status,
    );
    check(
      'và kho bị TRỪ lại — huỷ đã trả kho nên mở lại phải lấy về',
      (await remaining(cancelledPost)) === afterCancel - 1,
      `${afterCancel} → ${await remaining(cancelledPost)}`,
    );
    check('mốc đóng được xoá sạch', reopenedCancelled.completedAt === null);

    // 2. Mở lại một lượt ĐÃ HOÀN TẤT: kho KHÔNG được trừ thêm lần nữa.
    const doneDeal = await acceptedTransaction();
    const donePost = await postIdOf(doneDeal);
    // Fixture dựng lượt trao bằng SQL nên chưa có phòng chat. Mở một phòng thật
    // ở đây để phép kiểm bên dưới chứng minh được `reopen` mở khoá nó — không
    // có phòng thì `lockRoomWithinTransaction` lẫn `reopenRoom...` đều chỉ là
    // câu UPDATE không khớp dòng nào, và hai phép kiểm sẽ xanh một cách rỗng.
    await dataSource.query(
      `INSERT INTO chat_rooms
         (global_id, transaction_id, post_id, giver_id, receiver_id, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
      [
        '66666666-6666-4666-8666-666666666001',
        doneDeal,
        donePost,
        GiverId,
        ReceiverId,
      ],
    );
    await transactions.markHandedOver({
      transactionId: doneDeal,
      giverId: GiverId,
      evidenceKeys: [],
    });
    await transactions.confirmReceipt(doneDeal, ReceiverId, []);
    const afterComplete = await remaining(donePost);

    const reopenedDone = await transactions.reopen({
      transactionId: doneDeal,
      actorUserId: GiverId,
      reason: 'Cron đóng nhầm',
    });
    check(
      'lượt ĐÃ HOÀN TẤT có mốc bàn giao thì mở lại về DELIVERING, không về đầu',
      reopenedDone.status === 'DELIVERING',
      reopenedDone.status,
    );
    check(
      'và kho ĐỨNG YÊN — hoàn tất chưa bao giờ trả kho',
      (await remaining(donePost)) === afterComplete,
      `${afterComplete} → ${await remaining(donePost)}`,
    );

    // 3. Phòng chat mở lại và đồng hồ xoá bị huỷ.
    const [room] = await dataSource.query<
      { status: string; purge_after: string | null }[]
    >(
      `SELECT status, purge_after::text FROM chat_rooms WHERE transaction_id = $1`,
      [doneDeal],
    );
    check('phòng chat mở lại', room?.status === 'OPEN', String(room?.status));
    check(
      'và đồng hồ xoá bị HUỶ — mở lại một cuộc rồi vẫn xoá nó là vô nghĩa',
      room?.purge_after === null,
      String(room?.purge_after),
    );

    // 4. Có vết audit.
    const [audit] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM admin_audit_logs
       WHERE action = 'REOPEN_TRANSACTION' AND resource_id = $1`,
      [doneDeal],
    );
    check('ghi audit REOPEN_TRANSACTION', Number(audit.count) === 1);

    // 5. Lượt đang sống thì KHÔNG mở lại được.
    let rejected = false;
    try {
      await transactions.reopen({
        transactionId: reopenedDone.globalId,
        actorUserId: GiverId,
        reason: 'Mở lại lần nữa',
      });
    } catch {
      rejected = true;
    }
    check('lượt đang DELIVERING thì từ chối mở lại', rejected);

    // ── Gỡ bài khi còn lượt trao sống ───────────────────────────────────────
    //
    // Cổng chặn ở `DeletePostUseCase` đọc TRẠNG THÁI BÀI, mà `syncPostStatus`
    // giữ bài ở PUBLISHED chừng nào còn hàng. Nên một bài số lượng nhiều đã
    // duyệt một người VẪN gỡ được — và điều kiện cũ của
    // `closeOpenRequestsForPost` (`status = 'REQUESTED'`) không khớp dòng nào,
    // nên lượt trao đó bị bỏ lại: phòng chat vẫn mở, và cron vẫn có thể đánh nó
    // thành COMPLETED trên một bài đã biến mất.
    console.log('\nGỡ bài khi còn lượt trao sống:\n');

    const liveDeal = await acceptedTransaction();
    const livePost = await postIdOf(liveDeal);
    await dataSource.query(
      `INSERT INTO chat_rooms
         (global_id, transaction_id, post_id, giver_id, receiver_id, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
      [
        '66666666-6666-4666-8666-666666666002',
        liveDeal,
        livePost,
        GiverId,
        ReceiverId,
      ],
    );

    const closedByDelete = await transactions.closeOpenRequestsForPost({
      postId: livePost,
      closedBy: GiverId,
      reason: 'Người đăng đã gỡ bài',
    });
    check(
      'lượt trao ĐANG SỐNG bị đóng theo bài — điều kiện cũ để lọt hết',
      closedByDelete.length === 1 &&
        closedByDelete[0].transactionId === liveDeal,
      `${closedByDelete.length} lượt`,
    );

    const [liveRow] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM gift_transactions WHERE global_id = $1`,
      [liveDeal],
    );
    check(
      'và ghi xuống database thật',
      liveRow?.status === 'CANCELLED',
      String(liveRow?.status),
    );

    const [liveRoom] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM chat_rooms WHERE transaction_id = $1`,
      [liveDeal],
    );
    check(
      'phòng chat khoá theo — không thì hai người vẫn nhắn về một bài đã biến mất',
      liveRoom?.status === 'READ_ONLY',
      String(liveRoom?.status),
    );

    const doneAgain = await transactions.closeOpenRequestsForPost({
      postId: livePost,
      closedBy: GiverId,
      reason: 'Gọi lại',
    });
    check('gọi lại không đóng thêm gì', doneAgain.length === 0);
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
    '\nBước trao đồ, ảnh bằng chứng và report đều bám đúng thiết kế.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
