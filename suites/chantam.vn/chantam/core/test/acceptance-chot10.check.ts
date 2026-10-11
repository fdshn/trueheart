/**
 * Acceptance tests của CHỐT-10 mục 5, trên Postgres THẬT.
 *
 * Sáu tình huống trong `docs/plan/GIVE-RECEIVE-2026-10-07.md` mục 5. Mỗi mảnh
 * riêng lẻ đã có script của nó (`post-lifecycle`, `selection`, `redemption`,
 * `gift-rewards`, `reviews`); script này canh thứ **không** mảnh nào canh được một
 * mình: các mảnh nối lại có ra đúng câu chuyện nghiệp vụ hay không.
 *
 * Ví dụ rõ nhất là tình huống 5. `reviews.check.ts` nói "sửa được một lần",
 * `gift-rewards.check.ts` nói "bonus chốt tại hạn và chỉ một lần". Cả hai xanh mà
 * câu nghiệp vụ *"sửa 70% thành 100% trước hạn thì tại hạn cộng theo 100%"* vẫn có
 * thể sai — nếu truy vấn chốt thưởng đọc một hàng khác với hàng vừa sửa.
 *
 * Mỗi nhóm tự dựng dữ liệu của nó và không dựa vào nhóm trước, nên một nhóm đỏ
 * không kéo theo nhóm sau.
 */
import {
  CandidateSelectionCriteria,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  computeGiftValueBonus,
  pickNextCandidate,
  postExpiryDateFor,
  quoteRedemption,
  selectionDeadlineFrom,
  SelectionWindowDays,
  usesSelectionLifecycle,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { GetRedemptionQuoteUseCase } from '../src/application/implementations/gift-request/redemption-quote.use-case';
import { RefundRedemptionOnCloseService } from '../src/application/implementations/transaction/refund-redemption-on-close.service';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { EntitlementRepository } from '../src/infrastructure/repository/entitlement.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { PostRepository } from '../src/infrastructure/repository/post.repository';
import { RankRepository } from '../src/infrastructure/repository/rank.repository';
import { TransactionReviewRepository } from '../src/infrastructure/repository/transaction-review.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_acceptance_chot10';
const CategoryId = '30000000-0000-4000-8000-00000ac10001';

const Giver = '99999999-9999-4999-8999-99999ac11001';
const Diamond = '99999999-9999-4999-8999-99999ac11002';
const Member = '99999999-9999-4999-8999-99999ac11003';
const Nearby = '99999999-9999-4999-8999-99999ac11004';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/** Số ngày giữa hai mốc, làm tròn — đủ cho các phép so mốc 7/30/37. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
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

  const manager = dataSource.manager;
  const adminConfig = new AdminConfigRepository(manager);
  const ledger = new PointLedgerRepository(manager);
  const chatStub = {
    openRoomWithinTransaction: async () => undefined,
    lockRoomWithinTransaction: async () => undefined,
  } as never;
  const requests = new GiftRequestRepository(
    entities.GiftRequestEntity as never,
    manager,
    chatStub,
  );
  const posts = new PostRepository(entities.PostEntity as never, manager);
  const entitlements = new EntitlementRepository(manager, requests as never);
  const reviews = new TransactionReviewRepository(manager, adminConfig);
  const ranks = new RankRepository(
    manager,
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
  const transactions = new GiftTransactionRepository(
    manager,
    chatStub,
    ledger as never,
    {} as never,
    {} as never,
  );
  const quotes = new GetRedemptionQuoteUseCase(
    requests as never,
    adminConfig as never,
    ledger as never,
    ranks as never,
  );
  const refunds = new RefundRedemptionOnCloseService(ledger as never);

  /**
   * Một bài đã công khai, với hai mốc tính bằng CHÍNH hàm mà đường đăng bài dùng.
   *
   * `publishedDaysAgo` dịch mốc công khai về quá khứ để dựng "bài đăng ngày 1" mà
   * không phải chờ thật.
   */
  async function seedPost(params: {
    postId: string;
    postType: 'OFFER' | 'WANTED' | 'CLASSIFIED';
    publishedDaysAgo: number;
    estimatedValueVnd?: number;
    selectionMode?: 'INSTANT' | 'OPTIMAL';
  }): Promise<{ publishedAt: Date }> {
    const publishedAt = new Date(
      Date.now() - params.publishedDaysAgo * 24 * 3600 * 1000,
    );
    const lifecycle = usesSelectionLifecycle(params.postType as PostTypes);
    const details =
      params.estimatedValueVnd === undefined
        ? {}
        : { estimatedValue: params.estimatedValueVnd };

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count, selection_mode, selection_deadline,
          expires_at, created_at)
       VALUES ($1, $2, $3, $4, 'Bài kiểm acceptance',
               'Mô tả đủ dài cho bài kiểm acceptance của CHỐT-10',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, $5::jsonb, 0, $6, $7, $8, $9)`,
      [
        params.postId,
        params.postType,
        Giver,
        CategoryId,
        JSON.stringify(details),
        params.selectionMode ?? 'OPTIMAL',
        lifecycle ? selectionDeadlineFrom(publishedAt) : null,
        lifecycle
          ? postExpiryDateFor(params.postType as PostTypes, publishedAt)
          : null,
        publishedAt,
      ],
    );
    return { publishedAt };
  }

  async function requestFrom(
    postId: string,
    requesterId: string,
    joinedDaysAgo = 1,
    status = 'PENDING',
  ): Promise<string> {
    const requestId = randomUUID();
    await dataSource.query(
      `INSERT INTO gift_requests
         (global_id, post_id, requester_id, message, status, queue_joined_at)
       VALUES ($1, $2, $3, 'Em xin ạ', $4, now() - ($5 || ' days')::interval)`,
      [requestId, postId, requesterId, status, String(joinedDaysAgo)],
    );
    return requestId;
  }

  try {
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm acceptance', 'kiem-acceptance', true)`,
      [CategoryId],
    );
    for (const [id, name, rank, lng, lat] of [
      [Giver, 'ac-nguoi-tang', 'GOLD', null, null],
      [Diamond, 'ac-kim-cuong', 'DIAMOND', null, null],
      [Member, 'ac-thanh-vien', 'MEMBER', null, null],
      [Nearby, 'ac-o-gan', 'MEMBER', 106.6981, 10.7725],
    ] as const)
      await dataSource.query(
        `INSERT INTO users
           (global_id, username, email, password_hash, rank, status, default_location)
         VALUES ($1, $2, $3, 'x', $4, 'ACTIVE',
                 CASE WHEN $5::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography
                 END)`,
        [id, name, `${name}@chantam.test`, rank, lng, lat],
      );

    // ── 1. Đăng ngày 1, không ai phản hồi ───────────────────────────────────
    console.log('1. Bài không có phản hồi: 7 ngày rồi 30 ngày, KHÔNG 3 tháng');

    const quietId = randomUUID();
    const quiet = await seedPost({
      postId: quietId,
      postType: 'OFFER',
      publishedDaysAgo: 8,
    });
    const [quietRow] = await dataSource.query<
      { selection_deadline: Date; expires_at: Date }[]
    >(`SELECT selection_deadline, expires_at FROM posts WHERE global_id = $1`, [
      quietId,
    ]);
    check(
      'đồng hồ chọn người đặt ngay lúc đăng, không chờ ai xin',
      quietRow.selection_deadline !== null &&
        daysBetween(quiet.publishedAt, quietRow.selection_deadline) ===
          SelectionWindowDays,
      `${daysBetween(quiet.publishedAt, quietRow.selection_deadline)} ngày`,
    );
    check(
      'hạn bài là 37 ngày từ lúc đăng — 7 cộng 30, không phải 3 tháng',
      daysBetween(quiet.publishedAt, quietRow.expires_at) === 37,
      `${daysBetween(quiet.publishedAt, quietRow.expires_at)} ngày`,
    );
    check(
      'giai đoạn 30 ngày là khoảng GIỮA hai mốc, không cần cột trạng thái',
      daysBetween(quietRow.selection_deadline, quietRow.expires_at) === 30,
      `${daysBetween(quietRow.selection_deadline, quietRow.expires_at)} ngày`,
    );

    // Ngày 8: quá hạn chọn người, chưa quá hạn bài.
    const dueAtDayEight = await requests.findPostsDueForSelection(50);
    check(
      'ngày 8 bài KHÔNG hết hạn — nó vừa vào giai đoạn 30 ngày',
      (await posts.expireDuePosts(new Date())).expiredPosts.every(
        (post) => post.postId !== quietId,
      ),
    );
    check(
      'và cũng không vào danh sách tự chọn: không có ứng viên nào',
      dueAtDayEight.every((post) => post.postId !== quietId),
      `${dueAtDayEight.length} bài tới hạn chọn`,
    );

    // Ngày 38: quá cả hạn bài.
    await dataSource.query(
      `UPDATE posts SET expires_at = now() - interval '1 hour'
       WHERE global_id = $1`,
      [quietId],
    );
    const expired = await posts.expireDuePosts(new Date());
    check(
      'hết giai đoạn 30 ngày mà vẫn không ghép được thì EXPIRED',
      expired.expiredPosts.some((post) => post.postId === quietId),
      `${expired.expiredPosts.length} bài hết hạn`,
    );
    check(
      'và EXPIRED mang theo chủ bài để báo cho họ (CHỐT-10 mục 1.3)',
      expired.expiredPosts
        .filter((post) => post.postId === quietId)
        .every((post) => post.authorId === Giver),
    );

    // `INSTANT` đi cùng một lịch: chế độ chọn người KHÔNG đổi đồng hồ.
    const instantId = randomUUID();
    const instant = await seedPost({
      postId: instantId,
      postType: 'OFFER',
      publishedDaysAgo: 0,
      selectionMode: 'INSTANT',
    });
    const [instantRow] = await dataSource.query<
      { selection_deadline: Date; expires_at: Date }[]
    >(`SELECT selection_deadline, expires_at FROM posts WHERE global_id = $1`, [
      instantId,
    ]);
    check(
      'bài INSTANT cũng qua mốc 7 ngày và cũng hết hạn ở 37 ngày',
      daysBetween(instant.publishedAt, instantRow.selection_deadline) ===
        SelectionWindowDays &&
        daysBetween(instant.publishedAt, instantRow.expires_at) === 37,
      `${daysBetween(instant.publishedAt, instantRow.selection_deadline)} + ${daysBetween(instantRow.selection_deadline, instantRow.expires_at)}`,
    );

    // ── 2. Nhiều ứng viên: Kim Cương chọn tay, hết hạn thì tự chọn ───────────
    console.log('\n2. Chọn người nhận: quyền chọn tay và lượt tự chọn');

    const diamondCapability = await entitlements.getCapability(
      Diamond,
      'SELECT_REQUESTER',
    );
    const memberCapability = await entitlements.getCapability(
      Member,
      'SELECT_REQUESTER',
    );
    check(
      'Kim Cương ĐƯỢC chọn tay người nhận (CHỐT-10 mục 1.2)',
      diamondCapability?.allowed === true,
      String(diamondCapability?.allowed),
    );
    check(
      'dưới Kim Cương thì KHÔNG — quyền đọc từ bảng quyền theo bậc',
      memberCapability?.allowed === false,
      String(memberCapability?.allowed),
    );

    const crowdedId = randomUUID();
    await seedPost({
      postId: crowdedId,
      postType: 'OFFER',
      publishedDaysAgo: 8,
    });
    await dataSource.query(
      `UPDATE posts SET selection_deadline = now() - interval '1 hour'
       WHERE global_id = $1`,
      [crowdedId],
    );
    await requestFrom(crowdedId, Member, 6);
    await requestFrom(crowdedId, Nearby, 3);

    const due = await requests.findPostsDueForSelection(50);
    check(
      'hết 7 ngày mà còn ứng viên thì bài vào danh sách tự chọn',
      due.some((post) => post.postId === crowdedId),
      `${due.length} bài`,
    );

    const metrics = await requests.listCandidateMetrics(crowdedId);
    const winnerByQueue = pickNextCandidate(metrics, [
      CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST,
    ]);
    const winnerByDistance = pickNextCandidate(metrics, [
      CandidateSelectionCriteria.NEAREST,
    ]);
    check(
      'tiêu chí "xin sớm nhất" chọn người xin trước',
      winnerByQueue?.requesterId === Member,
      String(winnerByQueue?.requesterId),
    );
    check(
      'đổi tiêu chí sang "gần nhất" thì đổi người thắng — thứ tự là cấu hình',
      winnerByDistance?.requesterId === Nearby,
      String(winnerByDistance?.requesterId),
    );

    // ── 3. Đổi điểm: một người thắng, huỷ thì hoàn đúng số đã trừ ───────────
    console.log('\n3. Đổi bằng điểm ngày 3, rồi huỷ sau khi Admin đổi tỷ lệ');

    const redeemId = randomUUID();
    await seedPost({
      postId: redeemId,
      postType: 'OFFER',
      publishedDaysAgo: 3,
      estimatedValueVnd: 1_000_000,
    });
    const redeemRequestId = await requestFrom(redeemId, Member, 1);

    const quoteBefore = await quotes.handle({
      postId: redeemId,
      userId: Member,
    });
    check(
      'báo giá 1 triệu / 2.000 ra 500 điểm',
      quoteBefore.quote.points === 500,
      `${quoteBefore.quote.points} điểm`,
    );

    await ledger.appendAdjustment({
      userId: Member,
      ruleCode: 'ADMIN_ADJUSTMENT',
      delta: 2_000,
      referenceType: 'USER',
      referenceId: Member,
      idempotencyKey: `SEED:ACCEPT:${Member}`,
      actor: 'SYSTEM',
      source: 'ADMIN',
      reason: 'Nạp điểm cho phép kiểm acceptance',
    });
    await ledger.appendAdjustment({
      userId: Member,
      ruleCode: 'ITEM_REDEMPTION',
      delta: -quoteBefore.quote.points,
      referenceType: 'POST',
      referenceId: redeemId,
      idempotencyKey: `ITEM_REDEMPTION:${redeemRequestId}`,
      actor: Member,
      source: 'REDEMPTION',
      reason: `Đổi vật phẩm bằng điểm (${quoteBefore.quote.points} điểm)`,
    });
    const accepted = await requests.acceptRequest({
      requestId: redeemRequestId,
      postId: redeemId,
      actorUserId: Giver,
      transactionId: randomUUID(),
    });
    await dataSource.query(
      `UPDATE posts SET selection_deadline = NULL WHERE global_id = $1`,
      [redeemId],
    );

    const dueAfterRedeem = await requests.findPostsDueForSelection(50);
    check(
      'chốt xong thì bài KHÔNG còn trong danh sách tự chọn',
      dueAfterRedeem.every((post) => post.postId !== redeemId),
    );
    const [losers] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM gift_requests
       WHERE post_id = $1 AND status = 'ACCEPTED'`,
      [redeemId],
    );
    check(
      'và đúng MỘT yêu cầu được chốt',
      Number(losers.count) === 1,
      `${losers.count} yêu cầu ACCEPTED`,
    );

    // Admin đổi tỷ lệ TRƯỚC khi huỷ: khoản hoàn phải theo bút toán gốc.
    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'point.redemption'`,
      [JSON.stringify({ vndPerPoint: 1_000 })],
    );
    const quoteAfter = await quotes.handle({
      postId: redeemId,
      userId: Member,
    });
    check(
      'tỷ lệ mới cho giá mới: cùng món ra 1.000 điểm',
      quoteAfter.quote.points === 1_000,
      `${quoteAfter.quote.points} điểm`,
    );

    const closed = await transactions.close({
      transactionId: accepted.transactionId,
      actorUserId: Member,
      status: 'CANCELLED',
      reason: 'Em xin phép huỷ ạ',
    });
    const refunded = await refunds.refundFor({
      cancelledRequestId: closed.queue.cancelledRequestId,
      actorUserId: Member,
    });
    const balanceAfterRefund = await ledger.getSummary(Member);
    check(
      'huỷ hoàn ĐÚNG 500 điểm đã trừ, không phải 1.000 theo tỷ lệ mới',
      refunded === 500 && balanceAfterRefund.balance === 2_000,
      `hoàn ${refunded}, dư ${balanceAfterRefund.balance}`,
    );
    const againRefunded = await refunds.refundFor({
      cancelledRequestId: closed.queue.cancelledRequestId,
      actorUserId: Member,
    });
    check(
      'và chỉ hoàn MỘT lần dù gọi lại',
      againRefunded === 0 &&
        (await ledger.getSummary(Member)).balance === 2_000,
    );

    await dataSource.query(
      `UPDATE system_configs SET value_json = $1
       WHERE config_key = 'point.redemption'`,
      [JSON.stringify({ vndPerPoint: 2_000 })],
    );

    // ── 4. Thiếu giá trị ước tính ───────────────────────────────────────────
    console.log('\n4. Bài không khai giá: không đổi điểm, bonus bằng 0');

    const noPriceId = randomUUID();
    await seedPost({
      postId: noPriceId,
      postType: 'OFFER',
      publishedDaysAgo: 1,
    });
    await requestFrom(noPriceId, Nearby, 1);
    const noPriceQuote = await quotes.handle({
      postId: noPriceId,
      userId: Nearby,
    });
    check(
      'không khai giá thì KHÔNG đổi được, và lý do nói đúng chuyện đó',
      noPriceQuote.quote.redeemable === false &&
        noPriceQuote.quote.unavailableReason === 'NO_ESTIMATED_VALUE',
      String(noPriceQuote.quote.unavailableReason),
    );
    check(
      'nhưng vẫn không phải "cho không": 0 điểm, không phải đổi miễn phí',
      quoteRedemption(null, { vndPerPoint: 2_000 }).points === 0,
    );
    check(
      'và bonus theo giá trị bằng 0, không âm và không lỗi',
      computeGiftValueBonus({
        estimatedValueVnd: 0,
        vndPerPoint: 2_000,
        accuracyPercent: 100,
        maxValueVnd: 5_000_000,
      }).points === 0,
    );

    // ── 5. Sửa đánh giá trước hạn thì thưởng theo bản CUỐI ──────────────────
    console.log(
      '\n5. Đánh giá 70% rồi sửa 100%: tại hạn cộng theo 100%, MỘT lần',
    );

    const reviewPostId = randomUUID();
    await seedPost({
      postId: reviewPostId,
      postType: 'OFFER',
      publishedDaysAgo: 10,
      estimatedValueVnd: 1_000_000,
    });
    const reviewDealId = randomUUID();
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status,
          accepted_at, completed_at)
       VALUES ($1, $2, $3, $4, 1, 'COMPLETED',
               now() - interval '9 days', now() - interval '1 day')`,
      [reviewDealId, reviewPostId, Giver, Member],
    );
    await reviews.submitReview({
      globalId: randomUUID(),
      transactionId: reviewDealId,
      reviewerId: Member,
      revieweeId: Giver,
      reviewerRole: 'RECEIVER' as never,
      rating: 4,
      accuracyPercent: 70,
      comment: 'Mô tả hơi khác',
    });
    const editedReview = await reviews.editReview({
      transactionId: reviewDealId,
      reviewerId: Member,
      rating: 5,
      accuracyPercent: 100,
      comment: 'Xem lại thì đúng mô tả',
    });
    check(
      'sửa trước hạn được, và bản cũ 70% được giữ lại',
      editedReview.review.accuracyPercent === 100 &&
        editedReview.review.previousAccuracyPercent === 70,
      `${String(editedReview.review.accuracyPercent)} / cũ ${String(editedReview.review.previousAccuracyPercent)}`,
    );

    // Chưa tới hạn: truy vấn chốt thưởng KHÔNG được trả lượt này.
    const notDueYet = await reviews.findUnsettledValueBonuses({
      graceDays: 7,
      limit: 50,
    });
    check(
      'chưa hết hạn thì chưa chốt — trước hạn con số còn sửa được',
      notDueYet.every((row) => row.transactionId !== reviewDealId),
      `${notDueYet.length} lượt tới hạn`,
    );

    // Tới hạn: phải lấy bản CUỐI (100%), không phải bản đầu (70%).
    await dataSource.query(
      `UPDATE gift_transactions SET completed_at = now() - interval '8 days'
       WHERE global_id = $1`,
      [reviewDealId],
    );
    const dueNow = (
      await reviews.findUnsettledValueBonuses({ graceDays: 7, limit: 50 })
    ).filter((row) => row.transactionId === reviewDealId);
    check(
      'tại hạn, truy vấn chốt thưởng đọc mức chính xác của bản CUỐI',
      dueNow.length === 1 && dueNow[0].accuracyPercent === 100,
      `${dueNow.length} lượt, ${String(dueNow[0]?.accuracyPercent)}%`,
    );

    const bonus = computeGiftValueBonus({
      estimatedValueVnd: Number(dueNow[0]?.estimatedValueVnd ?? 0),
      vndPerPoint: 2_000,
      accuracyPercent: dueNow[0]?.accuracyPercent ?? 0,
      maxValueVnd: 5_000_000,
    });
    await ledger.appendAdjustment({
      userId: Giver,
      ruleCode: 'GIFT_VALUE_BONUS_GIVER',
      delta: bonus.points,
      referenceType: 'GIFT_TRANSACTION',
      referenceId: reviewDealId,
      idempotencyKey: `GIFT_VALUE_BONUS_GIVER:${reviewDealId}`,
      actor: 'SYSTEM',
      source: 'REVIEW_SETTLEMENT',
      reason: `Thưởng theo giá trị, mức chính xác ${String(dueNow[0]?.accuracyPercent)}%`,
    });
    check(
      'bonus tính theo 100%, không theo 70% của bản đầu',
      bonus.points === 500,
      `${bonus.points} điểm`,
    );
    const settledTwice = await reviews.findUnsettledValueBonuses({
      graceDays: 7,
      limit: 50,
    });
    check(
      'chốt rồi thì lượt sau không nhặt lại — cộng đúng MỘT lần',
      settledTwice.every((row) => row.transactionId !== reviewDealId),
    );

    // Hết hạn thì khoá: repository từ chối lượt sửa thứ hai.
    check(
      'đã sửa một lần thì không sửa được nữa, kể cả còn trong hạn',
      await reviews
        .editReview({
          transactionId: reviewDealId,
          reviewerId: Member,
          rating: 1,
          accuracyPercent: 0,
          comment: null,
        })
        .then(() => false)
        .catch(() => true),
    );

    // Không ai đánh giá: mức mặc định của `review.grace` được dùng.
    const silentDealId = randomUUID();
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status,
          accepted_at, completed_at)
       VALUES ($1, $2, $3, $4, 1, 'COMPLETED',
               now() - interval '20 days', now() - interval '8 days')`,
      [silentDealId, reviewPostId, Giver, Nearby],
    );
    const silent = (
      await reviews.findUnsettledValueBonuses({ graceDays: 7, limit: 50 })
    ).filter((row) => row.transactionId === silentDealId);
    check(
      'không ai đánh giá thì mức chính xác về null — tín hiệu "áp mặc định"',
      silent.length === 1 && silent[0].accuracyPercent === null,
      `${silent.length} lượt, ${String(silent[0]?.accuracyPercent)}`,
    );

    // ── 6. Bài WANTED ───────────────────────────────────────────────────────
    console.log('\n6. Bài Muốn Nhận: cùng đồng hồ, không có CTA đổi điểm');

    const wantedId = randomUUID();
    const wanted = await seedPost({
      postId: wantedId,
      postType: 'WANTED',
      publishedDaysAgo: 2,
    });
    const [wantedRow] = await dataSource.query<
      { selection_deadline: Date; expires_at: Date; selection_mode: string }[]
    >(
      `SELECT selection_deadline, expires_at, selection_mode
       FROM posts WHERE global_id = $1`,
      [wantedId],
    );
    check(
      'WANTED cũng có mốc 7 ngày và hạn 37 ngày như OFFER (CHỐT-10 mục 1)',
      daysBetween(wanted.publishedAt, wantedRow.selection_deadline) ===
        SelectionWindowDays &&
        daysBetween(wanted.publishedAt, wantedRow.expires_at) === 37,
      `${daysBetween(wanted.publishedAt, wantedRow.selection_deadline)} + ${daysBetween(wantedRow.selection_deadline, wantedRow.expires_at)}`,
    );
    check(
      'và nhận được chế độ chọn người như OFFER',
      wantedRow.selection_mode === 'OPTIMAL',
      wantedRow.selection_mode,
    );

    await requestFrom(wantedId, Nearby, 1);
    const wantedQuote = await quotes.handle({
      postId: wantedId,
      userId: Nearby,
    });
    check(
      'nhưng KHÔNG đổi được bằng điểm — lý do gộp vào NOT_AVAILABLE',
      wantedQuote.quote.redeemable === false &&
        wantedQuote.quote.unavailableReason === 'NOT_AVAILABLE',
      String(wantedQuote.quote.unavailableReason),
    );

    // Vai tặng/nhận đảo đúng: bài WANTED thì người XIN là người tặng.
    const wantedAccept = await requests.acceptRequest({
      requestId: await requestFrom(wantedId, Member, 1),
      postId: wantedId,
      actorUserId: Giver,
      transactionId: randomUUID(),
    });
    check(
      'người xin một bài Muốn Nhận trở thành người TẶNG (CHỐT-10 mục 1.1)',
      wantedAccept.giverId === Member && wantedAccept.receiverId === Giver,
      `tặng ${wantedAccept.giverId}, nhận ${wantedAccept.receiverId}`,
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
        ? 'Acceptance CHỐT-10: sáu tình huống của mục 5 đi đúng đường'
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
