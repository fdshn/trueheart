/**
 * Dự án từ thiện 4 giai đoạn — đợt 3 — trên Postgres THẬT
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.5).
 *
 * - Timeline: 10 bước idempotent; xong mà thiếu giờ thì lấy giờ hiện tại; ràng buộc database.
 * - Cộng tác viên: điều kiện (đóng góp được chấp nhận + đăng ký tham gia), cấp/thu hồi/cấp lại.
 * - Quota: 8 lượt ký song song với quota 5 → đúng 5; tính theo ngày, theo dự án, theo người.
 * - Bài: tiêu lượt ký đúng một lần (song song cùng một tệp → một bài), sai người/sai loại thì
 *   rollback cả bài; danh sách bỏ bài gỡ/ẩn; đếm tương tác từng bài.
 * - Báo xấu bài: kết luận đúng → ẩn có audit, không audit đôi; mở về đúng dự án.
 * - Dọn media mồ côi: giữ tệp của bài, xoá lượt ký bỏ dở.
 *
 *   npm run test:charity-event
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { SweepOrphanMediaUseCase } from '../src/application/implementations/media/sweep-orphan-media.use-case';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityEventRepository } from '../src/infrastructure/repository/charity-event.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { ReportRepository } from '../src/infrastructure/repository/report.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_event_check';
const id = (tail: string) => `7d000000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Admin = id('02');
const Giver = id('03');
const Walker = id('04');
const Other = id('05');
const Live = id('10');
const Second = id('11');

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
    extra: { max: 12 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);
    const events = new CharityEventRepository(dataSource.manager);

    for (const [userId, username] of [
      [Owner, 'cv_owner'],
      [Admin, 'cv_admin'],
      [Giver, 'cv_giver'],
      [Walker, 'cv_walker'],
      [Other, 'cv_other'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    for (const [campaignId, slug] of [
      [Live, 'cv-live'],
      [Second, 'cv-second'],
    ])
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage)
         VALUES ($1, 'Dự án kiểm', $2, 'Mô tả đủ dài cho dự án kiểm', 'https://cdn.test/a.jpg',
                 'Ấm', now() - interval '10 days', now() + interval '20 days', $3, 'APPROVED',
                 now(), $3, now(), 'EVENT')`,
        [campaignId, slug, Owner],
      );

    // ── 1. Timeline ──────────────────────────────────────────────────────
    console.log('1. Timeline tab C');
    await events.ensureEventSteps(Live);
    await events.ensureEventSteps(Live);
    const steps = await events.listEventSteps(Live);
    check(
      'mở hai lần vẫn đúng 10 bước theo thứ tự',
      steps.length === 10 &&
        steps[0].stepKey === 'GATHER' &&
        steps[9].stepKey === 'RETURN',
    );
    const planned = new Date(Date.now() + 3_600_000);
    await events.updateEventStep({
      campaignId: Live,
      stepId: steps[7].stepId,
      actorId: Owner,
      patch: { plannedAt: planned, note: 'Trao ở sân trường' },
    });
    const done = await events.updateEventStep({
      campaignId: Live,
      stepId: steps[7].stepId,
      actorId: Owner,
      patch: { status: 'DONE' },
    });
    check(
      'xong mà không gửi giờ → lấy giờ hiện tại; field không gửi giữ nguyên',
      done?.status === 'DONE' &&
        done.actualAt !== null &&
        done.plannedAt?.getTime() === planned.getTime() &&
        done.note === 'Trao ở sân trường',
      JSON.stringify(done),
    );
    const cleared = await events.updateEventStep({
      campaignId: Live,
      stepId: steps[7].stepId,
      actorId: Owner,
      patch: { note: null },
    });
    check(
      '`null` xoá field; trạng thái giữ DONE',
      cleared?.note === null && cleared.status === 'DONE',
    );
    check(
      'bước của dự án khác → null',
      (await events.updateEventStep({
        campaignId: Second,
        stepId: steps[0].stepId,
        actorId: Owner,
        patch: { status: 'DONE' },
      })) === null,
    );
    let doneTimeGuard = false;
    try {
      await sql(
        `UPDATE campaign_event_steps SET actual_at = NULL WHERE global_id = $1`,
        [steps[7].stepId],
      );
    } catch {
      doneTimeGuard = true;
    }
    check('database chặn bước DONE thiếu giờ thực tế', doneTimeGuard);

    // ── 2. Cộng tác viên ─────────────────────────────────────────────────
    console.log('\n2. Cộng tác viên sự kiện');
    await sql(
      `INSERT INTO campaign_contributions (campaign_id, contributor_id, status)
       VALUES ($1, $2, 'PENDING_REVIEW'), ($1, $3, 'PENDING_REVIEW')`,
      [Live, Giver, Walker],
    );
    await sql(
      `UPDATE campaign_contributions SET status = 'ACCEPTED', decided_at = now(), decided_by = $2
       WHERE campaign_id = $1 AND contributor_id = $3`,
      [Live, Owner, Giver],
    ).catch(() => undefined);
    const [{ status: giverStatus }] = await sql(
      `SELECT status FROM campaign_contributions WHERE campaign_id = $1 AND contributor_id = $2`,
      [Live, Giver],
    );
    await sql(
      `INSERT INTO campaign_participations (campaign_id, user_id, status) VALUES ($1, $2, 'REGISTERED'), ($1, $3, 'REGISTERED')`,
      [Live, Giver, Walker],
    );
    check(
      'đóng góp được chấp nhận + đăng ký → đủ; chỉ đăng ký mà đóng góp chưa duyệt → không',
      giverStatus === 'ACCEPTED' &&
        (await events.isEligibleContributor(Live, Giver)) &&
        !(await events.isEligibleContributor(Live, Walker)) &&
        !(await events.isEligibleContributor(Second, Giver)),
      `giver=${giverStatus}`,
    );
    const candidates = await events.listContributorCandidates(Live);
    check(
      'danh sách đủ điều kiện có người tặng, không có người chưa được duyệt',
      candidates.map((row) => row.userId).join() === Giver,
    );
    await events.setContributor({
      campaignId: Live,
      userId: Giver,
      actorId: Owner,
      active: true,
    });
    const revoked = await events.setContributor({
      campaignId: Live,
      userId: Giver,
      actorId: Owner,
      active: false,
    });
    const regranted = await events.setContributor({
      campaignId: Live,
      userId: Giver,
      actorId: Owner,
      active: true,
    });
    check(
      'cấp → thu hồi (giữ dòng) → cấp lại; người đã cấp không còn là ứng viên',
      revoked?.active === false &&
        revoked.revokedAt !== null &&
        regranted?.active === true &&
        (await events.isActiveContributor(Live, Giver)) &&
        (await events.listContributorCandidates(Live)).length === 0,
    );

    // ── 3. Quota ─────────────────────────────────────────────────────────
    console.log('\n3. Quota ký đường tải');
    const dayStart = new Date(Date.now() - 3_600_000);
    await sql(
      `INSERT INTO campaign_post_uploads (campaign_id, user_id, storage_key, media_type, created_at)
       VALUES ($1, $2, 'users/old/campaign-media/yesterday.webp', 'IMAGE', now() - interval '2 days')`,
      [Live, Giver],
    );
    let counter = 0;
    const reserve = (campaignId: string, mediaType: 'IMAGE' | 'VIDEO') =>
      events.reserveUpload({
        campaignId,
        userId: Giver,
        mediaType,
        since: dayStart,
        quota: 5,
        sign: async () => ({
          key: `users/${Giver}/campaign-media/k${(counter += 1)}.${mediaType === 'IMAGE' ? 'webp' : 'mp4'}`,
        }),
      });
    const burst = await Promise.all(
      Array.from({ length: 8 }, () => reserve(Live, 'IMAGE')),
    );
    check(
      '8 lượt ký ảnh song song, quota 5 → đúng 5 được; lượt hôm qua không tính',
      burst.filter((row) => row.status === 'RESERVED').length === 5 &&
        burst.filter((row) => row.status === 'QUOTA_EXCEEDED').length === 3,
      burst.map((row) => row.status).join(','),
    );
    check(
      'clip đếm riêng; dự án khác đếm riêng',
      (await reserve(Live, 'VIDEO')).status === 'RESERVED' &&
        (await reserve(Second, 'IMAGE')).status === 'RESERVED',
    );
    const used = await events.usedUploads({
      campaignId: Live,
      userId: Giver,
      since: dayStart,
    });
    check(
      'đếm đã dùng: 5 ảnh, 1 clip',
      used.IMAGE === 5 && used.VIDEO === 1,
      JSON.stringify(used),
    );

    // ── 4. Bài ───────────────────────────────────────────────────────────
    console.log('\n4. Bài ảnh/clip');
    const keys = burst
      .filter((row) => row.status === 'RESERVED')
      .map((row) => (row as { upload: { key: string } }).upload.key);
    const media = (key: string, mediaType: 'IMAGE' | 'VIDEO' = 'IMAGE') => ({
      storageKey: key,
      publicUrl: `https://cdn.test/${key}`,
      mediaType,
    });
    const first = await events.createPost({
      campaignId: Live,
      authorId: Giver,
      authorRole: 'PARTICIPANT',
      stage: 'EVENT',
      body: 'Đã tới nơi',
      media: [media(keys[0]), media(keys[1])],
    });
    check(
      'đăng bài với hai ảnh',
      first !== 'MEDIA_INVALID' &&
        first.media.length === 2 &&
        first.author.username === 'cv_giver',
    );
    const postCount = async () =>
      (await sql(`SELECT count(*)::int AS total FROM campaign_posts`))[0]
        .total as number;
    const beforeInvalid = await postCount();
    const reuse = await events.createPost({
      campaignId: Live,
      authorId: Giver,
      authorRole: 'PARTICIPANT',
      stage: 'EVENT',
      body: null,
      media: [media(keys[2]), media(keys[0])],
    });
    const [{ consumed }] = await sql(
      `SELECT (consumed_at IS NOT NULL) AS consumed FROM campaign_post_uploads WHERE storage_key = $1`,
      [keys[2]],
    );
    check(
      'dùng lại tệp đã đăng → MEDIA_INVALID, không có bài, tệp còn lại KHÔNG bị tiêu (rollback)',
      reuse === 'MEDIA_INVALID' &&
        (await postCount()) === beforeInvalid &&
        consumed === false,
    );
    check(
      'tệp của người khác / sai loại → MEDIA_INVALID',
      (await events.createPost({
        campaignId: Live,
        authorId: Other,
        authorRole: 'ORGANIZER',
        stage: 'EVENT',
        body: null,
        media: [media(keys[2])],
      })) === 'MEDIA_INVALID' &&
        (await events.createPost({
          campaignId: Live,
          authorId: Giver,
          authorRole: 'PARTICIPANT',
          stage: 'EVENT',
          body: null,
          media: [media(keys[2], 'VIDEO')],
        })) === 'MEDIA_INVALID',
    );
    const race = await Promise.all(
      [1, 2].map(() =>
        events.createPost({
          campaignId: Live,
          authorId: Giver,
          authorRole: 'PARTICIPANT',
          stage: 'EVENT',
          body: 'Song song',
          media: [media(keys[3])],
        }),
      ),
    );
    check(
      'hai bài song song cùng một tệp → đúng một bài',
      race.filter((row) => row !== 'MEDIA_INVALID').length === 1,
    );
    const textOnly = await events.createPost({
      campaignId: Live,
      authorId: Owner,
      authorRole: 'ORGANIZER',
      stage: 'EVENT',
      body: 'Chỉ chữ',
      media: [],
    });
    await sql(
      `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
       VALUES ('CHARITY_CAMPAIGN_POST', $1, $2, 'LIKE')`,
      [(first as { postId: string }).postId, Owner],
    );
    await sql(
      `INSERT INTO content_comments (global_id, subject_type, subject_id, author_id, body, depth, status)
       VALUES (gen_random_uuid(), 'CHARITY_CAMPAIGN_POST', $1, $2, 'Tuyệt', 1, 'VISIBLE')`,
      [(first as { postId: string }).postId, Owner],
    );
    await events.deletePost({
      campaignId: Live,
      postId: (textOnly as { postId: string }).postId,
      actorId: Owner,
    });
    const listed = await events.listPosts({
      campaignId: Live,
      beforePostId: null,
      limit: 10,
    });
    const firstListed = listed.find(
      (row) => row.postId === (first as { postId: string }).postId,
    );
    check(
      'danh sách bỏ bài đã gỡ; đếm cảm xúc/bình luận từng bài',
      listed.length === 2 &&
        !listed.some(
          (row) => row.postId === (textOnly as { postId: string }).postId,
        ) &&
        firstListed?.reactionCount === 1 &&
        firstListed.commentCount === 1,
      `listed=${listed.length}`,
    );
    const page2 = await events.listPosts({
      campaignId: Live,
      beforePostId: listed[0].postId,
      limit: 10,
    });
    check(
      'phân trang bài',
      page2.length === 1 && page2[0].postId === listed[1].postId,
    );

    // ── 5. Báo xấu bài ───────────────────────────────────────────────────
    console.log('\n5. Báo xấu bài');
    const reports = new ReportRepository(
      entities.ReportEntity as never,
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
      new AdminConfigRepository(dataSource.manager),
    );
    const postId = (first as { postId: string }).postId;
    check(
      'đích hợp lệ; chủ là người đăng; màn mở là DỰ ÁN chứa bài',
      (await reports.targetExists('CHARITY_CAMPAIGN_POST' as never, postId)) &&
        (await reports.findTargetOwner(
          'CHARITY_CAMPAIGN_POST' as never,
          postId,
        )) === Giver &&
        (
          await reports.findContentLocation(
            'CHARITY_CAMPAIGN_POST' as never,
            postId,
          )
        )?.id === Live,
    );
    const reportIds: string[] = [];
    for (const reporter of [Owner, Other]) {
      const [row] = await sql(
        `INSERT INTO reports (global_id, reporter_user_id, target_type, target_id, reason, description)
         VALUES (gen_random_uuid(), $1, 'CHARITY_CAMPAIGN_POST', $2, 'INAPPROPRIATE_CONTENT', 'Ảnh không phù hợp')
         RETURNING global_id`,
        [reporter, postId],
      );
      reportIds.push(row.global_id);
    }
    for (const reportId of reportIds)
      await reports.reviewByAdmin({
        actorUserId: Admin,
        reportId,
        status: 'RESOLVED' as never,
        note: 'Ảnh có thông tin cá nhân',
      });
    const [{ audits }] = await sql(
      `SELECT count(*)::int AS audits FROM admin_audit_logs WHERE action = 'HIDE_CHARITY_CAMPAIGN_POST'`,
    );
    const afterHide = await events.listPosts({
      campaignId: Live,
      beforePostId: null,
      limit: 10,
    });
    check(
      'kết luận đúng → bài ẩn khỏi danh sách, một audit cho hai báo cáo',
      audits === 1 && !afterHide.some((row) => row.postId === postId),
      `audits=${audits}`,
    );

    // ── 6. Dọn media mồ côi ──────────────────────────────────────────────
    console.log('\n6. Dọn media mồ côi');
    const old = new Date(Date.now() - 48 * 3_600_000);
    const deletedKeys: string[] = [];
    const sweep = new SweepOrphanMediaUseCase(
      dataSource.manager,
      {
        listObjects: async () => ({
          objects: [keys[0], keys[4]].map((key) => ({
            key,
            lastModified: old,
            size: 10,
          })),
          nextCursor: undefined,
        }),
        deleteObjects: async (doomed: readonly string[]) => {
          deletedKeys.push(...doomed);
          return doomed.length;
        },
      } as never,
      { storage: { publicBaseUrl: 'https://cdn.test' } } as never,
    );
    await sweep.handle({ dryRun: false });
    check(
      'giữ tệp của bài (kể cả bài đã ẩn), xoá lượt ký bỏ dở',
      deletedKeys.join() === keys[4],
      deletedKeys.join(),
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} phép kiểm thất bại`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nDự án từ thiện đợt 3: mọi phép kiểm đạt');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
