/**
 * Đổi vật phẩm bằng điểm, trên Postgres THẬT.
 *
 * Trước 29/09 phần này không có script riêng — nó nằm rải trong
 * `selection.check.ts` (đọc bối cảnh, lấy giá từ JSONB) và `rank-balance.check.ts`
 * (tiêu điểm làm tụt hạng), trong khi dòng trạng thái của `14-redemption.md` hứa
 * "có script kiểm trên Postgres thật".
 *
 * Bốn thứ chỉ Postgres thật kiểm được:
 *
 * 1. Giá bằng điểm đi qua ĐÚNG một đường tính. Hai đường là hai đường sẽ trôi khỏi
 *    nhau, và người dùng thấy một giá rồi bị trừ một giá khác.
 * 2. Báo giá và đường bấm thật gộp lý do "không đổi được" y như nhau — phân biệt
 *    chúng là để lộ bài nào tồn tại cho người chưa từng thấy nó.
 * 3. Cảnh báo tụt hạng tính theo bậc thang THẬT trong `rank_tiers`, không theo một
 *    bảng hằng chép lại trong code.
 * 4. Tỷ lệ quy đổi là cấu hình động: Admin đổi thì báo giá đổi theo ngay.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { GetRedemptionQuoteUseCase } from '../src/application/implementations/gift-request/redemption-quote.use-case';
import { RefundRedemptionOnCloseService } from '../src/application/implementations/transaction/refund-redemption-on-close.service';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { RankRepository } from '../src/infrastructure/repository/rank.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_redemption_check';
const CategoryId = '30000000-0000-4000-8000-0000000f0001';
const GiverId = '99999999-9999-4999-8999-9999999f1001';
const RicherId = '99999999-9999-4999-8999-9999999f1002';
const PoorerId = '99999999-9999-4999-8999-9999999f1003';
const OutsiderId = '99999999-9999-4999-8999-9999999f1004';
const PricedPostId = '88888888-8888-4888-8888-8888888f1001';
const NoPricePostId = '88888888-8888-4888-8888-8888888f1002';
const RefundPostId = '88888888-8888-4888-8888-8888888f1003';
const RefundRequestId = '77777777-7777-4777-8777-7777777f1001';
const RefundTransactionId = '66666666-6666-4666-8666-6666666f1001';

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

  try {
    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const ledger = new PointLedgerRepository(dataSource.manager);
    const ranks = new RankRepository(
      dataSource.manager,
      {
        countCompletedGifts: async () => ({
          available: true,
          completedGifts: 99,
        }),
        countLifetimeCompletedGifts: async () => ({
          available: true,
          completedGifts: 99,
        }),
      } as never,
      adminConfig,
    );
    const requests = new GiftRequestRepository(
      entities.GiftRequestEntity as never,
      dataSource.manager,
      {
        openRoomWithinTransaction: async () => undefined,
        lockRoomWithinTransaction: async () => undefined,
      } as never,
      ledger,
    );
    const quotes = new GetRedemptionQuoteUseCase(
      requests as never,
      adminConfig as never,
      ledger as never,
      ranks as never,
    );

    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm đổi điểm', 'kiem-doi-diem', true)`,
      [CategoryId],
    );
    for (const [id, name, rank] of [
      [GiverId, 'nguoitang-doi', 'SILVER'],
      [RicherId, 'nguoixin-giau', 'SILVER'],
      [PoorerId, 'nguoixin-ngheo', 'SILVER'],
      [OutsiderId, 'nguoi-ngoai', 'MEMBER'],
    ] as const)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2::text, 'x', $3, 'ACTIVE')`,
        [id, name, rank],
      );

    /** Đặt thẳng số dư, bỏ qua sổ — để dựng tình huống nhanh. */
    async function setBalance(userId: string, balance: number): Promise<void> {
      await dataSource.query(
        `INSERT INTO user_point_balances (user_id, balance, raw_balance, lifetime)
         VALUES ($1, $2, $2, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET balance = $2, raw_balance = $2, lifetime = $2`,
        [userId, balance],
      );
    }

    async function seedPost(
      postId: string,
      details: Record<string, unknown>,
    ): Promise<void> {
      await dataSource.query(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count, selection_deadline)
         VALUES ($1, 'OFFER', $2, $3, 'Món kiểm đổi điểm',
                 'Mô tả đủ dài cho bài kiểm đổi vật phẩm bằng điểm',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'PUBLISHED', 1, 1, $4::jsonb, 0,
                 now() + INTERVAL '3 days')`,
        [postId, GiverId, CategoryId, JSON.stringify(details)],
      );
    }

    await seedPost(PricedPostId, { estimatedValue: 1_000_000 });
    await seedPost(NoPricePostId, {});
    for (const [postId, requesterId] of [
      [PricedPostId, RicherId],
      [PricedPostId, PoorerId],
      [NoPricePostId, RicherId],
    ] as const)
      await dataSource.query(
        `INSERT INTO gift_requests (global_id, post_id, requester_id, message, status)
         VALUES (gen_random_uuid(), $1, $2, 'Em xin ạ', 'PENDING')`,
        [postId, requesterId],
      );

    console.log(
      '1. Giá bằng điểm tính từ tỷ lệ ĐỘNG, không phải hằng trong code',
    );
    await setBalance(RicherId, 2_000);
    const priced = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'món 1 triệu với tỷ lệ 2.000 ra 500 điểm',
      priced.quote.points === 500,
      `${priced.quote.points} điểm`,
    );
    check(
      'trả kèm tỷ lệ để client giải thích được con số',
      priced.quote.vndPerPoint === 2_000,
      `${priced.quote.vndPerPoint}`,
    );
    check(
      'đủ điểm thì không nêu lý do nào',
      priced.quote.unavailableReason === null,
    );
    check('và không thiếu điểm', priced.quote.missingPoints === 0);

    // Admin đổi tỷ lệ → báo giá phải đổi theo NGAY, không chờ deploy. Đây chính là
    // lý do client không được tự chia.
    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'point.redemption'`,
      [JSON.stringify({ vndPerPoint: 4_000 })],
    );
    const afterRate = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'Admin đổi tỷ lệ sang 4.000 thì giá về 250 điểm ngay',
      afterRate.quote.points === 250,
      `${afterRate.quote.points} điểm`,
    );
    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'point.redemption'`,
      [JSON.stringify({ vndPerPoint: 2_000 })],
    );

    console.log('\n2. Ba lý do không đổi được, gộp đúng như đường bấm thật');
    await setBalance(PoorerId, 100);
    const poor = await quotes.handle({
      postId: PricedPostId,
      userId: PoorerId,
    });
    check(
      'thiếu điểm → INSUFFICIENT_POINTS, và nêu còn thiếu bao nhiêu',
      poor.quote.unavailableReason === 'INSUFFICIENT_POINTS' &&
        poor.quote.missingPoints === 400,
      `${poor.quote.unavailableReason} thiếu ${poor.quote.missingPoints}`,
    );
    check(
      'nhưng vẫn trả GIÁ — người dùng cần biết đích cần tới',
      poor.quote.points === 500,
      `${poor.quote.points}`,
    );

    const noPrice = await quotes.handle({
      postId: NoPricePostId,
      userId: RicherId,
    });
    check(
      'bài không khai giá → NO_ESTIMATED_VALUE, KHÔNG phải 0 điểm',
      noPrice.quote.unavailableReason === 'NO_ESTIMATED_VALUE' &&
        noPrice.quote.redeemable === false,
      `${noPrice.quote.unavailableReason}`,
    );

    const outsider = await quotes.handle({
      postId: PricedPostId,
      userId: OutsiderId,
    });
    check(
      'chưa gửi yêu cầu xin → NOT_AVAILABLE',
      outsider.quote.unavailableReason === 'NOT_AVAILABLE',
      `${outsider.quote.unavailableReason}`,
    );
    const missingPost = await quotes.handle({
      postId: '88888888-8888-4888-8888-8888888f9999',
      userId: RicherId,
    });
    check(
      'bài KHÔNG tồn tại trả CÙNG lý do — không lộ bài nào có thật',
      missingPost.quote.unavailableReason === 'NOT_AVAILABLE',
      `${missingPost.quote.unavailableReason}`,
    );

    await dataSource.query(
      `UPDATE posts SET selection_deadline = now() - INTERVAL '1 hour'
       WHERE global_id = $1`,
      [PricedPostId],
    );
    const expired = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'đồng hồ đã hết → NOT_AVAILABLE, dù bài vẫn PUBLISHED',
      expired.quote.unavailableReason === 'NOT_AVAILABLE',
      `${expired.quote.unavailableReason}`,
    );
    await dataSource.query(
      `UPDATE posts SET selection_deadline = now() + INTERVAL '3 days'
       WHERE global_id = $1`,
      [PricedPostId],
    );

    console.log('\n3. Sàn giữ hạng theo bậc thang THẬT (CHỐT-13)');
    // Mục này tới 10/10 kiểm CẢNH BÁO tụt hạng: quote trả `wouldDemote: true` và
    // client tự quyết. CHỐT-13 bỏ quyền quyết đó — chỉ tiêu được phần vượt ngưỡng
    // giữ hạng — nên hai trường `wouldDemote`/`rankAfter` đã bị gỡ, và chỗ này
    // kiểm phép CHẶN thay vì lời cảnh báo.
    //
    // Bạc ngưỡng 672. Có 1.000 thì giữ 672, dùng được 328. Món 500 điểm phải bị
    // chặn — đúng ca mà bản F76 cho qua kèm một cái cờ.
    await setBalance(RicherId, 1_000);
    const atFloor = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'giữ đúng ngưỡng bậc đang có, không giữ số tròn',
      atFloor.quote.reservedForRankPoints === 672,
      `reserved=${atFloor.quote.reservedForRankPoints}`,
    );
    check(
      'dùng được đúng phần vượt ngưỡng',
      atFloor.quote.availablePoints === 328,
      `available=${atFloor.quote.availablePoints}`,
    );
    check(
      'món 500 điểm bị CHẶN, không phải cảnh báo',
      atFloor.quote.unavailableReason === 'INSUFFICIENT_POINTS' &&
        atFloor.quote.missingPoints === 172,
      `${atFloor.quote.unavailableReason} missing=${atFloor.quote.missingPoints}`,
    );

    // Phép chặn ở LỆNH ĐỔI không kiểm ở đây: script này chỉ dựng use case xem
    // trước, và việc so hai con số là logic thuần nên
    // `redeem-post-with-points.use-case.spec.ts` canh được trọn. Thứ chỉ Postgres
    // thật thấy được là ngưỡng 672 ở trên — nó đến từ bảng `rank_tiers` đã seed,
    // không từ một hằng trong phép kiểm.

    await setBalance(RicherId, 1_200);
    const enough = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'có 1.200 thì dùng được 528 — món 500 đi qua',
      enough.quote.availablePoints === 528 &&
        enough.quote.unavailableReason === null,
      `available=${enough.quote.availablePoints} ${enough.quote.unavailableReason}`,
    );

    // Chỗ này trước 02/10 kiểm nhánh `rank.points_source = LIFETIME` (tiêu điểm
    // không đụng hạng nên không cảnh báo). Nhánh đó đã bị gỡ: SRS `BR-POINT-06` và
    // `BR-PROF-RANK-06` cùng nói Phase 1 dùng SỐ DƯ, và cái núm ấy chưa bao giờ bật
    // được qua đường Admin — chỉ `UPDATE` SQL tay.
    //
    // Thay bằng phép kiểm rằng khoá cấu hình đã BIẾN MẤT. Giữ lại một khoá không ai
    // đọc thì `config-inventory.check.ts` sẽ bắt, nhưng ở đây mới là chỗ nói VÌ SAO
    // nó biến mất — và chặn một lần "tiện thì seed lại" trong tương lai.
    const [orphan] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM system_configs WHERE config_key = 'rank.points_source'`,
    );
    check(
      'khoá rank.points_source đã bị gỡ hẳn, mọi version',
      Number(orphan.count) === 0,
      `còn ${orphan.count} hàng`,
    );

    // Và sàn vẫn phải suy từ SỐ DƯ: lifetime cao không cứu được người đã tiêu hết.
    await setBalance(RicherId, 1_000);
    const afterDrop = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'sàn tính theo SỐ DƯ, không theo lifetime',
      afterDrop.quote.reservedForRankPoints === 672 &&
        afterDrop.quote.availablePoints === 328,
      `reserved=${afterDrop.quote.reservedForRankPoints} available=${afterDrop.quote.availablePoints}`,
    );

    console.log(
      '\n6. Huỷ lượt trao ĐỔI-BẰNG-ĐIỂM thì hoàn đúng số điểm đã trừ (CHỐT-13)',
    );
    // Chuỗi này SQL-hình: khoá chống trùng của bút toán trừ là
    // `ITEM_REDEMPTION:<requestId>`, và `requestId` chỉ còn sống trong câu
    // `UPDATE gift_requests … RETURNING global_id` nằm giữa lòng `close()`.
    // Test mock không thấy được chỗ nối đó — nó mock luôn `close()`.
    await seedPost(RefundPostId, { estimatedValue: 1_000_000 });
    await dataSource.query(
      `INSERT INTO gift_requests (global_id, post_id, requester_id, message, status)
       VALUES ($1, $2, $3, 'Em xin đổi bằng điểm ạ', 'ACCEPTED')`,
      [RefundRequestId, RefundPostId, RicherId],
    );
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at)
       VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())`,
      [RefundTransactionId, RefundPostId, GiverId, RicherId],
    );

    // Dựng số dư qua SỔ THẬT, không `setBalance`: khoản hoàn là một bút toán
    // NGƯỢC của bút toán trừ, nên bút toán trừ phải thật.
    await dataSource.query(`DELETE FROM point_ledger WHERE user_id = $1`, [
      RicherId,
    ]);
    await dataSource.query(
      `UPDATE user_point_balances SET balance = 0, raw_balance = 0, lifetime = 0
       WHERE user_id = $1`,
      [RicherId],
    );
    await ledger.appendAdjustment({
      userId: RicherId,
      ruleCode: 'ADMIN_ADJUSTMENT',
      delta: 2_000,
      referenceType: 'USER',
      referenceId: RicherId,
      idempotencyKey: `SEED:REFUND:${RicherId}`,
      actor: 'SYSTEM',
      source: 'ADMIN',
      reason: 'Nạp điểm cho phép kiểm hoàn điểm',
    });
    await ledger.appendAdjustment({
      userId: RicherId,
      ruleCode: 'ITEM_REDEMPTION',
      delta: -500,
      referenceType: 'POST',
      referenceId: RefundPostId,
      idempotencyKey: `ITEM_REDEMPTION:${RefundRequestId}`,
      actor: RicherId,
      source: 'REDEMPTION',
      reason: 'Đổi vật phẩm bằng điểm (500 điểm)',
    });

    const entryId = await ledger.findEntryIdByIdempotencyKey(
      `ITEM_REDEMPTION:${RefundRequestId}`,
    );
    check(
      'tra được bút toán trừ theo khoá chống trùng',
      typeof entryId === 'number' && Number.isInteger(entryId),
      // `point_ledger.id` là `BIGSERIAL`, nên node-pg trả CHUỖI. Thiếu `Number()`
      // thì chỗ này ra `'3'` và mọi phép so sánh số ở dưới lệch âm thầm.
      `${typeof entryId} ${String(entryId)}`,
    );

    const transactions = new GiftTransactionRepository(
      dataSource.manager,
      {
        openRoomWithinTransaction: async () => undefined,
        lockRoomWithinTransaction: async () => undefined,
      } as never,
      ledger as never,
      {} as never,
      {} as never,
    );
    const closed = await transactions.close({
      transactionId: RefundTransactionId,
      actorUserId: RicherId,
      status: 'CANCELLED',
      reason: 'Em xin phép huỷ ạ',
    });
    check(
      'close() trả về id yêu cầu vừa bị huỷ',
      closed.queue.cancelledRequestId === RefundRequestId,
      String(closed.queue.cancelledRequestId),
    );

    const refunds = new RefundRedemptionOnCloseService(ledger as never);
    const refunded = await refunds.refundFor({
      cancelledRequestId: closed.queue.cancelledRequestId,
      actorUserId: RicherId,
    });
    const afterRefund = await ledger.getSummary(RicherId);
    check(
      'hoàn đúng 500 điểm đã trừ, số dư về 2.000',
      refunded === 500 && afterRefund.balance === 2_000,
      `hoàn ${refunded}, dư ${afterRefund.balance}`,
    );

    // Hai đường đóng lượt trao (người dùng tự huỷ, báo không trả ship) đều gọi
    // tới đây. Lần thứ hai phải không cộng thêm gì — `REVERSAL:<entryId>` là chỗ
    // chặn, và nó chỉ chặn được trên Postgres thật vì nó là UNIQUE INDEX.
    const again = await refunds.refundFor({
      cancelledRequestId: closed.queue.cancelledRequestId,
      actorUserId: RicherId,
    });
    const afterSecond = await ledger.getSummary(RicherId);
    check(
      'gọi lần hai không hoàn thêm lần nữa',
      again === 0 && afterSecond.balance === 2_000,
      `hoàn ${again}, dư ${afterSecond.balance}`,
    );

    const [reversal] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM point_ledger
       WHERE user_id = $1 AND idempotency_key LIKE 'REVERSAL:%'`,
      [RicherId],
    );
    check(
      'sổ chỉ có MỘT bút toán hoàn, không xoá bút toán gốc',
      Number(reversal.count) === 1,
      `${reversal.count} bút toán hoàn`,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Đổi vật phẩm bằng điểm: giá và cảnh báo đều tính ở máy chủ'
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
