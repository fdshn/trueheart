/**
 * Bảng xếp hạng tương tác diễn đàn trên Postgres THẬT (PR #46 §11).
 *
 * Từng luật của câu SQL đều có một dữ kiện để làm nó đỏ nếu sai:
 *
 * - tương tác của chính tác giả không tính;
 * - bình luận bị ẩn không tính, trả lời (depth 2) có tính;
 * - chủ đề bị ẩn không tính;
 * - tương tác ngoài tháng (cả tháng trước lẫn ĐÚNG mốc nửa đêm đầu tháng sau giờ Việt Nam)
 *   không tính;
 * - tác giả bị khoá ra khỏi bảng, và thứ hạng không có lỗ ở chỗ họ;
 * - hoà điểm thì ai đạt tương tác cuối sớm hơn đứng trước;
 * - người ẩn danh không lộ tên lẫn chủ đề; response không có `userId`.
 *
 *   npm run test:dharma-leaderboard
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  GetForumEngagementLeaderboardUseCase,
  GetRecitationTimeLeaderboardUseCase,
} from '../src/application/implementations/dharma/dharma-leaderboard.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { DharmaLeaderboardRepository } from '../src/infrastructure/repository/dharma-leaderboard.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_dharma_leaderboard_check';

const id = (n: number) =>
  `7e100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [AuthorA, AuthorB, Fan1, Fan2, Fan3, Banned, Anon] = [
  1, 2, 3, 4, 5, 6, 7,
].map(id);
const thread = (n: number) =>
  `7e200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ThreadA1, ThreadA2, ThreadAHidden, ThreadB1, ThreadBanned, ThreadAnon] =
  [1, 2, 3, 4, 5, 6].map(thread);

/** Tháng 10/2026 giờ Việt Nam. */
const October = (day: number) =>
  `2026-10-${String(day).padStart(2, '0')}T05:00:00Z`;
/** 00:00 ngày 01/11 giờ Việt Nam — đã sang tháng sau. */
const NovemberStartVn = '2026-10-31T17:00:00Z';
const September = '2026-09-20T05:00:00Z';

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
    for (const [userId, username, status, anonymous] of [
      [AuthorA, 'dl_tac_gia_a', 'ACTIVE', false],
      [AuthorB, 'dl_tac_gia_b', 'ACTIVE', false],
      [Fan1, 'dl_fan_1', 'ACTIVE', false],
      [Fan2, 'dl_fan_2', 'ACTIVE', false],
      [Fan3, 'dl_fan_3', 'ACTIVE', false],
      [Banned, 'dl_bi_khoa', 'BANNED', false],
      [Anon, 'dl_an_danh', 'ACTIVE', true],
    ] as const)
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status, leaderboard_anonymous)
         VALUES ($1, $2, 'x', 'MEMBER', $3, $4)`,
        [userId, username, status, anonymous],
      );
    for (const [threadId, authorId, status, title] of [
      [ThreadA1, AuthorA, 'VISIBLE', 'Tụng kinh buổi sáng'],
      [ThreadA2, AuthorA, 'VISIBLE', 'Hỏi về lễ cầu an'],
      [ThreadAHidden, AuthorA, 'HIDDEN', 'Chủ đề đã bị ẩn'],
      [ThreadB1, AuthorB, 'VISIBLE', 'Kinh nghiệm phóng sinh'],
      [ThreadBanned, Banned, 'VISIBLE', 'Chủ đề của tài khoản bị khoá'],
      [ThreadAnon, Anon, 'VISIBLE', 'Chủ đề của người ẩn danh'],
    ])
      await sql(
        `INSERT INTO dharma_threads (global_id, author_id, title, body_text, status)
         VALUES ($1, $2, $3, 'Nội dung đủ dài cho bài kiểm bảng xếp hạng.', $4)`,
        [threadId, authorId, title, status],
      );

    const react = (threadId: string, userId: string, at: string) =>
      sql(
        `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind, created_at)
         VALUES ('DHARMA_THREAD', $1, $2, 'LIKE', $3::timestamptz)`,
        [threadId, userId, at],
      );
    const comment = async (
      threadId: string,
      userId: string,
      at: string,
      options: { status?: string; parentId?: string } = {},
    ): Promise<string> => {
      const [row] = await sql(
        `INSERT INTO content_comments
           (global_id, subject_type, subject_id, author_id, body, status, depth,
            parent_id, parent_depth, created_at)
         VALUES (gen_random_uuid(), 'DHARMA_THREAD', $1, $2, 'Xin tùy hỷ.', $3,
                 CASE WHEN $4::uuid IS NULL THEN 1 ELSE 2 END, $4::uuid,
                 CASE WHEN $4::uuid IS NULL THEN NULL ELSE 1 END, $5::timestamptz)
         RETURNING global_id`,
        [
          threadId,
          userId,
          options.status ?? 'VISIBLE',
          options.parentId ?? null,
          at,
        ],
      );
      return row.global_id;
    };

    // Tác giả A — chủ đề A1: 2 cảm xúc + 1 bình luận + 1 trả lời = 4.
    await react(ThreadA1, Fan1, October(10));
    await react(ThreadA1, Fan2, October(11));
    const top = await comment(ThreadA1, Fan3, October(12));
    await comment(ThreadA1, Fan1, October(13), { parentId: top });
    // Không tính: của chính tác giả, bị ẩn, tháng trước, đúng nửa đêm sang tháng sau.
    await comment(ThreadA1, AuthorA, October(14));
    await react(ThreadA1, AuthorA, October(14));
    await comment(ThreadA1, Fan2, October(15), { status: 'HIDDEN' });
    await comment(ThreadA1, Fan2, September);
    await react(ThreadA1, Fan3, NovemberStartVn);
    // Chủ đề A2: 1. Tương tác cuối của A rơi vào ngày 20.
    await comment(ThreadA2, Fan1, October(20));
    // Chủ đề bị ẩn: không tính gì.
    await react(ThreadAHidden, Fan1, October(10));
    await react(ThreadAHidden, Fan2, October(10));

    // Tác giả B: cũng 5, nhưng tương tác cuối ngày 05 — sớm hơn A nên đứng trước.
    for (const fan of [Fan1, Fan2, Fan3])
      await react(ThreadB1, fan, October(5));
    await comment(ThreadB1, Fan1, October(5));
    await comment(ThreadB1, Fan2, October(5));

    // Tài khoản bị khoá: nhiều tương tác nhất nhưng không được lên bảng.
    for (const fan of [Fan1, Fan2, Fan3])
      await react(ThreadBanned, fan, October(3));
    for (const fan of [Fan1, Fan2, Fan3])
      await comment(ThreadBanned, fan, October(3));

    // Người ẩn danh: 3.
    for (const fan of [Fan1, Fan2, Fan3])
      await react(ThreadAnon, fan, October(8));

    const repository = new DharmaLeaderboardRepository(dataSource.manager);
    const useCase = new GetForumEngagementLeaderboardUseCase(
      repository,
      () => new Date('2026-10-25T00:00:00Z'),
    );

    console.log('1. Xếp hạng tháng 10/2026');
    const { leaderboard } = await useCase.handle({});
    const summary = leaderboard.entries.map(
      (entry) =>
        `${entry.position}:${entry.author?.username ?? 'ẩn danh'}=${entry.engagementCount}`,
    );
    check(
      'B và A cùng 5, B đạt tương tác cuối sớm hơn nên đứng trước; ẩn danh 3; tài khoản bị khoá vắng mặt, không lỗ thứ hạng',
      JSON.stringify(summary) ===
        JSON.stringify(['1:dl_tac_gia_b=5', '2:dl_tac_gia_a=5', '3:ẩn danh=3']),
      JSON.stringify(summary),
    );
    const authorA = leaderboard.entries.find(
      (entry) => entry.author?.username === 'dl_tac_gia_a',
    );
    check(
      'A: 2 chủ đề, chủ đề nổi nhất là A1 với 4 (không tính tự tương tác, bình luận ẩn, ngoài tháng, chủ đề ẩn)',
      authorA?.threadCount === 2 &&
        authorA.topThread?.id === ThreadA1 &&
        authorA.topThread.engagementCount === 4,
      JSON.stringify(authorA),
    );
    const anonymous = leaderboard.entries[2];
    check(
      'người ẩn danh: không tên, không chủ đề',
      anonymous?.isAnonymous === true &&
        anonymous.author === null &&
        anonymous.topThread === null,
      JSON.stringify(anonymous),
    );
    const raw = JSON.stringify(leaderboard);
    check(
      'response không có userId, không lộ username hay chủ đề của người ẩn danh',
      !raw.includes('userId') &&
        !raw.includes(Anon) &&
        !raw.includes('dl_an_danh') &&
        !raw.includes(ThreadAnon),
    );
    check('tháng mặc định theo giờ Việt Nam', leaderboard.month === '2026-10');

    console.log('\n2. Tham số');
    const limited = await useCase.handle({ limit: 2 });
    check('limit 2 trả 2 dòng', limited.leaderboard.entries.length === 2);
    const september = await useCase.handle({ month: '2026-09' });
    check(
      'tháng 9 chỉ thấy bình luận tháng 9 của A',
      JSON.stringify(
        september.leaderboard.entries.map((entry) => [
          entry.author?.username,
          entry.engagementCount,
        ]),
      ) === JSON.stringify([['dl_tac_gia_a', 1]]),
      JSON.stringify(september.leaderboard.entries),
    );
    const november = await useCase.handle({ month: '2026-11' });
    check(
      'cảm xúc lúc 00:00 ngày 01/11 giờ Việt Nam thuộc tháng 11',
      november.leaderboard.entries.length === 1 &&
        november.leaderboard.entries[0].engagementCount === 1,
      JSON.stringify(november.leaderboard.entries),
    );

    console.log('\n3. Thời gian tụng kinh tháng 10/2026');
    const [Reciter1, Reciter2, Reciter3] = [11, 12, 13].map(id);
    for (const [userId, username] of [
      [Reciter1, 'dl_tung_1'],
      [Reciter2, 'dl_tung_2'],
      [Reciter3, 'dl_tung_3'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    const [content] = await sql(
      `INSERT INTO dharma_contents (content_type, title, slug, body_text)
       VALUES ('SUTRA', 'Kinh kiểm', 'kinh-kiem-bang-xep-hang', 'Như thị ngã văn.')
       RETURNING global_id`,
    );
    const recite = (userId: string, from: string, to: string | null) =>
      sql(
        `INSERT INTO dharma_recitations (content_id, user_id, started_at, completed_at, duration_seconds)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz,
                 CASE WHEN $4::timestamptz IS NULL THEN NULL
                      ELSE floor(EXTRACT(EPOCH FROM ($4::timestamptz - $3::timestamptz)))::int END)`,
        [content.global_id, userId, from, to],
      );
    // Người tụng 1: 10:00–10:30 và 10:10–10:40 chồng nhau → gộp 40 phút; một phiên 3 giờ →
    // cắt còn 2 giờ. Tổng 9.600 giây, 3 phiên. Phiên xong đúng 00:00 ngày 01/11 thuộc tháng sau.
    await recite(Reciter1, '2026-10-05T03:00:00Z', '2026-10-05T03:30:00Z');
    await recite(Reciter1, '2026-10-05T03:10:00Z', '2026-10-05T03:40:00Z');
    await recite(Reciter1, '2026-10-06T05:00:00Z', '2026-10-06T08:00:00Z');
    await recite(Reciter1, '2026-10-31T16:30:00Z', NovemberStartVn);
    // Người tụng 2: phiên 59 giây bỏ qua; 2 giờ 40 → 2 giờ; thêm 30 phút. 9.000, xong cuối ngày 15.
    await recite(Reciter2, '2026-10-14T01:00:00Z', '2026-10-14T01:00:59Z');
    await recite(Reciter2, '2026-10-14T13:00:00Z', '2026-10-14T15:40:00Z');
    await recite(Reciter2, '2026-10-15T16:00:00Z', '2026-10-15T16:30:00Z');
    // Người tụng 3: cũng 9.000 nhưng xong sớm hơn (ngày 10) → đứng trên người tụng 2.
    await recite(Reciter3, '2026-10-09T01:00:00Z', '2026-10-09T02:30:00Z');
    await recite(Reciter3, '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z');
    // Phiên chưa hoàn thành: không tính dù đã mở rất lâu.
    await recite(Reciter3, '2026-10-01T01:00:00Z', null);
    // Tài khoản bị khoá tụng nhiều nhất: vắng mặt.
    await recite(Banned, '2026-10-02T01:00:00Z', '2026-10-02T03:00:00Z');
    await recite(Banned, '2026-10-03T01:00:00Z', '2026-10-03T03:00:00Z');
    // Người ẩn danh: 10 phút, cộng một phiên bắt đầu 23:50 ngày 30/09 và xong 00:20 ngày
    // 01/10 giờ Việt Nam — tính trọn cho tháng 10 theo mốc hoàn thành.
    await recite(Anon, '2026-10-20T01:00:00Z', '2026-10-20T01:10:00Z');
    await recite(Anon, '2026-09-30T16:50:00Z', '2026-09-30T17:20:00Z');

    const recitation = new GetRecitationTimeLeaderboardUseCase(
      repository,
      () => new Date('2026-10-25T00:00:00Z'),
    );
    const { leaderboard: time } = await recitation.handle({});
    const ranking = time.entries.map(
      (entry) =>
        `${entry.position}:${entry.user?.username ?? 'ẩn danh'}=${entry.totalSeconds}/${entry.sessionCount}`,
    );
    check(
      'gộp phiên chồng, cắt trần 2 giờ, bỏ phiên < 60 giây và phiên chưa xong; hoà thì xong sớm hơn đứng trước; tài khoản khoá vắng mặt',
      JSON.stringify(ranking) ===
        JSON.stringify([
          '1:dl_tung_1=9600/3',
          '2:dl_tung_3=9000/2',
          '3:dl_tung_2=9000/2',
          '4:ẩn danh=2400/2',
        ]),
      JSON.stringify(ranking),
    );
    check(
      'người ẩn danh không lộ, response không có userId',
      time.entries[3]?.user === null &&
        !JSON.stringify(time).includes('userId') &&
        !JSON.stringify(time).includes('dl_an_danh'),
    );
    const timeNovember = await recitation.handle({ month: '2026-11' });
    check(
      'phiên xong lúc 00:00 ngày 01/11 giờ Việt Nam thuộc tháng 11',
      JSON.stringify(
        timeNovember.leaderboard.entries.map((entry) => [
          entry.user?.username,
          entry.totalSeconds,
        ]),
      ) === JSON.stringify([['dl_tung_1', 1800]]),
      JSON.stringify(timeNovember.leaderboard.entries),
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
        ? 'Bảng tương tác diễn đàn: đếm từ bảng nguồn, loại tự tương tác và nội dung bị kiểm duyệt, hoà điểm tất định, giữ ẩn danh'
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
