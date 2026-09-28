/**
 * Chạy vòng đời bài đăng trên Postgres THẬT.
 *
 * Vì sao cần script riêng: unit test của hai use case này mock cả repository,
 * nên không câu SQL nào được thực thi. Toàn bộ phần khó — `FOR UPDATE SKIP
 * LOCKED`, phép biến đổi `jsonb` khi rao vặt thành bài tặng, `make_interval`,
 * và bộ đếm quota loại chính bài đang gia hạn — chỉ lộ ra khi gặp database.
 *
 *   npm run test:lifecycle
 */
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { CharityTransferOutcome } from '../src/domain/ports/repository';
import * as entities from '../src/infrastructure/entity';
import { PostEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_lifecycle_check';
const AuthorId = '99999999-9999-4999-8999-999999999911';
const OtherId = '99999999-9999-4999-8999-999999999912';
const ThirdId = '99999999-9999-4999-8999-999999999913';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function postId(index: number): string {
  return `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`;
}

interface SeedPost {
  index: number;
  postType: string;
  status: string;
  /** Số ngày tính từ bây giờ; âm là đã quá hạn. `null` là không có hạn. */
  expiresInDays: number | null;
  details?: Record<string, unknown>;
  renewedCount?: number;
  remaining?: number;
  authorId?: string;
}

async function seed(dataSource: DataSource, posts: SeedPost[]): Promise<void> {
  // post_media có FK sang posts; xoá ảnh trước để không vướng ràng buộc.
  await dataSource.query('DELETE FROM post_media');
  await dataSource.query('DELETE FROM posts');

  for (const post of posts)
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, expires_at, renewed_count)
       VALUES ($1, $2, $3, $4, 'Bài kiểm tra vòng đời',
               'Mô tả đủ dài cho bài kiểm tra vòng đời',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', $5, 1, $6, $7::jsonb,
               CASE WHEN $8::int IS NULL
                    THEN NULL
                    ELSE now() + make_interval(days => $8::int) END,
               $9)`,
      [
        postId(post.index),
        post.postType,
        post.authorId ?? AuthorId,
        CategoryId,
        post.status,
        post.remaining ?? 1,
        JSON.stringify(post.details ?? {}),
        post.expiresInDays,
        post.renewedCount ?? 0,
      ],
    );
}

interface PostRow {
  status: string;
  post_type: string;
  details: Record<string, unknown>;
  renewed_count: number;
  expires_at: Date | null;
  charity_transfer_status: string | null;
  charity_transfer_note: string | null;
}

/**
 * Lấy bài ra khỏi kết quả union mà không cần hẹp kiểu ở từng chỗ gọi.
 *
 * `CharityTransferOutcome` là union có phân biệt, nên nhánh `NOT_FOUND` không
 * có thuộc tính `post` — optional chaining không cứu được, TypeScript từ chối
 * ngay lúc biên dịch.
 */
function outcomePost(outcome: CharityTransferOutcome): IPostEntity | undefined {
  return outcome.status === 'RECORDED' ? outcome.post : undefined;
}

async function readPost(
  dataSource: DataSource,
  index: number,
): Promise<PostRow> {
  const [row] = await dataSource.query<PostRow[]>(
    `SELECT status, post_type, details, renewed_count, expires_at,
            charity_transfer_status, charity_transfer_note
     FROM posts WHERE global_id = $1`,
    [postId(index)],
  );
  return row;
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  // Giữ mọi DataSource đã mở để `finally` đóng được hết: một kết nối còn sống
  // là `DROP DATABASE` thất bại, và lỗi thật bị che sau lỗi dọn dẹp.
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
    for (const [index, userId] of [AuthorId, OtherId, ThirdId].entries())
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE') ON CONFLICT DO NOTHING`,
        [userId, `chutai${index}`],
      );

    const posts = new PostRepository(PostEntity as never, dataSource.manager);
    const transactions = new GiftTransactionRepository(
      dataSource.manager,
      new ChatRepository(
        dataSource.manager,
        new AdminConfigRepository(dataSource.manager),
      ),
      new PointLedgerRepository(dataSource.manager),
    );

    // ── 1. Vòng quét hết hạn ────────────────────────────────────────────────
    console.log('Vòng quét hết hạn:\n');

    await seed(dataSource, [
      { index: 1, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: -1 },
      { index: 2, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 3, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: null },
      { index: 4, postType: 'OFFER', status: 'RESERVED', expiresInDays: -1 },
      { index: 5, postType: 'OFFER', status: 'DELIVERING', expiresInDays: -1 },
      {
        index: 6,
        postType: 'CLASSIFIED',
        status: 'PUBLISHED',
        expiresInDays: -1,
        details: { price: 250000, condition: 'LIKE_NEW', negotiable: true },
      },
      {
        index: 7,
        postType: 'CLASSIFIED',
        status: 'PUBLISHED',
        expiresInDays: -1,
        details: { condition: 'LIKE_NEW' },
      },
    ]);

    const swept = await posts.expireDuePosts(new Date());
    check(
      'đếm đúng số bài đã đóng và đã chuyển',
      swept.expired === 1 && swept.convertedToOffer === 2,
      JSON.stringify(swept),
    );

    check(
      'bài quá hạn chuyển sang EXPIRED',
      (await readPost(dataSource, 1)).status === 'EXPIRED',
    );
    check(
      'bài chưa tới hạn giữ nguyên PUBLISHED',
      (await readPost(dataSource, 2)).status === 'PUBLISHED',
    );
    check(
      'bài không có hạn không bị đụng tới',
      (await readPost(dataSource, 3)).status === 'PUBLISHED',
    );
    check(
      'bài RESERVED không bị cắt ngang giao dịch đang sống',
      (await readPost(dataSource, 4)).status === 'RESERVED',
    );
    check(
      'bài DELIVERING không bị cắt ngang giao dịch đang sống',
      (await readPost(dataSource, 5)).status === 'DELIVERING',
    );

    const converted = await readPost(dataSource, 6);
    check(
      'rao vặt hết hạn THÀNH bài Muốn Tặng, không biến mất',
      converted.post_type === 'OFFER' && converted.status === 'PUBLISHED',
      `${converted.post_type}/${converted.status}`,
    );
    check(
      'giá đã khai chuyển thành giá trị tham khảo',
      Number(converted.details.estimatedValue) === 250000,
      JSON.stringify(converted.details),
    );
    check(
      'không còn giá bán và cờ thương lượng trên bài tặng',
      !('price' in converted.details) && !('negotiable' in converted.details),
      JSON.stringify(converted.details),
    );
    check(
      'giữ lại tình trạng món đồ khi chuyển loại',
      converted.details.condition === 'LIKE_NEW',
    );
    check(
      'bài chuyển loại được cấp hạn mới, không mang hạn cũ đã quá',
      converted.expires_at !== null &&
        new Date(converted.expires_at).getTime() > Date.now(),
      String(converted.expires_at),
    );

    const convertedNoPrice = await readPost(dataSource, 7);
    check(
      'rao vặt thiếu giá vẫn chuyển được, không đẻ ra estimatedValue rỗng',
      convertedNoPrice.post_type === 'OFFER' &&
        !('estimatedValue' in convertedNoPrice.details),
      JSON.stringify(convertedNoPrice.details),
    );

    const sweptAgain = await posts.expireDuePosts(new Date());
    check(
      'chạy lại vòng quét không đổi gì thêm',
      sweptAgain.expired === 0 && sweptAgain.convertedToOffer === 0,
      JSON.stringify(sweptAgain),
    );

    // ── 2. Gia hạn ──────────────────────────────────────────────────────────
    console.log('\nGia hạn:\n');

    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await seed(dataSource, [
      { index: 10, postType: 'OFFER', status: 'EXPIRED', expiresInDays: -1 },
    ]);
    const first = await posts.renewPost({
      postId: postId(10),
      authorId: AuthorId,
      quota: 3,
      expiresAt: future,
    });
    check(
      'bài đã hết hạn gia hạn được và hiển thị lại',
      first.status === 'RENEWED' && first.post.status === 'PUBLISHED',
      first.status,
    );
    check(
      'bộ đếm gia hạn tăng lên 1',
      Number((await readPost(dataSource, 10)).renewed_count) === 1,
    );

    const second = await posts.renewPost({
      postId: postId(10),
      authorId: AuthorId,
      quota: 3,
      expiresAt: future,
    });
    check(
      'gia hạn lần hai bị chặn',
      second.status === 'LIMIT_REACHED',
      second.status,
    );

    await seed(dataSource, [
      {
        index: 11,
        postType: 'CLASSIFIED',
        status: 'PUBLISHED',
        expiresInDays: 5,
      },
    ]);
    check(
      'tin rao vặt không gia hạn được (nó tự chuyển loại khi hết hạn)',
      (
        await posts.renewPost({
          postId: postId(11),
          authorId: AuthorId,
          quota: 3,
          expiresAt: future,
        })
      ).status === 'NOT_RENEWABLE',
    );

    await seed(dataSource, [
      {
        index: 12,
        postType: 'OFFER',
        status: 'PUBLISHED',
        expiresInDays: 5,
        remaining: 0,
      },
    ]);
    check(
      'bài đã hết vật phẩm không gia hạn được',
      (
        await posts.renewPost({
          postId: postId(12),
          authorId: AuthorId,
          quota: 3,
          expiresAt: future,
        })
      ).status === 'NOT_RENEWABLE',
    );

    await seed(dataSource, [
      {
        index: 13,
        postType: 'OFFER',
        status: 'PUBLISHED',
        expiresInDays: 5,
        authorId: OtherId,
      },
    ]);
    check(
      'bài của người khác trả NOT_FOUND, không lộ là có thật',
      (
        await posts.renewPost({
          postId: postId(13),
          authorId: AuthorId,
          quota: 3,
          expiresAt: future,
        })
      ).status === 'NOT_FOUND',
    );

    // Quota: bài đang PUBLISHED phải được loại khỏi bộ đếm của chính nó.
    await seed(dataSource, [
      { index: 20, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
      { index: 21, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
    ]);
    check(
      'bài đang mở không tự chặn mình khi quota vừa đủ',
      (
        await posts.renewPost({
          postId: postId(20),
          authorId: AuthorId,
          quota: 2,
          expiresAt: future,
        })
      ).status === 'RENEWED',
    );

    await seed(dataSource, [
      { index: 30, postType: 'OFFER', status: 'EXPIRED', expiresInDays: -1 },
      { index: 31, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
      { index: 32, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
    ]);
    check(
      'bài hết hạn quay lại rổ quota nên bị chặn khi đã đầy',
      (
        await posts.renewPost({
          postId: postId(30),
          authorId: AuthorId,
          quota: 2,
          expiresAt: future,
        })
      ).status === 'QUOTA_EXCEEDED',
    );

    // ── 3. Xin chuyển về điểm từ thiện (F23) ────────────────────────────────
    console.log('\nChuyển về điểm từ thiện:\n');

    await seed(dataSource, [
      { index: 40, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
    ]);

    const requestedTransfer = await posts.requestCharityTransfer({
      postId: postId(40),
      authorId: AuthorId,
      note: 'Em không dùng nữa, nhờ bên mình chuyển giúp',
    });
    check(
      'chủ bài gửi được yêu cầu chuyển',
      requestedTransfer.status === 'RECORDED' &&
        requestedTransfer.post.charityTransferStatus === 'REQUESTED',
      requestedTransfer.status,
    );
    check(
      'lời nhắn được lưu lại cho Admin đọc',
      (await readPost(dataSource, 40)).charity_transfer_note ===
        'Em không dùng nữa, nhờ bên mình chuyển giúp',
    );
    check(
      'gửi lần hai khi đang chờ duyệt thì bị chặn',
      (
        await posts.requestCharityTransfer({
          postId: postId(40),
          authorId: AuthorId,
          note: null,
        })
      ).status === 'INVALID_STATE',
    );
    check(
      'bài của người khác trả NOT_FOUND',
      (
        await posts.requestCharityTransfer({
          postId: postId(40),
          authorId: OtherId,
          note: null,
        })
      ).status === 'NOT_FOUND',
    );

    // Từ chối: bài phải GIỮ NGUYÊN trạng thái cũ.
    const rejected = await posts.reviewCharityTransfer({
      postId: postId(40),
      approve: false,
    });
    check(
      'từ chối thì bài giữ nguyên PUBLISHED, không mất bài',
      rejected.status === 'RECORDED' &&
        rejected.post.status === 'PUBLISHED' &&
        rejected.post.charityTransferStatus === 'REJECTED',
      `${rejected.status}/${outcomePost(rejected)?.status ?? '-'}`,
    );
    check(
      'duyệt khi không còn yêu cầu nào đang chờ thì bị chặn',
      (
        await posts.reviewCharityTransfer({
          postId: postId(40),
          approve: true,
        })
      ).status === 'INVALID_STATE',
    );

    // Bị từ chối rồi vẫn gửi lại được — người dùng không bị khoá vĩnh viễn.
    check(
      'bị từ chối rồi vẫn gửi lại được',
      (
        await posts.requestCharityTransfer({
          postId: postId(40),
          authorId: AuthorId,
          note: null,
        })
      ).status === 'RECORDED',
    );

    const approved = await posts.reviewCharityTransfer({
      postId: postId(40),
      approve: true,
    });
    check(
      'duyệt thì bài vào Kho Từ Thiện Chung (ARCHIVED)',
      approved.status === 'RECORDED' &&
        approved.post.status === 'ARCHIVED' &&
        approved.post.charityTransferStatus === 'APPROVED',
      `${approved.status}/${outcomePost(approved)?.status ?? '-'}`,
    );

    await seed(dataSource, [
      {
        index: 41,
        postType: 'OFFER',
        status: 'REJECTED',
        expiresInDays: null,
      },
    ]);
    check(
      'bài bị Admin gỡ thì không xin chuyển kho được',
      (
        await posts.requestCharityTransfer({
          postId: postId(41),
          authorId: AuthorId,
          note: null,
        })
      ).status === 'INVALID_STATE',
    );

    // ── 3b. Hậu kiểm: Admin gỡ bài đang hiện, rồi trả lại ───────────────────
    console.log('\nHậu kiểm — Admin gỡ và trả lại bài:\n');

    await seed(dataSource, [
      { index: 60, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 61, postType: 'OFFER', status: 'RESERVED', expiresInDays: 30 },
      { index: 62, postType: 'OFFER', status: 'COMPLETED', expiresInDays: 30 },
    ]);
    const expiryBefore = (await readPost(dataSource, 60)).expires_at;

    check(
      'gỡ được bài ĐANG HIỆN — không cần nó từng ở PENDING_REVIEW',
      (await posts.moderateByAdmin({
        actorUserId: OtherId,
        postId: postId(60),
        status: 'REJECTED',
        expiresAt: null,
        reason: 'Hàng cấm',
      })) !== null,
    );
    const takenDown = await readPost(dataSource, 60);
    check('bài chuyển REJECTED', takenDown.status === 'REJECTED');
    check(
      'gỡ KHÔNG xoá hạn cũ — còn để trả lại được',
      takenDown.expires_at?.getTime() === expiryBefore?.getTime(),
      String(takenDown.expires_at),
    );

    check(
      'gỡ lại lần nữa thì không ghi thêm gì',
      (await posts.moderateByAdmin({
        actorUserId: OtherId,
        postId: postId(60),
        status: 'REJECTED',
        expiresAt: null,
        reason: 'Bấm nhầm hai lần',
      })) === null,
    );

    check(
      'trả lại được',
      (await posts.moderateByAdmin({
        actorUserId: OtherId,
        postId: postId(60),
        status: 'PUBLISHED',
        expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
        reason: 'Gỡ nhầm',
      })) !== null,
    );
    const restored = await readPost(dataSource, 60);
    check('bài hiện lại', restored.status === 'PUBLISHED');
    check(
      'GIỮ NGUYÊN đồng hồ cũ, không thưởng thêm ba tháng',
      restored.expires_at?.getTime() === expiryBefore?.getTime(),
      String(restored.expires_at),
    );

    const [audit] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM admin_audit_logs
       WHERE resource_id = $1 AND action = 'MODERATE_POST'`,
      [postId(60)],
    );
    check(
      'hai lần đổi thật ghi HAI dòng audit, lần bấm trùng không ghi',
      Number(audit?.total) === 2,
      `${audit?.total} dòng`,
    );

    check(
      'KHÔNG gỡ được bài đang có người nhận (RESERVED)',
      (await posts.moderateByAdmin({
        actorUserId: OtherId,
        postId: postId(61),
        status: 'REJECTED',
        expiresAt: null,
        reason: 'thử',
      })) === null,
    );
    check(
      'KHÔNG gỡ được bài đã trao xong',
      (await posts.moderateByAdmin({
        actorUserId: OtherId,
        postId: postId(62),
        status: 'REJECTED',
        expiresAt: null,
        reason: 'thử',
      })) === null,
    );

    console.log('\nĐóng lượt trao còn hiệu lực khi gỡ bài:\n');
    await seed(dataSource, [
      { index: 70, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
    ]);
    for (const [txId, receiver, status] of [
      // Yêu cầu chưa duyệt thuộc gift_requests. gift_transactions chỉ được
      // tạo sau khi duyệt; migration chặn trạng thái REQUESTED ở bảng này.
      ['70000000-0000-4000-8000-000000000001', OtherId, 'ACCEPTED'],
      ['70000000-0000-4000-8000-000000000002', ThirdId, 'CANCELLED'],
    ] as const)
      await dataSource.query(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, quantity, status)
         VALUES ($1, $2, $3, $4, 1, $5)`,
        [txId, postId(70), AuthorId, receiver, status],
      );

    const closed = await transactions.closeOpenRequestsForPost({
      postId: postId(70),
      closedBy: AuthorId,
      reason: 'Người đăng đã gỡ bài',
    });
    check(
      'trả về đúng người có lượt trao còn hiệu lực',
      closed.length === 1 && closed[0]?.receiverId === OtherId,
      `${closed.length} yêu cầu`,
    );

    const [afterClose] = await dataSource.query<
      { status: string; close_reason: string | null }[]
    >(
      `SELECT status, close_reason FROM gift_transactions WHERE global_id = $1`,
      ['70000000-0000-4000-8000-000000000001'],
    );
    check('yêu cầu chuyển CANCELLED', afterClose?.status === 'CANCELLED');
    check(
      'và ghi lý do để người xin đọc được',
      afterClose?.close_reason === 'Người đăng đã gỡ bài',
      afterClose?.close_reason ?? 'null',
    );
    const [alreadyCancelled] = await dataSource.query<
      { status: string; close_reason: string | null }[]
    >(
      `SELECT status, close_reason FROM gift_transactions WHERE global_id = $1`,
      ['70000000-0000-4000-8000-000000000002'],
    );
    check(
      'không ghi đè lượt trao đã huỷ từ trước',
      alreadyCancelled?.status === 'CANCELLED' &&
        alreadyCancelled.close_reason === null,
    );
    check(
      'gọi lại không đóng thêm gì',
      (
        await transactions.closeOpenRequestsForPost({
          postId: postId(70),
          closedBy: AuthorId,
          reason: 'bấm nhầm lần hai',
        })
      ).length === 0,
    );

    // Dọn trước khi `seed()` của mục sau xoá sạch bảng `posts`: lượt trao còn
    // trỏ vào bài 70 sẽ chặn lệnh xoá đó bằng khoá ngoại.
    await dataSource.query(`DELETE FROM gift_transactions WHERE post_id = $1`, [
      postId(70),
    ]);

    console.log('\nHạn mức đăng bài: MỘT rổ, MỘT con số\n');
    const [merged] = await dataSource.query<
      { code: string; rank: string; limit_value: number }[]
    >(`
      SELECT policy.code, value."rank", value.limit_value
      FROM capability_policies policy
      INNER JOIN config_revisions revision ON revision.id = policy.revision_id
      INNER JOIN capability_rank_values value ON value.policy_id = policy.id
      WHERE policy.code = 'POST_OPEN' AND value."rank" = 'MEMBER'
        AND revision.effective_to IS NULL
    `);
    check(
      'POST_OPEN có mặt, giữ nguyên con số cũ của POST_OFFER',
      merged?.limit_value === 3,
      `${merged?.limit_value}`,
    );

    const leftovers = await dataSource.query<{ code: string }[]>(`
      SELECT policy.code
      FROM capability_policies policy
      INNER JOIN config_revisions revision ON revision.id = policy.revision_id
      WHERE policy.code IN ('POST_OFFER', 'POST_WANTED')
        AND revision.effective_to IS NULL
    `);
    check(
      'hai capability cũ đã rút khỏi bản đang hiệu lực',
      leftovers.length === 0,
      leftovers.map((row) => row.code).join(', '),
    );

    console.log('\nTìm kiếm trên feed:\n');
    await seed(dataSource, [
      { index: 80, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 81, postType: 'WANTED', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 82, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
    ]);
    await dataSource.query(
      `UPDATE posts SET title = 'Nồi cơm điện Sharp', description = 'Còn tốt'
       WHERE global_id = $1`,
      [postId(80)],
    );
    await dataSource.query(
      `UPDATE posts SET title = 'Cần một cái quạt', description = 'Nhà nóng quá'
       WHERE global_id = $1`,
      [postId(81)],
    );
    await dataSource.query(
      `UPDATE posts SET title = 'Bếp từ', description = 'Kèm nồi cơm điện cũ'
       WHERE global_id = $1`,
      [postId(82)],
    );

    const origin = { lat: 10.7724, lng: 106.698 };
    const search = async (keyword?: string, postType?: string) =>
      posts.findNearbyPosts({
        origin,
        radiusMeters: 50_000,
        postType: postType as never,
        keyword,
        skip: 0,
        take: 20,
      });

    check(
      'không từ khoá, không loại: trả HẾT — feed trộn',
      (await search()).total === 3,
      `${(await search()).total} bài`,
    );
    check(
      'tìm "nồi cơm điện" ra cả bài có từ đó trong MÔ TẢ',
      (await search('nồi cơm điện')).total === 2,
      `${(await search('nồi cơm điện')).total} bài`,
    );
    check(
      'gõ KHÔNG DẤU vẫn ra — "noi com dien"',
      (await search('noi com dien')).total === 2,
      `${(await search('noi com dien')).total} bài`,
    );
    check(
      'gõ HOA/thường lẫn lộn vẫn ra',
      (await search('NỒI Cơm')).total === 2,
    );
    check(
      'mọi từ phải cùng xuất hiện — "nồi quạt" không ra gì',
      (await search('nồi quạt')).total === 0,
    );
    check(
      'ký tự lạ không làm vỡ câu truy vấn',
      (await search("nồi & ' cơm")).total >= 0,
    );
    check(
      'lọc loại bài CỘNG từ khoá cùng lúc',
      (await search('nồi cơm điện', 'OFFER')).total === 2,
      `${(await search('nồi cơm điện', 'OFFER')).total} bài`,
    );
    check(
      'và lọc loại khác thì không dính bài của loại này',
      (await search('nồi cơm điện', 'WANTED')).total === 0,
    );

    // Index phải được DÙNG, không chỉ tồn tại. Biểu thức trong index sai một
    // ký tự so với câu truy vấn là Postgres lặng lẽ quét tuần tự cả bảng.
    const plan = await dataSource.query<{ 'QUERY PLAN': string }[]>(`
      EXPLAIN SELECT 1 FROM posts
      WHERE to_tsvector('simple', chantam_unaccent(coalesce(title, '') || ' ' || coalesce(description, '')))
            @@ plainto_tsquery('simple', chantam_unaccent('nồi cơm'))
    `);
    const planText = plan.map((row) => row['QUERY PLAN']).join(' ');
    check(
      'câu tìm kiếm DÙNG được index GIN',
      planText.includes('IDX_posts_search') || planText.includes('Bitmap'),
      planText.slice(0, 60),
    );

    // Thứ tự ổn định: cùng khoảng cách thì khoá chính chốt thứ tự, nếu không
    // lật trang bằng OFFSET sẽ lặp bài hoặc bỏ sót bài.
    const firstPage = await posts.findNearbyPosts({
      origin,
      radiusMeters: 50_000,
      skip: 0,
      take: 2,
    });
    const secondPage = await posts.findNearbyPosts({
      origin,
      radiusMeters: 50_000,
      skip: 2,
      take: 2,
    });
    const seen = [...firstPage.items, ...secondPage.items].map(
      (item) => item.post.globalId,
    );
    check(
      'lật trang không lặp bài dù mọi bài cùng một toạ độ',
      new Set(seen).size === seen.length,
      `${seen.length} bài, ${new Set(seen).size} khác nhau`,
    );

    console.log('\nBản đồ gom cụm:\n');
    await seed(dataSource, [
      { index: 90, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 91, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 92, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 93, postType: 'WANTED', status: 'PUBLISHED', expiresInDays: 30 },
    ]);
    // Ba bài sát nhau ở Quận 1, một bài ở xa hẳn.
    for (const [index, lng, lat] of [
      [90, 106.698, 10.7724],
      [91, 106.6981, 10.7725],
      [92, 106.6982, 10.7726],
      [93, 106.75, 10.82],
    ] as const)
      await dataSource.query(
        `UPDATE posts
         SET location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
         WHERE global_id = $1`,
        [postId(index), lng, lat],
      );

    const bbox = {
      minLat: 10.7,
      maxLat: 10.9,
      minLng: 106.6,
      maxLng: 106.8,
    };
    const coarse = await posts.findMapClusters({
      ...bbox,
      stepDegrees: 0.0625,
      cellLimit: 500,
    });
    check(
      'gom 4 bài thành 2 cụm khi ô đủ to',
      coarse.clusters.length === 2,
      `${coarse.clusters.length} cụm`,
    );
    check(
      'TỔNG là con số thật của cả khung nhìn, không phải số cụm',
      coarse.total === 4,
      `${coarse.total} bài`,
    );
    check(
      'cụm đông nhất đếm đúng 3 bài',
      coarse.clusters[0]?.count === 3,
      `${coarse.clusters[0]?.count}`,
    );
    check(
      'cụm nhiều bài KHÔNG kèm chi tiết bài nào',
      coarse.clusters[0]?.marker === null,
    );

    const lonely = coarse.clusters.find((cluster) => cluster.count === 1);
    check(
      'cụm một bài thì kèm đủ dữ liệu thẻ xem nhanh',
      lonely?.marker !== null && typeof lonely?.marker?.title === 'string',
      lonely?.marker?.title,
    );

    const fine = await posts.findMapClusters({
      ...bbox,
      stepDegrees: 0.00006103515625,
      cellLimit: 500,
    });
    check(
      'ô nhỏ thì tách ra thành 4 cụm riêng',
      fine.clusters.length === 4,
      `${fine.clusters.length} cụm`,
    );
    check(
      'và mỗi cụm mang chi tiết của chính nó',
      fine.clusters.every((cluster) => cluster.marker !== null),
    );

    const filtered = await posts.findMapClusters({
      ...bbox,
      postType: 'WANTED' as never,
      stepDegrees: 0.0625,
      cellLimit: 500,
    });
    check(
      'lọc loại bài áp TRƯỚC khi gom cụm',
      filtered.total === 1 && filtered.clusters.length === 1,
      `${filtered.total} bài / ${filtered.clusters.length} cụm`,
    );

    const capped = await posts.findMapClusters({
      ...bbox,
      stepDegrees: 0.00006103515625,
      cellLimit: 2,
    });
    check(
      'chạm trần thì cắt danh sách ô',
      capped.clusters.length === 2,
      `${capped.clusters.length} cụm`,
    );
    check(
      'nhưng TỔNG và SỐ Ô vẫn là con số thật — đây là chỗ bản cũ im lặng',
      capped.total === 4 && capped.cellCount === 4,
      `${capped.total} bài / ${capped.cellCount} ô`,
    );

    // ── 4. Marker bản đồ mang dữ liệu thẻ xem nhanh (F29) ───────────────────
    console.log('\nThẻ xem nhanh trên bản đồ:\n');

    await seed(dataSource, [
      { index: 50, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
    ]);
    await dataSource.query(
      `UPDATE posts SET is_sos = true, title = 'Cần gấp áo ấm' WHERE global_id = $1`,
      [postId(50)],
    );
    // Ba ảnh, chèn lệch thứ tự để chứng minh truy vấn lấy ĐÚNG ảnh sort_order
    // nhỏ nhất chứ không phải ảnh chèn trước.
    for (const [order, key] of [
      [2, 'posts/p50/c.jpg'],
      [0, 'posts/p50/a.jpg'],
      [1, 'posts/p50/b.jpg'],
    ] as [number, string][])
      await dataSource.query(
        `INSERT INTO post_media (post_id, r2_key, sort_order) VALUES ($1, $2, $3)`,
        [postId(50), key, order],
      );

    // Ô nhỏ nhất để mỗi bài ra một cụm riêng — phần này kiểm dữ liệu thẻ xem
    // nhanh, không kiểm việc gom cụm.
    const markerCells = await posts.findMapClusters({
      minLat: 10.0,
      maxLat: 11.5,
      minLng: 106.0,
      maxLng: 107.5,
      stepDegrees: 0.00006103515625,
      cellLimit: 500,
    });
    const markers = markerCells.clusters
      .map((cluster) => cluster.marker)
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const marker = markers.find((row) => row.globalId === postId(50));
    check(
      'marker mang tiêu đề bài',
      marker?.title === 'Cần gấp áo ấm',
      String(marker?.title),
    );
    check('marker mang cờ SOS', marker?.isSos === true, String(marker?.isSos));
    check(
      'ảnh thumbnail là ảnh có sort_order nhỏ nhất',
      marker?.thumbnailKey === 'posts/p50/a.jpg',
      String(marker?.thumbnailKey),
    );
    check(
      'bài 3 ảnh vẫn chỉ ra MỘT marker, không nhân bản pin',
      markers.filter((row) => row.globalId === postId(50)).length === 1,
      `${markers.filter((row) => row.globalId === postId(50)).length} marker`,
    );

    await seed(dataSource, [
      { index: 51, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
    ]);
    const noPhoto = (
      await posts.findMapClusters({
        minLat: 10.0,
        maxLat: 11.5,
        minLng: 106.0,
        maxLng: 107.5,
        stepDegrees: 0.00006103515625,
        cellLimit: 500,
      })
    ).clusters
      .map((cluster) => cluster.marker)
      .find((row) => row?.globalId === postId(51));
    check(
      'bài không ảnh thì thumbnailKey là null',
      noPhoto?.thumbnailKey === null,
      String(noPhoto?.thumbnailKey),
    );
  } finally {
    for (const source of opened)
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    failures.length === 0
      ? '\nTất cả bất biến vòng đời đều giữ được.'
      : `\n${failures.length} bất biến bị vi phạm:\n- ${failures.join('\n- ')}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
