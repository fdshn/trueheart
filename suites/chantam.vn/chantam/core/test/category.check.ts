/**
 * Kiểm cây danh mục trên Postgres THẬT (22 §22.1–§22.2).
 *
 * Bảy thứ unit test mock `query` không thể thấy, vì tất cả đều nằm TRONG câu SQL:
 *
 * 1. `findSubtreeIds` lấy hết nhánh ba tầng, và DỪNG khi dữ liệu đã có vòng.
 * 2. Lọc bài theo một danh mục CHA trả về cả bài nằm ở nút lá — trước 30/09 ra 0.
 * 3. `countPostsInSubtree` đếm cả nhánh con, nên tắt cha là bị chặn.
 * 4. `measureDepthAfterMove` đo cả hai chiều: tổ tiên của cha mới VÀ chiều sâu của
 *    chính nhánh đang chuyển.
 * 5. `mergeInto` chuyển bài, chuyển con và tắt nguồn trong MỘT transaction.
 * 6. `CHK_categories_merged_is_inactive` chặn một danh mục "đã gộp" mà vẫn bật.
 * 7. `findAncestorChain` nhìn thấy tổ tiên đã tắt — thứ `create-post` dựa vào để
 *    không cho gán bài vào một danh mục vô hình.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CategoryRepository } from '../src/infrastructure/repository/category.repository';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_category_check';

/** Cây: Gốc → Điện tử → Điện thoại → Điện thoại cũ. Bốn tầng, đủ chạm trần. */
const Root = 'c0000000-0000-4000-8000-00000000c001';
const Electronics = 'c0000000-0000-4000-8000-00000000c002';
const Phones = 'c0000000-0000-4000-8000-00000000c003';
const UsedPhones = 'c0000000-0000-4000-8000-00000000c004';
/** Hai danh mục trùng nghĩa, dựng riêng để thử gộp. */
const DupA = 'c0000000-0000-4000-8000-00000000c005';
const DupB = 'c0000000-0000-4000-8000-00000000c006';
const DupChild = 'c0000000-0000-4000-8000-00000000c007';

const AuthorId = 'a0000000-0000-4000-8000-00000000a001';

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

  const categories = new CategoryRepository(
    entities.CategoryEntity as never,
    dataSource.manager,
  );
  const posts = new PostRepository(
    entities.PostEntity as never,
    dataSource.manager,
  );

  let postSeq = 0;
  const addPost = async (categoryId: string, postType = 'OFFER') => {
    postSeq += 1;
    const id = `b0000000-0000-4000-8000-00000000b0${String(postSeq).padStart(
      2,
      '0',
    )}`;
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, $2, $3, $4, 'Bài kiểm danh mục',
               'Mô tả đủ dài cho bài kiểm cây danh mục',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [id, postType, AuthorId, categoryId],
    );
    return id;
  };

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'chu-bai-danh-muc', 'x', 'MEMBER', 'ACTIVE')`,
      [AuthorId],
    );

    for (const [id, name, parent] of [
      [Root, 'Gốc', null],
      [Electronics, 'Đồ điện tử', Root],
      [Phones, 'Điện thoại', Electronics],
      [UsedPhones, 'Điện thoại cũ', Phones],
      [DupA, 'Đồ gia dụng', null],
      [DupB, 'Gia dụng', null],
      [DupChild, 'Nồi niêu', DupA],
    ] as const)
      await dataSource.query(
        `INSERT INTO categories (global_id, name, slug, parent_id, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [id, name, id.slice(-8), parent],
      );

    console.log('1. findSubtreeIds lấy hết nhánh, và dừng khi có vòng');
    const subtree = await categories.findSubtreeIds(Electronics);
    check(
      'nhánh ba tầng ra đủ ba id',
      subtree.length === 3 &&
        [Electronics, Phones, UsedPhones].every((id) => subtree.includes(id)),
      `${subtree.length} id`,
    );
    check(
      'nút lá chỉ ra chính nó',
      (await categories.findSubtreeIds(UsedPhones)).length === 1,
    );

    // Vòng CỐ Ý, dựng thẳng bằng SQL để mô phỏng dữ liệu cũ có trước khi
    // `UpdateCategoryUseCase` biết chặn. Nếu `UNION ALL` bị dùng nhầm thay cho
    // `UNION`, phép kiểm này treo thay vì trả lời — treo cũng là một câu trả lời.
    await dataSource.query(
      `UPDATE categories SET parent_id = $2 WHERE global_id = $1`,
      [Electronics, UsedPhones],
    );
    const looped = await categories.findSubtreeIds(Electronics);
    check(
      'có vòng thì vẫn trả về và KHÔNG chạy mãi',
      looped.length === 3,
      `${looped.length} id`,
    );
    await dataSource.query(
      `UPDATE categories SET parent_id = $2 WHERE global_id = $1`,
      [Electronics, Root],
    );

    console.log('\n2. Lọc bài theo danh mục CHA lấy được bài ở nút lá');
    await addPost(UsedPhones);
    await addPost(Phones);
    const byParent = await posts.findAdminPosts({
      categoryId: Electronics,
      limit: 20,
      offset: 0,
    } as never);
    check(
      'lọc theo cha ra cả hai bài ở nhánh dưới',
      byParent.total === 2,
      `total=${byParent.total}`,
    );
    const byLeaf = await posts.findAdminPosts({
      categoryId: UsedPhones,
      limit: 20,
      offset: 0,
    } as never);
    check(
      'lọc theo nút lá vẫn chỉ ra bài của nó',
      byLeaf.total === 1,
      `total=${byLeaf.total}`,
    );

    console.log('\n3. countPostsInSubtree đếm cả nhánh con');
    check(
      'cha đếm được bài của con',
      (await categories.countPostsInSubtree(Electronics)) === 2,
      `${await categories.countPostsInSubtree(Electronics)}`,
    );
    check(
      'nút lá đếm đúng của nó',
      (await categories.countPostsInSubtree(UsedPhones)) === 1,
    );
    check(
      'danh mục chưa ai dùng đếm ra 0 — tắt được',
      (await categories.countPostsInSubtree(DupB)) === 0,
    );

    console.log('\n4. measureDepthAfterMove đo cả hai chiều');
    check(
      'treo dưới gốc là tầng 2',
      (await categories.measureDepthAfterMove(null, Root)) === 2,
      `${await categories.measureDepthAfterMove(null, Root)}`,
    );
    check(
      'danh mục gốc mới là tầng 1',
      (await categories.measureDepthAfterMove(null, null)) === 1,
    );
    // DupA có một con, tức nhánh hai tầng. Treo nó dưới `Phones` (đang ở tầng 3)
    // ra 3 + 2 = 5 — quá trần 4. Đây là ca mà phép đo chỉ nhìn cha mới bỏ sót.
    check(
      'chuyển cả một NHÁNH thì tính cả chiều sâu của nhánh đó',
      (await categories.measureDepthAfterMove(DupA, Phones)) === 5,
      `${await categories.measureDepthAfterMove(DupA, Phones)}`,
    );

    console.log('\n5. findAncestorChain nhìn thấy tổ tiên đã tắt');
    await dataSource.query(
      `UPDATE categories SET is_active = false WHERE global_id = $1`,
      [Electronics],
    );
    const chain = await categories.findAncestorChain(UsedPhones);
    check(
      'chuỗi đi từ chính nó lên gốc',
      chain[0]?.categoryId === UsedPhones &&
        chain[chain.length - 1]?.categoryId === Root,
      chain.map((row) => row.categoryId.slice(-4)).join(' → '),
    );
    check(
      'thấy được tổ tiên đang tắt dù chính nó đang bật',
      chain.some((row) => row.categoryId === Electronics && !row.isActive),
    );
    await dataSource.query(
      `UPDATE categories SET is_active = true WHERE global_id = $1`,
      [Electronics],
    );

    console.log('\n6. mergeInto chuyển bài, chuyển con, rồi tắt nguồn');
    const dupPost = await addPost(DupA);
    const merged = await categories.mergeInto({
      sourceId: DupA,
      targetId: DupB,
      reason: 'Trùng nghĩa với Gia dụng',
    });
    check(
      'báo đúng số bài đã chuyển',
      merged.movedPosts === 1,
      `${merged.movedPosts}`,
    );
    check(
      'báo đúng số con đã chuyển',
      merged.movedChildren === 1,
      `${merged.movedChildren}`,
    );
    const [movedPost] = await dataSource.query<{ category_id: string }[]>(
      `SELECT category_id FROM posts WHERE global_id = $1`,
      [dupPost],
    );
    check('bài đã sang danh mục đích', movedPost?.category_id === DupB);
    const [movedChild] = await dataSource.query<{ parent_id: string }[]>(
      `SELECT parent_id FROM categories WHERE global_id = $1`,
      [DupChild],
    );
    check('con đã sang danh mục đích', movedChild?.parent_id === DupB);
    const [source] = await dataSource.query<
      { is_active: boolean; merged_into_id: string; merge_reason: string }[]
    >(
      `SELECT is_active, merged_into_id, merge_reason FROM categories
       WHERE global_id = $1`,
      [DupA],
    );
    check('nguồn đã tắt', source?.is_active === false);
    check('nguồn ghi lại đã đi đâu', source?.merged_into_id === DupB);
    check(
      'và ghi lại VÌ SAO — ba tháng sau không ai nhớ',
      source?.merge_reason === 'Trùng nghĩa với Gia dụng',
    );
    check(
      'nguồn KHÔNG bị xoá, tên vẫn đọc được cho lịch sử',
      (
        await dataSource.query<{ name: string }[]>(
          `SELECT name FROM categories WHERE global_id = $1`,
          [DupA],
        )
      )[0]?.name === 'Đồ gia dụng',
    );

    console.log('\n7. Ràng buộc chặn trạng thái vô nghĩa');
    let reopened = 'không ném';
    try {
      await dataSource.query(
        `UPDATE categories SET is_active = true WHERE global_id = $1`,
        [DupA],
      );
    } catch (error) {
      reopened = (error as Error).message;
    }
    check(
      'không bật lại được một danh mục đã gộp',
      reopened.includes('CHK_categories_merged_is_inactive'),
      reopened.slice(0, 60),
    );
    let selfMerge = 'không ném';
    try {
      await dataSource.query(
        `UPDATE categories SET merged_into_id = global_id, is_active = false
         WHERE global_id = $1`,
        [DupB],
      );
    } catch (error) {
      selfMerge = (error as Error).message;
    }
    check(
      'không tự gộp vào chính mình',
      selfMerge.includes('CHK_categories_merge_not_self'),
      selfMerge.slice(0, 60),
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Cây danh mục: lọc lấy cả nhánh, đo được độ sâu, gộp nguyên vẹn, và vòng cũ không làm treo'
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
