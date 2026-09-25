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
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
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
    await transactions.request({
      globalId: transactionId,
      postId,
      receiverId: ReceiverId,
      quantity: 1,
    });
    await transactions.accept(transactionId, GiverId);
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
      closedByCron === 0,
      `${closedByCron} lượt bị đóng`,
    );

    await dataSource.query(
      `UPDATE gift_transactions
       SET handed_over_at = now() - interval '6 days'
       WHERE global_id = $1`,
      [shipped],
    );
    check(
      'trao 6 ngày trước thì bị đóng',
      (await transactions.completeDueDeliveries(5)) === 1,
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
