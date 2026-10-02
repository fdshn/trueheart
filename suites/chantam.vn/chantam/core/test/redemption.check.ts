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
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { GetRedemptionQuoteUseCase } from '../src/application/implementations/gift-request/redemption-quote.use-case';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
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

    console.log('1. Giá bằng điểm tính từ tỷ lệ ĐỘNG, không phải hằng trong code');
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
    check('đủ điểm thì không nêu lý do nào', priced.quote.unavailableReason === null);
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
    const poor = await quotes.handle({ postId: PricedPostId, userId: PoorerId });
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

    console.log('\n3. Cảnh báo tụt hạng theo bậc thang THẬT');
    // Bạc ngưỡng 672. Có 1.000, trả 500 → còn 500, dưới 672 nhưng trên 224 →
    // về MEMBER.
    await setBalance(RicherId, 1_000);
    const willDrop = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'trả 500 khi đang có 1.000 thì TỤT hạng',
      willDrop.quote.wouldDemote,
      `wouldDemote=${String(willDrop.quote.wouldDemote)}`,
    );
    check(
      'và nói rõ tụt về bậc nào — không chỉ "bạn sẽ tụt"',
      willDrop.quote.rankAfter === UserRanks.MEMBER,
      willDrop.quote.rankAfter,
    );

    await setBalance(RicherId, 1_200);
    const safe = await quotes.handle({ postId: PricedPostId, userId: RicherId });
    check(
      'có 1.200 thì trả 500 vẫn còn 700 > 672 — KHÔNG tụt',
      safe.quote.wouldDemote === false && safe.quote.rankAfter === 'SILVER',
      `${safe.quote.rankAfter} wouldDemote=${String(safe.quote.wouldDemote)}`,
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

    // Và hạng vẫn phải suy từ SỐ DƯ: lifetime cao không cứu được người đã tiêu hết.
    await setBalance(RicherId, 1_000);
    const afterDrop = await quotes.handle({
      postId: PricedPostId,
      userId: RicherId,
    });
    check(
      'tiêu 500 từ 1.000 xuống 500 thì VẪN cảnh báo tụt hạng',
      afterDrop.quote.wouldDemote === true,
      `wouldDemote=${String(afterDrop.quote.wouldDemote)} rankAfter=${afterDrop.quote.rankAfter}`,
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
