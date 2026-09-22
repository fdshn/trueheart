/**
 * Kiểm hợp đồng `UPDATE ... RETURNING` trên Postgres THẬT.
 *
 * Vì sao cần script riêng: unit test của các repository này mock `query`, nên
 * chúng trả về đúng hình dạng mà người viết test tưởng tượng. 463 test đều
 * xanh cả TRƯỚC lẫn SAU khi sửa lỗi này — chúng không chứng minh được gì về
 * chỗ đó. Chỉ database thật mới phân biệt `[rows, affected]` với `rows`.
 *
 * Ba đường được kiểm là ba đường hỏng nặng nhất trước khi sửa:
 *   1. duyệt giao dịch không phát hiện hết hàng
 *   2. ghi nhận giới thiệu luôn báo "chưa đủ điều kiện" sau khi đã cộng điểm
 *   3. thăng hạng ghi `rank_transitions` cho lần thăng hạng không xảy ra
 *
 *   npm run test:returning
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
import { RankRepository } from '../src/infrastructure/repository/rank.repository';
import { ReferralRepository } from '../src/infrastructure/repository/referral.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_returning_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const GiverId = '99999999-9999-4999-8999-999999999001';
const ReceiverId = '99999999-9999-4999-8999-999999999002';
const ReferrerId = '99999999-9999-4999-8999-999999999003';
const RefereeId = '99999999-9999-4999-8999-999999999004';
const ViewerId = '99999999-9999-4999-8999-999999999005';
/**
 * Người riêng cho phần điểm âm.
 *
 * KHÔNG dùng lại người nhận ở trên: từ khi hoàn tất một lượt trao có thưởng
 * điểm, họ đã mang sẵn 28 điểm trước khi phần này chạy, nên các con số trong ví dụ
 * ("đang có 20, phạt 50, âm 30") không còn đúng. Gắn phép kiểm vào một con số do
 * phần khác của hệ thống quyết định là tự buộc mình sửa test mỗi lần rule đổi.
 */
const PenaltyUserId = '99999999-9999-4999-8999-999999999006';

const PostId = '88888888-8888-4888-8888-888888888001';
const TransactionId = '55555555-5555-4555-8555-555555555001';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function countRows(
  dataSource: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const [row] = await dataSource.query<{ count: string }[]>(sql, params);
  return Number(row.count);
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

  try {
    const users: [string, string, string][] = [
      [GiverId, 'nguoitang', 'MEMBER'],
      [ReceiverId, 'nguoinhan', 'MEMBER'],
      [ReferrerId, 'nguoigioithieu', 'MEMBER'],
      [RefereeId, 'nguoiduocgioithieu', 'MEMBER'],
      [ViewerId, 'nguoixem', 'VIEWER'],
      [PenaltyUserId, 'nguoibiphat', 'MEMBER'],
    ];
    for (const [id, username, rank] of users)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', $3, 'ACTIVE') ON CONFLICT DO NOTHING`,
        [id, username, rank],
      );

    const transactions = new GiftTransactionRepository(
      dataSource.manager,
      new ChatRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    ),
      new PointLedgerRepository(dataSource.manager),
    );

    // ── 1. Duyệt giao dịch khi kho đã cạn ───────────────────────────────────
    console.log('Duyệt giao dịch:\n');

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm hợp đồng RETURNING',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, GiverId, CategoryId],
    );

    const requested = await transactions.request({
      globalId: TransactionId,
      postId: PostId,
      receiverId: ReceiverId,
      quantity: 1,
    });
    check(
      'xin nhận trả về bản ghi thật, không phải object rỗng',
      requested.globalId === TransactionId && requested.status === 'REQUESTED',
      `${requested.globalId ?? 'undefined'}/${requested.status ?? 'undefined'}`,
    );

    // Vét sạch kho SAU khi đã có yêu cầu: lúc duyệt, câu trừ kho sẽ không khớp
    // dòng nào và bắt buộc phải nhận ra là hết hàng.
    await dataSource.query(
      `UPDATE posts SET remaining_quantity = 0 WHERE global_id = $1`,
      [PostId],
    );

    let outOfStockDetected = false;
    try {
      await transactions.accept(TransactionId, GiverId);
    } catch (error) {
      outOfStockDetected = (error as Error).constructor.name.includes(
        'OutOfStock',
      );
    }
    check(
      'duyệt khi kho đã cạn thì báo HẾT HÀNG',
      outOfStockDetected,
      outOfStockDetected ? '' : 'duyệt trót lọt dù kho bằng 0',
    );
    check(
      'kho không bị trừ xuống âm',
      (await countRows(
        dataSource,
        `SELECT COUNT(*) AS count FROM posts
         WHERE global_id = $1 AND remaining_quantity < 0`,
        [PostId],
      )) === 0,
    );

    // Trả lại một món rồi duyệt thật, để kiểm giá trị trả về.
    await dataSource.query(
      `UPDATE posts SET remaining_quantity = 1 WHERE global_id = $1`,
      [PostId],
    );
    const accepted = await transactions.accept(TransactionId, GiverId);
    check(
      'duyệt thành công trả về bản ghi ĐÃ cập nhật, không phải mảng',
      accepted.globalId === TransactionId && accepted.status === 'ACCEPTED',
      `${accepted.globalId ?? 'undefined'}/${accepted.status ?? 'undefined'}`,
    );

    const confirmed = await transactions.confirmReceipt(
      TransactionId,
      ReceiverId,
    );
    check(
      'xác nhận đã nhận trả về trạng thái COMPLETED',
      confirmed.status === 'COMPLETED',
      String(confirmed.status),
    );

    // ── 2. Ghi nhận giới thiệu ──────────────────────────────────────────────
    console.log('\nGhi nhận giới thiệu:\n');

    await dataSource.query(
      `INSERT INTO referrals (referrer_id, referee_id, code)
       VALUES ($1, $2, 'GIOITHIEU01')`,
      [ReferrerId, RefereeId],
    );

    const referrals = new ReferralRepository(
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
    );

    const firstQualify = await referrals.qualifyAndAward({
      refereeId: RefereeId,
    });
    check(
      'lần đầu đủ điều kiện thì báo ĐÃ đủ điều kiện',
      firstQualify.qualified === true,
      `qualified=${firstQualify.qualified}`,
    );
    check(
      'cột qualified_at đã được ghi',
      (await countRows(
        dataSource,
        `SELECT COUNT(*) AS count FROM referrals
         WHERE referee_id = $1 AND qualified_at IS NOT NULL`,
        [RefereeId],
      )) === 1,
    );

    const secondQualify = await referrals.qualifyAndAward({
      refereeId: RefereeId,
    });
    check(
      'gọi lại thì báo chưa đủ điều kiện, không thưởng lần hai',
      secondQualify.qualified === false,
      `qualified=${secondQualify.qualified}`,
    );
    check(
      'chỉ có MỘT bút toán thưởng giới thiệu',
      (await countRows(
        dataSource,
        `SELECT COUNT(*) AS count FROM point_ledger
         WHERE user_id = $1 AND rule_code = 'REFERRAL_QUALIFIED'`,
        [ReferrerId],
      )) === 1,
    );

    // ── 3. Thăng hạng onboarding ────────────────────────────────────────────
    console.log('\nThăng hạng:\n');

    const ranks = new RankRepository(dataSource.manager);

    check(
      'Viewer thăng lên Member thành công',
      (await ranks.promoteMemberOnboarding(ViewerId)) === true,
    );
    check(
      'ghi đúng MỘT bản ghi lịch sử thăng hạng',
      (await countRows(
        dataSource,
        `SELECT COUNT(*) AS count FROM rank_transitions WHERE user_id = $1`,
        [ViewerId],
      )) === 1,
    );

    const secondPromote = await ranks.promoteMemberOnboarding(ViewerId);
    check(
      'gọi lại trên người đã là Member thì báo không thăng hạng',
      secondPromote === false,
      `trả về ${secondPromote}`,
    );
    check(
      'KHÔNG đẻ thêm bản ghi lịch sử cho lần thăng hạng không xảy ra',
      (await countRows(
        dataSource,
        `SELECT COUNT(*) AS count FROM rank_transitions WHERE user_id = $1`,
        [ViewerId],
      )) === 1,
    );

    // ── 4. Điểm âm: kẹp số dư ở 0, ghi giá trị thật (CH-2) ──────────────────
    console.log('\nPhạt điểm không thanh toán ship:\n');

    const ledger = new PointLedgerRepository(dataSource.manager);

    // Cho người nhận 20 điểm trước, để khoản phạt 50 vượt quá số dư.
    await dataSource.query(
      `INSERT INTO point_rules (code, points, daily_cap, version)
       VALUES ('TEST_CREDIT_20', 20, NULL, 1) ON CONFLICT DO NOTHING`,
    );
    await ledger.appendByRule({
      userId: PenaltyUserId,
      ruleCode: 'TEST_CREDIT_20',
      referenceType: 'TEST',
      referenceId: PostId,
      idempotencyKey: `TEST_CREDIT:${PenaltyUserId}`,
      actor: 'SYSTEM',
      source: 'TEST',
    });

    const penalty = await ledger.appendByRule({
      userId: PenaltyUserId,
      ruleCode: 'SHIP_UNPAID_PENALTY',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: TransactionId,
      idempotencyKey: `SHIP_UNPAID_PENALTY:${TransactionId}`,
      actor: GiverId,
      source: 'SHIP_REPORT',
      reason: 'Hàng bị hoàn, người nhận không thanh toán phí ship',
    });

    check(
      'phạt 50 khi đang có 20: số tiêu được kẹp ở 0',
      penalty.balance === 0,
      `balance=${penalty.balance}`,
    );
    check(
      'giá trị THẬT ghi lại là -30, không phải 0',
      penalty.rawBalance === -30,
      `rawBalance=${penalty.rawBalance}`,
    );
    check(
      'khoản phạt là bút toán ÂM',
      penalty.delta === -50,
      `delta=${penalty.delta}`,
    );

    const afterPenalty = await ledger.getSummary(PenaltyUserId);
    check(
      'projection cũng kẹp ở 0 và giữ giá trị thật',
      afterPenalty.balance === 0 && afterPenalty.rawBalance === -30,
      JSON.stringify(afterPenalty),
    );
    check(
      'đếm đúng số lần cộng và số lần trừ',
      afterPenalty.creditCount === 1 && afterPenalty.debitCount === 1,
      `+${afterPenalty.creditCount} / -${afterPenalty.debitCount}`,
    );
    check(
      'lifetime KHÔNG bị khoản phạt trừ đi',
      afterPenalty.lifetime === 20,
      `lifetime=${afterPenalty.lifetime}`,
    );

    // Báo lần hai không trừ thêm.
    const again = await ledger.appendByRule({
      userId: PenaltyUserId,
      ruleCode: 'SHIP_UNPAID_PENALTY',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: TransactionId,
      idempotencyKey: `SHIP_UNPAID_PENALTY:${TransactionId}`,
      actor: GiverId,
      source: 'SHIP_REPORT',
      reason: 'Báo lại lần hai',
    });
    check(
      'báo lần hai KHÔNG trừ thêm, và nói rõ là không áp dụng',
      again.applied === false && again.rawBalance === -30,
      `applied=${again.applied} raw=${again.rawBalance}`,
    );
    check(
      'ledger chỉ có MỘT bút toán phạt',
      (await countRows(
        dataSource,
        `SELECT COUNT(*) AS count FROM point_ledger
         WHERE user_id = $1 AND rule_code = 'SHIP_UNPAID_PENALTY'`,
        [PenaltyUserId],
      )) === 1,
    );
    check(
      'lý do được ghi vào ledger, không để trống',
      (await countRows(
        dataSource,
        `SELECT COUNT(*) AS count FROM point_ledger
         WHERE user_id = $1 AND rule_code = 'SHIP_UNPAID_PENALTY'
           AND reason IS NOT NULL`,
        [PenaltyUserId],
      )) === 1,
    );

    // Cộng tiếp 50: nợ được trả dần, số dư hiện lại đúng phần dương.
    await dataSource.query(
      `INSERT INTO point_rules (code, points, daily_cap, version)
       VALUES ('TEST_CREDIT_50', 50, NULL, 1) ON CONFLICT DO NOTHING`,
    );
    const recovered = await ledger.appendByRule({
      userId: PenaltyUserId,
      ruleCode: 'TEST_CREDIT_50',
      referenceType: 'TEST',
      referenceId: PostId,
      idempotencyKey: `TEST_CREDIT_50:${PenaltyUserId}`,
      actor: 'SYSTEM',
      source: 'TEST',
    });
    check(
      'cộng 50 khi đang âm 30: giá trị thật về 20',
      recovered.rawBalance === 20,
      `rawBalance=${recovered.rawBalance}`,
    );
    check(
      'số tiêu được bằng đúng phần dương của giá trị thật',
      recovered.balance === 20,
      `balance=${recovered.balance}`,
    );
  } finally {
    for (const source of opened)
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
    console.log(`\nĐã xoá database nháp ${ScratchDatabase}`);
  }

  console.log(
    failures.length === 0
      ? '\nHợp đồng UPDATE ... RETURNING được giữ trên cả ba đường.'
      : `\n${failures.length} kiểm chứng THẤT BẠI:\n- ${failures.join('\n- ')}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
