/**
 * Kiểm hai câu quét lời nhắc trên Postgres THẬT.
 *
 * Bốn thứ unit test mock không thấy được:
 *
 * 1. Cửa sổ HAI đầu của lời nhắc đánh giá: đã qua `remindAfterDays` nhưng chưa
 *    quá `graceDays`. Sai một dấu là nhắc người vừa nhận hàng hôm nay, hoặc nhắc
 *    một việc hệ thống đã áp mức mặc định rồi.
 * 2. `days_left` tính đúng, vì nó đi thẳng vào nội dung thông báo.
 * 3. `reminded_at` thật sự chặn vòng quét sau.
 * 4. `findTargetOwner` tra đúng cột cho từng loại đích — `posts.author_id`,
 *    `content_comments.author_id`, và chính `targetId` khi đích là người.
 */
import { ReportTargetTypes } from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { RankRepository } from '../src/infrastructure/repository/rank.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { ReportRepository } from '../src/infrastructure/repository/report.repository';
import { TransactionReviewRepository } from '../src/infrastructure/repository/transaction-review.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_reminders_check';
const CategoryId = '30000000-0000-4000-8000-0000000d0001';
const GiverId = '99999999-9999-4999-8999-9999999d1001';
const ReceiverId = '99999999-9999-4999-8999-9999999d1002';
const PostId = '88888888-8888-4888-8888-8888888d1001';
const CommentId = '77777777-7777-4777-8777-7777777d1001';

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
    adminConfig,
  );
  const ranks = new RankRepository(dataSource.manager, {
    countCompletedGifts: async () => ({ available: true, completedGifts: 0 }),
    countLifetimeCompletedGifts: async () => ({
      available: true,
      completedGifts: 0,
    }),
  } as never);
  const reports = new ReportRepository(
    entities.ReportEntity as never,
    dataSource.manager,
    new PointLedgerRepository(dataSource.manager),
  );

  async function seedDeal(
    id: string,
    completedDaysAgo: number,
  ): Promise<string> {
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status,
          accepted_at, completed_at)
       VALUES ($1, $2, $3, $4, 1, 'COMPLETED',
               now() - ($5 || ' days')::interval,
               now() - ($5 || ' days')::interval)`,
      [id, PostId, GiverId, ReceiverId, String(completedDaysAgo)],
    );
    return id;
  }

  try {
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm nhắc', 'kiem-nhac', true)`,
      [CategoryId],
    );
    for (const [id, name] of [
      [GiverId, 'nguoi-tang-nhac'],
      [ReceiverId, 'nguoi-nhan-nhac'],
    ] as const)
      await dataSource.query(
        `INSERT INTO users (global_id, username, email, password_hash, rank, status)
         VALUES ($1, $2, $3, 'x', 'SILVER', 'ACTIVE')`,
        [id, name, `${name}@chantam.test`],
      );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm nhắc', 'Mô tả đủ dài cho bài kiểm',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'COMPLETED', 9, 9, '{}'::jsonb, 0)`,
      [PostId, GiverId, CategoryId],
    );

    console.log('1. Cửa sổ nhắc đánh giá có hai đầu');
    const tooFresh = await seedDeal('66666666-6666-4666-8666-6666666d0001', 1);
    const inWindow = await seedDeal('66666666-6666-4666-8666-6666666d0002', 4);
    const tooLate = await seedDeal('66666666-6666-4666-8666-6666666d0003', 20);

    const pending = await reviews.findPendingReviewReminders({
      graceDays: 7,
      remindAfterDays: 2,
      limit: 100,
    });
    const ids = new Set(pending.map((row) => row.transactionId));

    check(
      'hoàn tất 1 ngày trước thì CHƯA nhắc — họ còn chưa mở hộp',
      !ids.has(tooFresh),
    );
    check('hoàn tất 4 ngày trước thì nhắc', ids.has(inWindow));
    check(
      'hoàn tất 20 ngày trước thì KHÔNG nhắc — đã áp mức mặc định rồi',
      !ids.has(tooLate),
    );

    const target = pending.find((row) => row.transactionId === inWindow);
    check(
      'gửi cho NGƯỜI NHẬN, không phải người tặng',
      target?.receiverId === ReceiverId,
      target?.receiverId,
    );
    check(
      'days_left tính đúng: 7 − 4 = 3',
      target?.daysLeft === 3,
      `daysLeft=${target?.daysLeft}`,
    );

    console.log('\n2. Đã đánh giá thì thôi nhắc');
    await dataSource.query(
      `INSERT INTO transaction_reviews
         (global_id, transaction_id, reviewer_id, reviewee_id, reviewer_role,
          rating, accuracy_percent)
       VALUES (gen_random_uuid(), $1, $2, $3, 'RECEIVER', 5, 90)`,
      [inWindow, ReceiverId, GiverId],
    );
    const afterReview = await reviews.findPendingReviewReminders({
      graceDays: 7,
      remindAfterDays: 2,
      limit: 100,
    });
    check(
      'lượt đã đánh giá rời khỏi danh sách',
      !afterReview.some((row) => row.transactionId === inWindow),
    );

    console.log('\n3. Chu kỳ duy trì sắp hết');
    // Còn 20 ngày → trong cửa sổ 30 ngày.
    await dataSource.query(
      `INSERT INTO rank_maintenance_cycles
         (user_id, rank, cycle_start, cycle_end, required_gifts,
          required_referrals, policy_version, status, referrals_done)
       VALUES ($1, 'SILVER', now() - interval '70 days',
               now() + interval '20 days', 2, 2, 1, 'OPEN', 1)`,
      [GiverId],
    );
    // Còn 60 ngày → NGOÀI cửa sổ.
    await dataSource.query(
      `INSERT INTO rank_maintenance_cycles
         (user_id, rank, cycle_start, cycle_end, required_gifts,
          required_referrals, policy_version, status)
       VALUES ($1, 'SILVER', now() - interval '30 days',
               now() + interval '60 days', 2, 2, 1, 'OPEN')`,
      [ReceiverId],
    );

    const cycles = await ranks.findCyclesNeedingReminder({
      remindBeforeDays: 30,
      limit: 100,
    });
    check(
      'chỉ chu kỳ trong cửa sổ 30 ngày',
      cycles.length === 1,
      `${cycles.length} chu kỳ`,
    );
    const cycle = cycles[0];
    check('đúng người', cycle?.userId === GiverId, cycle?.userId);
    check(
      'days_left khoảng 20',
      cycle?.daysLeft === 20,
      `daysLeft=${cycle?.daysLeft}`,
    );
    // Tiến độ phải đếm SỐNG, không đọc hai cột `gifts_done`/`referrals_done`.
    //
    // Hai cột đó chỉ được ghi ở bước ĐÁNH GIÁ, tức lúc chu kỳ đóng; lời nhắc gửi
    // 30 ngày trước đó nên chúng luôn là 0, và lời nhắc đi ra với nội dung "bạn đã
    // hoàn tất 0/2 lượt trao" kể cả với người đã trao xong. Sửa 29/09.
    //
    // Fixture dựng riêng để phân biệt được hai cách đọc:
    //
    // - `gifts_done` lưu sẵn là 0, nhưng trong cửa sổ chu kỳ có 3 lượt trao đã
    //   hoàn tất thật → đọc sống phải ra 3.
    // - `referrals_done` lưu sẵn là **1**, nhưng KHÔNG có lượt giới thiệu nào hợp
    //   lệ trong cửa sổ → đọc sống phải ra 0. Con số 1 đó nằm đây chính là để bắt
    //   trường hợp ai đó quay về đọc cột cũ.
    check(
      'giftsDone đếm SỐNG trong cửa sổ chu kỳ, không đọc cột lưu sẵn',
      cycle?.giftsDone === 3,
      `nhận ${String(cycle?.giftsDone)}, cột lưu sẵn là 0`,
    );
    check(
      'referralsDone cũng đếm SỐNG — BỎ QUA giá trị 1 lưu trong cột',
      cycle?.referralsDone === 0,
      `nhận ${String(cycle?.referralsDone)}, cột lưu sẵn là 1`,
    );
    check(
      'kèm chỉ tiêu để lời nhắc nói được còn thiếu bao nhiêu',
      cycle?.requiredGifts === 2 && cycle?.requiredReferrals === 2,
      `gifts ${cycle?.giftsDone}/${cycle?.requiredGifts}, referrals ${cycle?.referralsDone}/${cycle?.requiredReferrals}`,
    );
    check(
      'kèm mức phạt theo bậc Bạc (224)',
      cycle?.penaltyPoints === 224,
      `${cycle?.penaltyPoints}`,
    );

    console.log('\n4. reminded_at chặn vòng quét sau');
    await ranks.markCyclesReminded([cycle.cycleId]);
    const afterMark = await ranks.findCyclesNeedingReminder({
      remindBeforeDays: 30,
      limit: 100,
    });
    check(
      'chu kỳ đã nhắc rời khỏi danh sách',
      !afterMark.some((row) => row.cycleId === cycle.cycleId),
    );
    check('gọi lại markCyclesReminded không nổ', true);
    await ranks.markCyclesReminded([]);

    console.log('\n5. findTargetOwner tra đúng cột');
    check(
      'đích POST → posts.author_id',
      (await reports.findTargetOwner(ReportTargetTypes.POST, PostId)) ===
        GiverId,
    );
    check(
      'đích USER → chính targetId, không tra bảng nào',
      (await reports.findTargetOwner(ReportTargetTypes.USER, ReceiverId)) ===
        ReceiverId,
    );

    await dataSource.query(
      `INSERT INTO content_comments
         (global_id, subject_type, subject_id, author_id, body, status, depth)
       VALUES ($1, 'POST', $2, $3, 'Một bình luận', 'VISIBLE', 1)`,
      [CommentId, PostId, ReceiverId],
    );
    check(
      'đích COMMENT → content_comments.author_id',
      (await reports.findTargetOwner(ReportTargetTypes.COMMENT, CommentId)) ===
        ReceiverId,
    );
    check(
      'đích không tồn tại → null, không ném',
      (await reports.findTargetOwner(
        ReportTargetTypes.POST,
        '88888888-8888-4888-8888-888888880000',
      )) === null,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Lời nhắc: cửa sổ đúng hai đầu, không nhắc trùng, tra đúng chủ nội dung'
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
