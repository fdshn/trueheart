/**
 * Kiểm nền tảng tương tác bảng tin trên Postgres THẬT.
 *
 * Migration này đặt nhiều ràng buộc tinh vi, và ràng buộc chỉ có giá trị khi
 * chứng minh được nó CHẶN. Bốn thứ chỉ database thật trả lời được:
 *
 *   1. **Bình luận chỉ hai cấp, do khoá ngoại ghép giữ.** Không phải trigger,
 *      không phải tầng ứng dụng — một trả lời chỉ trỏ được vào bình luận gốc.
 *   2. **Một người MỘT cảm xúc** trên một chủ thể.
 *   3. **Một người báo xấu một chủ thể đúng một lần.**
 *   4. **Chính sách quyền bản 2 không thu hồi quyền cũ** — migration chép bộ
 *      quyền cũ sang, và quên chép là vô tình cấm cả nền tảng đăng bài.
 *
 *   npm run test:feed-foundation
 */
import {
  CommentContentCapability,
  ReactContentCapability,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_feed_foundation_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const AuthorId = '99999999-9999-4999-8999-9999999a1001';
const ReaderId = '99999999-9999-4999-8999-9999999a1002';
const PostId = '88888888-8888-4888-8888-8888888a1001';

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

  /** Chạy một câu lệnh và cho biết database có TỪ CHỐI hay không. */
  async function rejected(sql: string, params: unknown[] = []): Promise<boolean> {
    try {
      await dataSource.query(sql, params);
      return false;
    } catch {
      return true;
    }
  }

  async function insertComment(
    globalId: string,
    depth: number,
    parentId: string | null,
    body = 'Món này còn không ạ?',
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO content_comments
         (global_id, subject_type, subject_id, author_id, body,
          depth, parent_id, parent_depth)
       VALUES ($1, 'POST', $2, $3, $4, $5, $6, $7)`,
      [
        globalId,
        PostId,
        ReaderId,
        body,
        depth,
        parentId,
        parentId ? 1 : null,
      ],
    );
  }

  try {
    for (const [id, username] of [
      [AuthorId, 'tacgia_feed'],
      [ReaderId, 'nguoidoc_feed'],
    ] as [string, string][])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm tương tác',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, AuthorId, CategoryId],
    );

    // ── 1. Số đếm khởi tạo ──────────────────────────────────────────────────
    console.log('Số đếm trên bài đăng:\n');

    const [counters] = await dataSource.query<
      { reaction_count: number; comment_count: number; share_count: number }[]
    >(
      `SELECT reaction_count, comment_count, share_count
       FROM posts WHERE global_id = $1`,
      [PostId],
    );
    check(
      'bài mới có đủ ba cột đếm, khởi tạo 0',
      Number(counters.reaction_count) === 0 &&
        Number(counters.comment_count) === 0 &&
        Number(counters.share_count) === 0,
      JSON.stringify(counters),
    );
    check(
      'số đếm không xuống âm được',
      await rejected(
        `UPDATE posts SET reaction_count = -1 WHERE global_id = $1`,
        [PostId],
      ),
    );

    // ── 2. Bình luận hai cấp ────────────────────────────────────────────────
    console.log('\nBình luận hai cấp:\n');

    const rootId = randomUUID();
    const replyId = randomUUID();
    await insertComment(rootId, 1, null);
    check('bình luận gốc ghi được', true);

    await insertComment(replyId, 2, rootId);
    check('trả lời cho bình luận gốc ghi được', true);

    check(
      'KHÔNG trả lời được một trả lời — hai cấp do khoá ngoại ghép giữ',
      await rejected(
        `INSERT INTO content_comments
           (global_id, subject_type, subject_id, author_id, body,
            depth, parent_id, parent_depth)
         VALUES ($1, 'POST', $2, $3, 'cấp ba', 2, $4, 1)`,
        [randomUUID(), PostId, ReaderId, replyId],
      ),
    );
    check(
      'KHÔNG khai depth 3',
      await rejected(
        `INSERT INTO content_comments
           (global_id, subject_type, subject_id, author_id, body,
            depth, parent_id, parent_depth)
         VALUES ($1, 'POST', $2, $3, 'cấp ba', 3, $4, 1)`,
        [randomUUID(), PostId, ReaderId, rootId],
      ),
    );
    check(
      'bình luận gốc KHÔNG được có cha',
      await rejected(
        `INSERT INTO content_comments
           (global_id, subject_type, subject_id, author_id, body,
            depth, parent_id, parent_depth)
         VALUES ($1, 'POST', $2, $3, 'gốc mà có cha', 1, $4, 1)`,
        [randomUUID(), PostId, ReaderId, rootId],
      ),
    );
    check(
      'trả lời KHÔNG được thiếu cha',
      await rejected(
        `INSERT INTO content_comments
           (global_id, subject_type, subject_id, author_id, body,
            depth, parent_id, parent_depth)
         VALUES ($1, 'POST', $2, $3, 'trả lời mồ côi', 2, NULL, NULL)`,
        [randomUUID(), PostId, ReaderId],
      ),
    );
    check(
      'bình luận rỗng bị chặn khi cũng không có ảnh',
      await rejected(
        `INSERT INTO content_comments
           (global_id, subject_type, subject_id, author_id, body, depth)
         VALUES ($1, 'POST', $2, $3, '   ', 1)`,
        [randomUUID(), PostId, ReaderId],
      ),
    );

    // ── 3. Ảnh bình luận: trần ba tấm ───────────────────────────────────────
    console.log('\nẢnh bình luận:\n');

    for (let slot = 1; slot <= 3; slot += 1)
      await dataSource.query(
        `INSERT INTO content_comment_media (comment_id, slot, storage_key)
         VALUES ($1, $2, $3)`,
        [rootId, slot, `users/x/comment-media/POST/${PostId}/${slot}.webp`],
      );
    check('ba ảnh ghi được', true);
    check(
      'DATABASE chặn tấm thứ tư',
      await rejected(
        `INSERT INTO content_comment_media (comment_id, slot, storage_key)
         VALUES ($1, 4, 'qua-tran.webp')`,
        [rootId],
      ),
    );
    check(
      'không hai ảnh cùng một slot',
      await rejected(
        `INSERT INTO content_comment_media (comment_id, slot, storage_key)
         VALUES ($1, 1, 'trung-slot.webp')`,
        [rootId],
      ),
    );

    // ── 4. Một người một cảm xúc ────────────────────────────────────────────
    console.log('\nCảm xúc:\n');

    await dataSource.query(
      `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
       VALUES ('POST', $1, $2, 'LOVE')`,
      [PostId, ReaderId],
    );
    check(
      'một người KHÔNG thả được hai cảm xúc trên cùng một bài',
      await rejected(
        `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
         VALUES ('POST', $1, $2, 'LIKE')`,
        [PostId, ReaderId],
      ),
    );
    check(
      'nhưng thả được trên một BÌNH LUẬN — khác chủ thể',
      !(await rejected(
        `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
         VALUES ('COMMENT', $1, $2, 'LIKE')`,
        [rootId, ReaderId],
      )),
    );
    check(
      'không có cảm xúc ANGRY',
      await rejected(
        `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
         VALUES ('POST', $1, $2, 'ANGRY')`,
        [PostId, AuthorId],
      ),
    );

    // ── 5. Báo xấu ──────────────────────────────────────────────────────────
    console.log('\nBáo xấu:\n');

    await dataSource.query(
      `INSERT INTO content_reports
         (global_id, subject_type, subject_id, reporter_id, reason)
       VALUES ($1, 'COMMENT', $2, $3, 'Nội dung xúc phạm')`,
      [randomUUID(), rootId, AuthorId],
    );
    check(
      'một người báo một chủ thể ĐÚNG một lần',
      await rejected(
        `INSERT INTO content_reports
           (global_id, subject_type, subject_id, reporter_id, reason)
         VALUES ($1, 'COMMENT', $2, $3, 'Báo lại lần hai')`,
        [randomUUID(), rootId, AuthorId],
      ),
    );
    check(
      'đã xử thì phải có mốc xử — không để trạng thái nói một đằng dữ liệu một nẻo',
      await rejected(
        `UPDATE content_reports SET status = 'UPHELD' WHERE subject_id = $1`,
        [rootId],
      ),
    );

    // ── 6. Chính sách quyền bản 2 ───────────────────────────────────────────
    console.log('\nChính sách quyền:\n');

    const activeCodes = await dataSource.query<{ code: string }[]>(
      `SELECT policy.code
       FROM capability_policies policy
       JOIN config_revisions revision ON revision.id = policy.revision_id
       JOIN config_bundles bundle ON bundle.id = revision.bundle_id
       WHERE bundle.code = 'M6_BASE_POLICY' AND bundle.version = 2
       ORDER BY policy.code`,
    );
    const codes = activeCodes.map((row) => row.code);

    check(
      'bản 2 có hai quyền mới',
      codes.includes(ReactContentCapability) &&
        codes.includes(CommentContentCapability),
      codes.join(', '),
    );
    check(
      'và GIỮ NGUYÊN các quyền cũ — quên chép là vô tình cấm cả nền tảng đăng bài',
      ['POST_OFFER', 'POST_WANTED', 'POST_SOS', 'CREATE_GROUP'].every((code) =>
        codes.includes(code),
      ),
      codes.join(', '),
    );

    const [viewer] = await dataSource.query<{ allowed: boolean }[]>(
      `SELECT value.allowed
       FROM capability_rank_values value
       JOIN capability_policies policy ON policy.id = value.policy_id
       JOIN config_revisions revision ON revision.id = policy.revision_id
       JOIN config_bundles bundle ON bundle.id = revision.bundle_id
       WHERE bundle.code = 'M6_BASE_POLICY' AND bundle.version = 2
         AND policy.code = $1 AND value.rank = 'VIEWER'`,
      [CommentContentCapability],
    );
    check('VIEWER chỉ đọc, không bình luận', viewer.allowed === false);

    const [member] = await dataSource.query<
      { allowed: boolean; limit_value: number | null }[]
    >(
      `SELECT value.allowed, value.limit_value
       FROM capability_rank_values value
       JOIN capability_policies policy ON policy.id = value.policy_id
       JOIN config_revisions revision ON revision.id = policy.revision_id
       JOIN config_bundles bundle ON bundle.id = revision.bundle_id
       WHERE bundle.code = 'M6_BASE_POLICY' AND bundle.version = 2
         AND policy.code = $1 AND value.rank = 'MEMBER'`,
      [CommentContentCapability],
    );
    check(
      'MEMBER bình luận được, không giới hạn số lượng',
      member.allowed === true && member.limit_value === null,
      JSON.stringify(member),
    );

    const [oldBundle] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM config_bundles
       WHERE code = 'M6_BASE_POLICY' AND version = 1`,
    );
    check(
      'bản cũ chuyển ARCHIVED, không sửa đè — config là copy-on-write',
      oldBundle.status === 'ARCHIVED',
      oldBundle.status,
    );

    // ── 7. Rule điểm F41 ────────────────────────────────────────────────────
    console.log('\nRule điểm F41:\n');

    const rules = await dataSource.query<
      { code: string; is_enabled: boolean; affects_lifetime: boolean }[]
    >(
      `SELECT code, is_enabled, affects_lifetime FROM point_rules
       WHERE code IN ('POST_COMMENTED', 'POST_REACTED') ORDER BY code`,
    );
    check('hai rule đã seed', rules.length === 2, String(rules.length));
    check(
      'TẮT sẵn — F41 chốt chỉ phát điểm khi Admin bật',
      rules.every((rule) => rule.is_enabled === false),
    );
    check(
      'KHÔNG đẩy lifetime — bình luận không được mua hạng',
      rules.every((rule) => rule.affects_lifetime === false),
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
  console.log('\nNền tảng tương tác bảng tin: mọi ràng buộc đều chặn đúng.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
