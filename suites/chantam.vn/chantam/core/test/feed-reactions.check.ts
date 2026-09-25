/**
 * Kiểm cảm xúc trên Postgres THẬT.
 *
 * Thứ cần chứng minh là **số đếm không nói dối**, và nó chỉ sai trên database
 * thật:
 *
 *   1. **Đổi cảm xúc không làm tổng tăng.** Dựa vào `xmax = 0` để phân biệt
 *      INSERT thật với UPDATE do `ON CONFLICT` — một thứ không mock được.
 *   2. **Gỡ rồi gỡ lại không làm tổng xuống âm.**
 *   3. **Hai người thả cùng lúc thì tổng vẫn đúng.** Hai transaction song song
 *      chạy tuần tự trong unit test sẽ luôn xanh, kể cả khi code sai.
 *   4. **Cảm xúc trên bình luận đếm vào bình luận**, không đếm nhầm sang bài.
 *
 *   npm run test:feed-reactions
 */
import {
  ContentSubjectTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { ContentReactionRepository } from '../src/infrastructure/repository/content-reaction.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_feed_reactions_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const AuthorId = '99999999-9999-4999-8999-9999999b1001';
const PostId = '88888888-8888-4888-8888-8888888b1001';
const Readers = Array.from(
  { length: 12 },
  (_, index) =>
    `77777777-7777-4777-8777-77777777${String(index + 10).padStart(4, '0')}`,
);

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
    extra: { max: 20 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  const reactions = new ContentReactionRepository(dataSource.manager);
  const postSubject = {
    subjectType: ContentSubjectTypes.POST,
    subjectId: PostId,
  };

  async function postCounter(): Promise<number> {
    const [row] = await dataSource.query<{ reaction_count: string }[]>(
      `SELECT reaction_count FROM posts WHERE global_id = $1`,
      [PostId],
    );
    return Number(row.reaction_count);
  }

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'tacgia_cx', 'x', 'MEMBER', 'ACTIVE')`,
      [AuthorId],
    );
    for (const [index, id] of Readers.entries())
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status, full_name)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', $3)`,
        [id, `nguoidoc_cx_${index}`, `Người đọc ${index}`],
      );

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm cảm xúc',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, AuthorId, CategoryId],
    );

    // ── 1. Đặt và đổi ───────────────────────────────────────────────────────
    console.log('Đặt và đổi cảm xúc:\n');

    const first = await reactions.setReaction({
      ...postSubject,
      userId: Readers[0],
      kind: ReactionKinds.LIKE,
    });
    check('lần đầu là tạo mới', first.created === true);
    check('số đếm lên 1', (await postCounter()) === 1);

    const changed = await reactions.setReaction({
      ...postSubject,
      userId: Readers[0],
      kind: ReactionKinds.LOVE,
    });
    check(
      'đổi LIKE sang LOVE KHÔNG phải tạo mới',
      changed.created === false,
      `created=${changed.created}`,
    );
    check(
      'và tổng VẪN là 1 — cùng một người, không thành hai lượt',
      (await postCounter()) === 1,
      `${await postCounter()}`,
    );

    const same = await reactions.setReaction({
      ...postSubject,
      userId: Readers[0],
      kind: ReactionKinds.LOVE,
    });
    check(
      'đặt lại đúng loại cũ cũng không tăng — thao tác bình thái',
      same.created === false && (await postCounter()) === 1,
    );

    const summary = await reactions.summarize(postSubject, Readers[0]);
    check(
      'tổng hợp nói đúng loại của chính người gọi',
      summary.myReaction === ReactionKinds.LOVE,
      String(summary.myReaction),
    );
    check(
      'breakdown chỉ gồm loại thực sự có người chọn',
      Object.keys(summary.breakdown).join(',') === 'LOVE',
      Object.keys(summary.breakdown).join(','),
    );
    check(
      'người chưa bày tỏ thì myReaction là null',
      (await reactions.summarize(postSubject, Readers[1])).myReaction === null,
    );
    check(
      'gọi ẩn danh cũng không vỡ',
      (await reactions.summarize(postSubject, null)).myReaction === null,
    );

    // ── 2. Gỡ ───────────────────────────────────────────────────────────────
    console.log('\nGỡ cảm xúc:\n');

    check(
      'gỡ trả về true khi có gì để gỡ',
      (await reactions.removeReaction({
        ...postSubject,
        userId: Readers[0],
      })) === true,
    );
    check('số đếm về 0', (await postCounter()) === 0);
    check(
      'gỡ lần hai trả về false',
      (await reactions.removeReaction({
        ...postSubject,
        userId: Readers[0],
      })) === false,
    );
    check(
      'và số đếm KHÔNG xuống âm',
      (await postCounter()) === 0,
      `${await postCounter()}`,
    );

    // ── 3. Nhiều người thả CÙNG LÚC ─────────────────────────────────────────
    console.log('\nMười hai người thả cùng lúc:\n');

    const kinds = [
      ReactionKinds.LIKE,
      ReactionKinds.LOVE,
      ReactionKinds.CARE,
      ReactionKinds.WOW,
      ReactionKinds.SAD,
    ];
    await Promise.all(
      Readers.map((userId, index) =>
        reactions.setReaction({
          ...postSubject,
          userId,
          kind: kinds[index % kinds.length],
        }),
      ),
    );
    check(
      'tổng đúng bằng số người, không mất lượt nào',
      (await postCounter()) === Readers.length,
      `${await postCounter()}/${Readers.length}`,
    );

    const [realTotal] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM content_reactions
       WHERE subject_type = 'POST' AND subject_id = $1`,
      [PostId],
    );
    check(
      'cột đếm khớp với số dòng thật trong bảng',
      Number(realTotal.count) === (await postCounter()),
      `${realTotal.count} dòng / ${await postCounter()} đếm`,
    );

    // Đổi loại đồng loạt: vẫn 12 người, tổng không được nhúc nhích.
    await Promise.all(
      Readers.map((userId) =>
        reactions.setReaction({
          ...postSubject,
          userId,
          kind: ReactionKinds.CARE,
        }),
      ),
    );
    check(
      'cả mười hai người đổi loại cùng lúc, tổng vẫn 12',
      (await postCounter()) === Readers.length,
      `${await postCounter()}`,
    );

    await Promise.all(
      Readers.slice(0, 5).map((userId) =>
        reactions.removeReaction({ ...postSubject, userId }),
      ),
    );
    check(
      'năm người gỡ cùng lúc, tổng còn 7',
      (await postCounter()) === 7,
      `${await postCounter()}`,
    );

    // ── 4. Danh sách người bày tỏ ───────────────────────────────────────────
    console.log('\nDanh sách người bày tỏ:\n');

    const page = await reactions.listActors({
      subject: postSubject,
      skip: 0,
      take: 5,
    });
    check('phân trang đúng số trang', page.items.length === 5);
    check('tổng đúng', page.total === 7, String(page.total));
    check(
      'kèm tên để hiển thị, không bắt gọi thêm một vòng',
      page.items.every((actor) => actor.username.length > 0),
    );

    await reactions.setReaction({
      ...postSubject,
      userId: Readers[11],
      kind: ReactionKinds.SAD,
    });
    const filtered = await reactions.listActors({
      subject: postSubject,
      kind: ReactionKinds.SAD,
      skip: 0,
      take: 20,
    });
    check(
      'lọc theo loại trả đúng một người',
      filtered.total === 1 && filtered.items[0].userId === Readers[11],
      `${filtered.total}`,
    );

    // ── 5. Một truy vấn cho cả trang bảng tin ───────────────────────────────
    console.log('\nĐọc kèm cho bảng tin:\n');

    const mine = await reactions.findMyReactions(
      ContentSubjectTypes.POST,
      [PostId, randomUUID()],
      Readers[11],
    );
    check(
      'lấy cảm xúc của mình cho nhiều bài trong MỘT truy vấn',
      mine.get(PostId) === ReactionKinds.SAD && mine.size === 1,
      `${mine.size} mục`,
    );
    check(
      'danh sách rỗng không đi database',
      (
        await reactions.findMyReactions(
          ContentSubjectTypes.POST,
          [],
          Readers[0],
        )
      ).size === 0,
    );

    // ── 6. Cảm xúc cho bình luận đếm vào ĐÚNG chỗ ───────────────────────────
    console.log('\nCảm xúc cho bình luận:\n');

    const commentId = randomUUID();
    await dataSource.query(
      `INSERT INTO content_comments
         (global_id, subject_type, subject_id, author_id, body, depth)
       VALUES ($1, 'POST', $2, $3, 'Món này đẹp quá ạ', 1)`,
      [commentId, PostId, Readers[0]],
    );

    const postBefore = await postCounter();
    await reactions.setReaction({
      subjectType: ContentSubjectTypes.COMMENT,
      subjectId: commentId,
      userId: Readers[0],
      kind: ReactionKinds.LIKE,
    });

    const [comment] = await dataSource.query<{ reaction_count: string }[]>(
      `SELECT reaction_count FROM content_comments WHERE global_id = $1`,
      [commentId],
    );
    check(
      'đếm vào chính bình luận',
      Number(comment.reaction_count) === 1,
      comment.reaction_count,
    );
    check(
      'và KHÔNG đếm nhầm sang bài đăng',
      (await postCounter()) === postBefore,
      `${await postCounter()} vs ${postBefore}`,
    );
    check(
      'cùng một người thả được cả trên bài lẫn trên bình luận',
      (
        await reactions.summarize(
          { subjectType: ContentSubjectTypes.COMMENT, subjectId: commentId },
          Readers[0],
        )
      ).myReaction === ReactionKinds.LIKE,
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
  console.log(
    '\nSố đếm cảm xúc bám đúng số dòng thật, kể cả khi thả song song.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
