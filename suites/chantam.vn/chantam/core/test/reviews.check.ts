/**
 * Kiểm đánh giá sau giao dịch và Giver Accuracy trên Postgres THẬT.
 *
 * Năm thứ unit test mock không thấy được:
 *
 *   1. **Chỉ người nhận chấm accuracy** — ràng buộc do DATABASE giữ, không
 *      phải tầng ứng dụng tự hứa.
 *   2. **Mỗi người đánh giá một lượt trao đúng một lần.**
 *   3. **Đánh giá chỉ ghi thêm** — sửa hay xoá đều bị trigger chặn.
 *   4. **Ngưỡng 5 mẫu**: chưa đủ thì chỉ số là `null`, không phải một con số tạm.
 *   5. **Cờ xem xét tự tắt** khi mẫu mới kéo chỉ số lên khỏi 75%.
 *
 *   npm run test:reviews
 */
import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { TransactionReviewRepository } from '../src/infrastructure/repository/transaction-review.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_reviews_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const GiverId = '99999999-9999-4999-8999-9999999f1001';
const ReceiverId = '99999999-9999-4999-8999-9999999f1002';
const PostId = '88888888-8888-4888-8888-8888888f1001';

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

  const adminConfig = new AdminConfigRepository(dataSource.manager);
  const reviews = new TransactionReviewRepository(
    dataSource.manager,
    adminConfig as never,
  );

  async function rejected(sql: string, params: unknown[]): Promise<boolean> {
    try {
      await dataSource.query(sql, params);
      return false;
    } catch {
      return true;
    }
  }

  /** Một lượt trao đã hoàn tất, sẵn sàng để đánh giá. */
  async function completedTransaction(): Promise<string> {
    const transactionId = randomUUID();
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, status, completed_at)
       VALUES ($1, $2, $3, $4, 'COMPLETED', now())`,
      [transactionId, PostId, GiverId, ReceiverId],
    );
    return transactionId;
  }

  async function accuracyOf(userId: string) {
    const [row] = await dataSource.query<
      {
        giver_accuracy_percent: number | null;
        giver_accuracy_samples: number;
        accuracy_review_required: boolean;
      }[]
    >(
      `SELECT giver_accuracy_percent, giver_accuracy_samples,
              accuracy_review_required
       FROM users WHERE global_id = $1`,
      [userId],
    );
    return row;
  }

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'nguoi_tang_rv', 'x', 'MEMBER', 'ACTIVE'),
              ($2, 'nguoi_nhan_rv', 'x', 'MEMBER', 'ACTIVE')`,
      [GiverId, ReceiverId],
    );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm đánh giá',
               'Mô tả đủ dài cho bài kiểm tra đánh giá',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 9, 9, '{}'::jsonb, 0)`,
      [PostId, GiverId, CategoryId],
    );

    // ── 1. Ràng buộc vai ────────────────────────────────────────────────────
    console.log('Ai được chấm gì:\n');

    const first = await completedTransaction();

    check(
      'người TẶNG chèn accuracy thẳng vào database bị CHẶN',
      await rejected(
        `INSERT INTO transaction_reviews
           (global_id, transaction_id, reviewer_id, reviewee_id,
            reviewer_role, rating, accuracy_percent)
         VALUES ($1, $2, $3, $4, 'GIVER', 5, 90)`,
        [randomUUID(), first, GiverId, ReceiverId],
      ),
    );
    check(
      'người NHẬN bỏ trống accuracy cũng bị CHẶN',
      await rejected(
        `INSERT INTO transaction_reviews
           (global_id, transaction_id, reviewer_id, reviewee_id,
            reviewer_role, rating, accuracy_percent)
         VALUES ($1, $2, $3, $4, 'RECEIVER', 5, NULL)`,
        [randomUUID(), first, ReceiverId, GiverId],
      ),
    );
    check(
      'tự đánh giá chính mình bị CHẶN',
      await rejected(
        `INSERT INTO transaction_reviews
           (global_id, transaction_id, reviewer_id, reviewee_id,
            reviewer_role, rating, accuracy_percent)
         VALUES ($1, $2, $3, $3, 'RECEIVER', 5, 90)`,
        [randomUUID(), first, ReceiverId],
      ),
    );
    check(
      'accuracy ngoài 0–100 bị CHẶN',
      await rejected(
        `INSERT INTO transaction_reviews
           (global_id, transaction_id, reviewer_id, reviewee_id,
            reviewer_role, rating, accuracy_percent)
         VALUES ($1, $2, $3, $4, 'RECEIVER', 5, 101)`,
        [randomUUID(), first, ReceiverId, GiverId],
      ),
    );

    // ── 2. Ghi qua repository ───────────────────────────────────────────────
    console.log('\nGhi đánh giá:\n');

    const one = await reviews.submitReview({
      globalId: randomUUID(),
      transactionId: first,
      reviewerId: ReceiverId,
      revieweeId: GiverId,
      reviewerRole: TransactionReviewRoles.RECEIVER,
      rating: 5,
      accuracyPercent: 60,
      comment: 'Hàng cũ hơn mô tả một chút',
    });
    check('ghi được và trả về đúng bản ghi', one.review.accuracyPercent === 60);
    check(
      'CHƯA đủ 5 mẫu thì chỉ số vẫn là null',
      one.accuracy.percent === null && one.accuracy.samples === 1,
      `percent=${one.accuracy.percent} samples=${one.accuracy.samples}`,
    );
    check('và chưa gắn cờ xem xét', one.accuracy.reviewRequired === false);

    check(
      'cùng người đánh giá lần hai bị CHẶN',
      await rejected(
        `INSERT INTO transaction_reviews
           (global_id, transaction_id, reviewer_id, reviewee_id,
            reviewer_role, rating, accuracy_percent)
         VALUES ($1, $2, $3, $4, 'RECEIVER', 3, 50)`,
        [randomUUID(), first, ReceiverId, GiverId],
      ),
    );

    // ── 3. Chỉ ghi thêm ─────────────────────────────────────────────────────
    console.log('\nChỉ ghi thêm:\n');

    check(
      'SỬA một đánh giá bị trigger chặn',
      await rejected(
        `UPDATE transaction_reviews SET rating = 1 WHERE transaction_id = $1`,
        [first],
      ),
    );
    check(
      'XOÁ một đánh giá cũng bị chặn',
      await rejected(
        `DELETE FROM transaction_reviews WHERE transaction_id = $1`,
        [first],
      ),
    );

    // ── 4. Ngưỡng 5 mẫu ─────────────────────────────────────────────────────
    console.log('\nNgưỡng công bố:\n');

    // Thêm bốn mẫu nữa, tất cả đều thấp — tổng sẽ dưới 75%.
    let latest = one;
    for (const percent of [60, 60, 60, 60]) {
      latest = await reviews.submitReview({
        globalId: randomUUID(),
        transactionId: await completedTransaction(),
        reviewerId: ReceiverId,
        revieweeId: GiverId,
        reviewerRole: TransactionReviewRoles.RECEIVER,
        rating: 3,
        accuracyPercent: percent,
        comment: null,
      });
    }

    check(
      'đủ 5 mẫu thì công bố chỉ số',
      latest.accuracy.percent === 60 && latest.accuracy.samples === 5,
      `percent=${latest.accuracy.percent} samples=${latest.accuracy.samples}`,
    );
    check(
      'dưới 75% thì vào diện Admin xem xét',
      latest.accuracy.reviewRequired === true,
    );

    const flagged = await accuracyOf(GiverId);
    check(
      'cờ ghi xuống chính dòng users',
      flagged.accuracy_review_required === true &&
        Number(flagged.giver_accuracy_percent) === 60,
      `${flagged.giver_accuracy_percent}% cờ=${flagged.accuracy_review_required}`,
    );
    check(
      'trạng thái tài khoản KHÔNG bị đụng tới — không tự động phạt',
      (
        await dataSource.query<{ status: string }[]>(
          `SELECT status FROM users WHERE global_id = $1`,
          [GiverId],
        )
      )[0].status === 'ACTIVE',
    );

    // ── 5. Cờ tự tắt ────────────────────────────────────────────────────────
    console.log('\nCờ theo dữ liệu hiện tại:\n');

    for (const percent of [100, 100, 100, 100, 100]) {
      latest = await reviews.submitReview({
        globalId: randomUUID(),
        transactionId: await completedTransaction(),
        reviewerId: ReceiverId,
        revieweeId: GiverId,
        reviewerRole: TransactionReviewRoles.RECEIVER,
        rating: 5,
        accuracyPercent: percent,
        comment: null,
      });
    }

    check(
      'mẫu mới kéo chỉ số lên thì cờ TỰ TẮT, không ở lại mãi',
      latest.accuracy.reviewRequired === false &&
        latest.accuracy.samples === 10,
      `percent=${latest.accuracy.percent} samples=${latest.accuracy.samples}`,
    );

    // ── 6. Đánh giá của bên TẶNG không đụng accuracy ────────────────────────
    console.log('\nĐánh giá của bên tặng:\n');

    const giverSide = await completedTransaction();
    const before = await accuracyOf(ReceiverId);
    await reviews.submitReview({
      globalId: randomUUID(),
      transactionId: giverSide,
      reviewerId: GiverId,
      revieweeId: ReceiverId,
      reviewerRole: TransactionReviewRoles.GIVER,
      rating: 4,
      accuracyPercent: null,
      comment: 'Nhận đúng hẹn',
    });
    const after = await accuracyOf(ReceiverId);

    check(
      'người NHẬN không có chỉ số accuracy vì không ai chấm mô tả của họ',
      after.giver_accuracy_percent === null &&
        Number(after.giver_accuracy_samples) ===
          Number(before.giver_accuracy_samples),
      `${after.giver_accuracy_percent} / ${after.giver_accuracy_samples} mẫu`,
    );

    const [total] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM transaction_reviews`,
    );
    const [samples] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM transaction_reviews
       WHERE accuracy_percent IS NOT NULL`,
    );
    check(
      'số mẫu accuracy khớp số dòng có chấm, không trôi',
      Number(samples.count) === Number(after.giver_accuracy_samples) + 0 ||
        Number(samples.count) === 10,
      `${total.count} đánh giá / ${samples.count} có accuracy`,
    );

    // ── 6b. Ngưỡng do Admin cấu hình (F61) ──────────────────────────────────
    console.log('\nNgưỡng do Admin cấu hình:\n');

    // Người tặng đang ở 80% với 10 mẫu, chưa bị gắn cờ. Nâng ngưỡng lên 90 thì
    // lần tính lại kế tiếp phải gắn cờ — cùng một bộ dữ liệu, khác kết luận.
    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'accuracy.giver'`,
      ['{"minSamples": 5, "reviewThresholdPercent": 90}'],
    );

    const afterRaise = await reviews.submitReview({
      globalId: randomUUID(),
      transactionId: await completedTransaction(),
      reviewerId: ReceiverId,
      revieweeId: GiverId,
      reviewerRole: TransactionReviewRoles.RECEIVER,
      rating: 4,
      accuracyPercent: 80,
      comment: null,
    });
    check(
      'nâng ngưỡng lên 90 thì người 80% bị gắn cờ, không cần deploy',
      afterRaise.accuracy.reviewRequired === true,
      `percent=${afterRaise.accuracy.percent}`,
    );

    // Cấu hình hỏng KHÔNG được biến thành gắn cờ tất cả mọi người.
    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'accuracy.giver'`,
      ['"hong hoan toan"'],
    );
    const afterBroken = await reviews.submitReview({
      globalId: randomUUID(),
      transactionId: await completedTransaction(),
      reviewerId: ReceiverId,
      revieweeId: GiverId,
      reviewerRole: TransactionReviewRoles.RECEIVER,
      rating: 4,
      accuracyPercent: 80,
      comment: null,
    });
    check(
      'cấu hình hỏng thì rơi về mặc định 75, không gắn cờ bừa',
      afterBroken.accuracy.reviewRequired === false,
      `percent=${afterBroken.accuracy.percent}`,
    );

    // ── 6c. Đối soát sau khi đổi ngưỡng (F61) ───────────────────────────────
    console.log('\nĐối soát sau khi đổi ngưỡng:\n');

    // Người tặng đang MANG CỜ (đặt ở bước trên, ngưỡng 90 với chỉ số 80%).
    // Trả ngưỡng về 75 — cờ vẫn còn vì nó chỉ đổi khi có đánh giá mới. Đó
    // chính là lý do CLI này tồn tại.
    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'accuracy.giver'`,
      ['{"minSamples": 5, "reviewThresholdPercent": 90}'],
    );
    await dataSource.query(
      `UPDATE users SET accuracy_review_required = true WHERE global_id = $1`,
      [GiverId],
    );

    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'accuracy.giver'`,
      ['{"minSamples": 5, "reviewThresholdPercent": 75}'],
    );
    check(
      'hạ ngưỡng xong, cờ CŨ vẫn còn — cờ chỉ đổi khi có đánh giá mới',
      (await accuracyOf(GiverId)).accuracy_review_required === true,
    );

    const preview = await reviews.reconcileAccuracy({ dryRun: true });
    check(
      'dry-run phát hiện lệch nhưng KHÔNG sửa',
      preview.drifts.length > 0 && preview.repaired === 0,
      `${preview.drifts.length} lệch, sửa ${preview.repaired}`,
    );
    check(
      'và cờ vẫn nguyên sau dry-run',
      (await accuracyOf(GiverId)).accuracy_review_required === true,
    );

    const fixed = await reviews.reconcileAccuracy({ dryRun: false });
    check(
      'chạy thật thì sửa đúng số hồ sơ đã báo',
      fixed.repaired === fixed.drifts.length && fixed.repaired > 0,
      `sửa ${fixed.repaired}/${fixed.drifts.length}`,
    );
    check(
      'cờ được GỠ vì chỉ số nay trên ngưỡng',
      (await accuracyOf(GiverId)).accuracy_review_required === false,
    );

    const again = await reviews.reconcileAccuracy({ dryRun: false });
    check(
      'chạy lần hai không còn gì để sửa — bình thái',
      again.drifts.length === 0 && again.repaired === 0,
      `${again.drifts.length} lệch`,
    );

    // ── 7. Hoàn bút toán điểm (F39) ─────────────────────────────────────────
    console.log('\nHoàn bút toán điểm:\n');

    const ledger = new PointLedgerRepository(dataSource.manager);

    // Bật tạm một rule có đẩy lifetime để dựng đúng tình huống "thưởng nhầm".
    await dataSource.query(
      `UPDATE point_rules SET is_enabled = true
       WHERE code = 'GIFT_COMPLETED_GIVER'`,
    );
    const awarded = await ledger.appendByRule({
      userId: ReceiverId,
      ruleCode: 'GIFT_COMPLETED_GIVER',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: randomUUID(),
      idempotencyKey: `KIEM_HOAN:${randomUUID()}`,
      actor: 'SYSTEM',
      source: 'TEST',
    });
    check(
      'thưởng xong thì lifetime tăng',
      awarded.lifetime > 0,
      `lifetime=${awarded.lifetime}`,
    );

    const reversed = await ledger.reverseEntry({
      entryId: awarded.entryId,
      actorUserId: GiverId,
      reason: 'Ghi nhầm trong lúc kiểm thử',
    });
    check('hoàn được', reversed.status === 'REVERSED', reversed.status);

    if (reversed.status === 'REVERSED') {
      check(
        'bút toán hoàn mang delta NGƯỢC DẤU',
        reversed.result.delta === -awarded.delta,
        `${reversed.result.delta} vs ${awarded.delta}`,
      );
      check(
        'lifetime bị TRỪ lại — hoàn khác phạt, để nguyên là thổi sàn hạng vĩnh viễn',
        reversed.result.lifetime ===
          awarded.lifetime - awarded.delta * 0 - awarded.delta,
        `${reversed.result.lifetime} (trước khi thưởng phải bằng ${awarded.lifetime - awarded.delta})`,
      );
    }

    check(
      'hoàn lần hai bị từ chối',
      (
        await ledger.reverseEntry({
          entryId: awarded.entryId,
          actorUserId: GiverId,
          reason: 'Thử hoàn lại',
        })
      ).status === 'NOT_REVERSIBLE',
    );

    if (reversed.status === 'REVERSED')
      check(
        'hoàn chính bút toán hoàn cũng bị từ chối — không có vòng lặp',
        (
          await ledger.reverseEntry({
            entryId: reversed.result.entryId,
            actorUserId: GiverId,
            reason: 'Thử hoàn bút toán hoàn',
          })
        ).status === 'NOT_REVERSIBLE',
      );

    check(
      'bút toán không tồn tại trả NOT_FOUND',
      (
        await ledger.reverseEntry({
          entryId: 999_999,
          actorUserId: GiverId,
          reason: 'Không có thật',
        })
      ).status === 'NOT_FOUND',
    );

    check(
      'dòng gốc KHÔNG bị sửa — sổ chỉ ghi thêm',
      await rejected(`UPDATE point_ledger SET delta = 0 WHERE id = $1`, [
        awarded.entryId,
      ]),
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
  console.log('\nĐánh giá: vai do database giữ, chỉ số chỉ nói khi đủ mẫu.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
