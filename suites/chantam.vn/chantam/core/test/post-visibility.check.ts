/**
 * Ai xem được chi tiết một bài (`GET /posts/:id`, `GET /gift-posts/:id`) trên Postgres THẬT.
 *
 * ## Vì sao cần
 *
 * `findPublicByGlobalId` từng chỉ cho xem bài `PUBLISHED`/`RESERVED` hoặc bài của chính
 * mình. Lượt trao cuối xong thì bài sang `COMPLETED`, và NGƯỜI CÒN LẠI trong lượt trao —
 * người nhận ở bài Muốn Tặng, người tặng ở bài Muốn Nhận — nhận 404 khi mở lại món đồ
 * mình vừa trao/nhận (UAT 20/10). Use case phía dưới có sẵn ngoại lệ cho người trong cuộc
 * nhưng không bao giờ chạy tới: bài đã bị lọc mất ở câu SQL.
 *
 * Unit test mock repository nên không thấy câu SQL; chỉ database trả lời được.
 *
 *   npm run test:post-visibility
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import { PostEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_post_visibility_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const AuthorId = '99999999-9999-4999-8999-99999999f001';
const CounterpartId = '99999999-9999-4999-8999-99999999f002';
const OutsiderId = '99999999-9999-4999-8999-99999999f003';
const CancelledId = '99999999-9999-4999-8999-99999999f004';

const OfferPost = '88888888-8888-4888-8888-88888888f001';
const WantedPost = '88888888-8888-4888-8888-88888888f002';
const DeliveringPost = '88888888-8888-4888-8888-88888888f003';
const DeletedPost = '88888888-8888-4888-8888-88888888f004';
const PublishedPost = '88888888-8888-4888-8888-88888888f005';

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
    for (const [id, username] of [
      [AuthorId, 'tacgia_hienthi'],
      [CounterpartId, 'doiphuong_hienthi'],
      [OutsiderId, 'nguoingoai_hienthi'],
      [CancelledId, 'dahuy_hienthi'],
    ])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    const addPost = async (
      id: string,
      postType: 'OFFER' | 'WANTED',
      status: string,
      deleted = false,
    ) =>
      dataSource.query(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count, deleted_at)
         VALUES ($1, $2, $3, $4, 'Bài kiểm hiển thị', 'Mô tả đủ dài cho bài kiểm hiển thị',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', $5, 1, 0, '{}'::jsonb, 0,
                 CASE WHEN $6::boolean THEN now() ELSE NULL END)`,
        [id, postType, AuthorId, CategoryId, status, deleted],
      );
    // Lượt trao ở đúng trạng thái kết thúc của nó, đủ các mốc mà ràng buộc đòi.
    // `$5` là bản TEXT của trạng thái: dùng lại `$4` (đi vào cột enum) trong các phép
    // so sánh chuỗi là 42P08 — Postgres suy ra hai kiểu cho cùng một tham số.
    const addDeal = async (
      postId: string,
      giverId: string,
      receiverId: string,
      status: 'DELIVERING' | 'COMPLETED' | 'CANCELLED',
    ) =>
      dataSource.query(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, quantity, status,
            accepted_at, handed_over_at, completed_at, closed_at, close_reason, closed_by)
         VALUES (gen_random_uuid(), $1, $2, $3, 1, $4, now(),
                 CASE WHEN $5::text IN ('DELIVERING', 'COMPLETED') THEN now() END,
                 CASE WHEN $5::text = 'COMPLETED' THEN now() END,
                 CASE WHEN $5::text = 'CANCELLED' THEN now() END,
                 CASE WHEN $5::text = 'CANCELLED' THEN 'Kiểm hiển thị' END,
                 CASE WHEN $5::text = 'CANCELLED' THEN $2::uuid END)`,
        [postId, giverId, receiverId, status, status],
      );

    // Muốn Tặng: tác giả là người TẶNG.
    await addPost(OfferPost, 'OFFER', 'COMPLETED');
    await addDeal(OfferPost, AuthorId, CounterpartId, 'COMPLETED');
    await addDeal(OfferPost, AuthorId, CancelledId, 'CANCELLED');
    // Muốn Nhận: tác giả là người NHẬN, người phản hồi là người tặng.
    await addPost(WantedPost, 'WANTED', 'COMPLETED');
    await addDeal(WantedPost, CounterpartId, AuthorId, 'COMPLETED');
    // Bài đã hết hàng nhưng lượt trao đang giao dở.
    await addPost(DeliveringPost, 'OFFER', 'COMPLETED');
    await addDeal(DeliveringPost, AuthorId, CounterpartId, 'DELIVERING');
    // Bài đã xoá mềm.
    await addPost(DeletedPost, 'OFFER', 'COMPLETED', true);
    await addDeal(DeletedPost, AuthorId, CounterpartId, 'COMPLETED');
    await addPost(PublishedPost, 'OFFER', 'PUBLISHED');

    const posts = new PostRepository(PostEntity as never, dataSource.manager);
    const sees = async (postId: string, viewer?: string) =>
      (await posts.findPublicByGlobalId(postId, viewer)) !== null;

    console.log('1. Người trong lượt trao xem lại được bài đã COMPLETED');
    check(
      'Muốn Tặng: NGƯỜI NHẬN xem lại được',
      await sees(OfferPost, CounterpartId),
    );
    check(
      'Muốn Nhận: NGƯỜI TẶNG (người phản hồi) xem lại được',
      await sees(WantedPost, CounterpartId),
    );
    check(
      'lượt trao đang giao dở (DELIVERING) cũng xem được',
      await sees(DeliveringPost, CounterpartId),
    );
    check(
      'tác giả vẫn xem được bài của mình',
      (await sees(OfferPost, AuthorId)) && (await sees(WantedPost, AuthorId)),
    );

    console.log('\n2. Người ngoài vẫn không xem được');
    check(
      'người ngoài nhận 404 với bài COMPLETED',
      !(await sees(OfferPost, OutsiderId)) &&
        !(await sees(WantedPost, OutsiderId)),
    );
    check(
      'khách chưa đăng nhập nhận 404 với bài COMPLETED',
      !(await sees(OfferPost)),
    );
    check(
      'người chỉ có lượt trao ĐÃ HUỶ thì không còn quyền xem',
      !(await sees(OfferPost, CancelledId)),
    );
    check(
      'bài đã xoá mềm: kể cả người trong cuộc cũng 404',
      !(await sees(DeletedPost, CounterpartId)),
    );

    console.log('\n3. Bài công khai không đổi');
    check(
      'bài PUBLISHED: ai cũng xem được',
      (await sees(PublishedPost)) && (await sees(PublishedPost, OutsiderId)),
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
        ? 'Hiển thị bài: hai bên của lượt trao xem lại được bài đã xong ở cả Muốn Tặng lẫn Muốn Nhận, người ngoài và lượt đã huỷ vẫn 404'
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
