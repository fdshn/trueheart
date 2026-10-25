/**
 * Rao vặt chỉ đăng tin và liên hệ, trên Postgres THẬT (PR #46 §8).
 *
 * - Trạng thái `SOLD`, `HIDDEN` có trong enum; chủ bài đổi trạng thái bằng MỘT câu UPDATE có
 *   điều kiện "từ trạng thái nào" — `SOLD` là điểm cuối, bài cho/nhận không bị đụng.
 * - Job tự chọn người nhận bỏ qua bài Rao vặt khi luồng cũ đang tắt.
 * - Khoá cấu hình mặc định 0.
 *
 *   npm run test:classified-lifecycle
 */
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import { GiftRequestEntity, PostEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_classified_lifecycle_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const Seller = '7b100000-0000-4000-8000-000000000001';
const Buyer = '7b100000-0000-4000-8000-000000000002';
const Classified = '7b200000-0000-4000-8000-000000000001';
const Offer = '7b200000-0000-4000-8000-000000000002';
const DueClassified = '7b200000-0000-4000-8000-000000000003';
const DueOffer = '7b200000-0000-4000-8000-000000000004';
const QuotaHidden = '7b200000-0000-4000-8000-000000000005';
const QuotaNew = '7b200000-0000-4000-8000-000000000006';

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
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);
    for (const [id, username] of [
      [Seller, 'cl_seller'],
      [Buyer, 'cl_buyer'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );
    const addPost = (id: string, type: string, due = false) =>
      sql(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count, selection_deadline)
         VALUES ($1, $2, $3, $4, 'Bài kiểm Rao vặt', 'Mô tả đủ dài cho bài kiểm Rao vặt',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0,
                 CASE WHEN $5::boolean THEN now() - interval '1 hour' END)`,
        [id, type, Seller, CategoryId, due],
      );
    await addPost(Classified, 'CLASSIFIED');
    await addPost(Offer, 'OFFER');
    await addPost(DueClassified, 'CLASSIFIED', true);
    await addPost(DueOffer, 'OFFER', true);
    for (const postId of [DueClassified, DueOffer])
      await sql(
        `INSERT INTO gift_requests (global_id, post_id, requester_id, message, status)
         VALUES (gen_random_uuid(), $1, $2, 'Yêu cầu tồn từ trước', 'PENDING')`,
        [postId, Buyer],
      );

    console.log('1. Cấu hình và enum');
    const config = new AdminConfigRepository(dataSource.manager);
    check(
      'classified.legacy_transactions_enabled mặc định 0',
      (await config.getConfigValue(
        'classified.legacy_transactions_enabled',
      )) === 0,
    );
    const [labels] = await sql(
      `SELECT string_agg(enumlabel, ',' ORDER BY enumlabel) AS labels
       FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'gift_posts_status_enum'`,
    );
    check(
      'enum trạng thái bài có SOLD và HIDDEN',
      String(labels.labels).split(',').includes('SOLD') &&
        String(labels.labels).split(',').includes('HIDDEN'),
      labels.labels,
    );

    console.log('\n2. Chủ bài đổi trạng thái Rao vặt');
    const posts = new PostRepository(PostEntity as never, dataSource.manager);
    const editable = [
      GiftPostStatuses.PUBLISHED,
      GiftPostStatuses.RESERVED,
      GiftPostStatuses.HIDDEN,
    ];
    const to = (status: GiftPostStatuses, postId = Classified) =>
      posts.updateClassifiedStatus({ postId, to: status, from: editable });
    check(
      'Đang bán → Giữ chỗ',
      (await to(GiftPostStatuses.RESERVED))?.status === 'RESERVED',
    );
    check(
      'Giữ chỗ → Ẩn → Đang bán',
      (await to(GiftPostStatuses.HIDDEN))?.status === 'HIDDEN' &&
        (await to(GiftPostStatuses.PUBLISHED))?.status === 'PUBLISHED',
    );
    check(
      'Đang bán → Đã bán',
      (await to(GiftPostStatuses.SOLD))?.status === 'SOLD',
    );
    check(
      'Đã bán là điểm cuối: đổi tiếp trả null, không ghi',
      (await to(GiftPostStatuses.PUBLISHED)) === null &&
        (await posts.findOneBy({ globalId: Classified }))?.status === 'SOLD',
    );
    check(
      'bài cho/nhận không bị đụng',
      (await to(GiftPostStatuses.SOLD, Offer)) === null &&
        (await posts.findOneBy({ globalId: Offer }))?.status === 'PUBLISHED',
    );
    const [publicCount] = await sql(
      `SELECT count(*)::int AS n FROM posts
        WHERE global_id = $1 AND status = ANY($2::gift_posts_status_enum[])`,
      [Classified, ['PUBLISHED', 'RESERVED']],
    );
    check('bài đã bán không còn ở trạng thái công khai', publicCount.n === 0);

    console.log('\n3. Job tự chọn người nhận');
    const requests = new GiftRequestRepository(
      GiftRequestEntity as never,
      dataSource.manager,
      {
        openRoomWithinTransaction: async () => undefined,
        lockRoomWithinTransaction: async () => undefined,
      } as never,
      new PointLedgerRepository(dataSource.manager),
    );
    const dueIds = (rows: { postId: string }[]) =>
      rows.map((row) => row.postId).sort();
    const defaultDue = await requests.findPostsDueForSelection(10);
    check(
      'mặc định (luồng cũ tắt): bỏ qua bài Rao vặt tới hạn',
      JSON.stringify(dueIds(defaultDue)) === JSON.stringify([DueOffer]),
      JSON.stringify(dueIds(defaultDue)),
    );
    const legacyDue = await requests.findPostsDueForSelection(10, true);
    check(
      'luồng cũ bật: Rao vặt tới hạn có mặt lại',
      JSON.stringify(dueIds(legacyDue)) ===
        JSON.stringify([DueClassified, DueOffer].sort()),
    );

    console.log('\n4. Quota đăng bài');
    // Tin ẩn mở lại được mà không qua phép kiểm quota, nên nó phải chiếm suất ngay khi ẩn:
    // không thì ẩn tin → đăng tin mới → mở lại là vượt quota.
    const quotaAuthor = Buyer;
    await addPost(QuotaHidden, 'CLASSIFIED');
    await sql(
      `UPDATE posts SET author_id = $1, status = 'HIDDEN' WHERE global_id = $2`,
      [quotaAuthor, QuotaHidden],
    );
    const newPost = (globalId: string) => ({
      globalId,
      postType: 'CLASSIFIED' as never,
      authorId: quotaAuthor,
      categoryId: CategoryId,
      title: 'Tin mới khi đang có tin ẩn',
      description: 'Mô tả đủ dài cho tin mới khi đang có tin ẩn',
      location: { lat: 10.7724, lng: 106.698 },
      areaLabel: 'Quận 1',
      status: 'PUBLISHED' as never,
      totalQuantity: 1,
      remainingQuantity: 1,
      details: {},
      expiresAt: null,
      renewedCount: 0,
      reactionCount: 0,
      commentCount: 0,
      shareCount: 0,
      isSos: false,
      deliveryMethod: null,
      shipPayer: null,
      charityTransferStatus: null,
      charityTransferRequestedAt: null,
      charityTransferNote: null,
      selectionMode: 'OPTIMAL' as never,
      selectionDeadline: null,
      deletedAt: null,
    });
    check(
      'tin ẩn chiếm suất: quota 1 thì không đăng thêm được',
      (await posts.createPostWithinQuota(quotaAuthor, 1, newPost(QuotaNew))) ===
        false,
    );
    await sql(`UPDATE posts SET status = 'SOLD' WHERE global_id = $1`, [
      QuotaHidden,
    ]);
    check(
      'tin đã bán trả suất: quota 1 đăng được tin mới',
      (await posts.createPostWithinQuota(quotaAuthor, 1, newPost(QuotaNew))) ===
        true,
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
        ? 'Rao vặt: trạng thái do chủ bài đổi trong một câu có điều kiện, SOLD là điểm cuối, job tự chọn bỏ qua Rao vặt khi luồng cũ tắt'
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
