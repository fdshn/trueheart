/**
 * Dự án từ thiện 4 giai đoạn — đợt 2 — trên Postgres THẬT
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.3, §3.4, §3.7, §3.8, §3.10, §3.13).
 *
 * - Migration: enum tương tác/báo xấu có giá trị mới; down xoá dữ liệu mang giá trị đó rồi
 *   thu hẹp type, up chạy lại được.
 * - Lịch sử sửa: chỉ ghi SAU khi duyệt, cùng transaction; field riêng tư không công khai;
 *   thay đổi quan trọng xếp thông báo; số tiến độ không sinh revision; append-only.
 * - Chuyển giai đoạn tới xếp thông báo, lùi thì không.
 * - Checklist: tạo idempotent, đổi trạng thái ghi revision.
 * - Quan tâm, đếm thẳng từ bảng gốc, thống kê nội bộ, người nhận thông báo.
 * - Nhắc 48 giờ: chọn đúng dự án, chống trùng theo mốc trao, dời mốc thì nhắc lại.
 * - Outbox: hai job chạy chồng không xử lý một thông báo hai lần.
 * - Bản in: gắn revision cuối; báo xấu dự án → đình chỉ có audit, không audit đôi.
 *
 *   npm run test:charity-engagement
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityEngagementRepository } from '../src/infrastructure/repository/charity-engagement.repository';
import { CharityProjectRepository } from '../src/infrastructure/repository/charity-project.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { ReportRepository } from '../src/infrastructure/repository/report.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_engagement_check';
const id = (tail: string) => `7c000000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Admin = id('02');
const Giver = id('03');
const Follower = id('04');
const Volunteer = id('05');
const Gone = id('06');
const Draft = id('10');
const Live = id('11');
const Soon = id('12');
const Closed = id('13');
const Hour = 3_600_000;

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
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);
    const projects = new CharityProjectRepository(dataSource.manager);
    const engagement = new CharityEngagementRepository(dataSource.manager);

    for (const [userId, username] of [
      [Owner, 'ce_owner'],
      [Admin, 'ce_admin'],
      [Giver, 'ce_giver'],
      [Follower, 'ce_follower'],
      [Volunteer, 'ce_volunteer'],
      [Gone, 'ce_gone'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    const insertCampaign = (
      campaignId: string,
      slug: string,
      approved: boolean,
      endsInHours = 30 * 24,
      active = true,
    ) =>
      sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage,
            is_active)
         VALUES ($1, 'Dự án kiểm', $2, 'Mô tả đủ dài cho dự án kiểm', 'https://cdn.test/a.jpg',
                 'Ấm', now() - interval '10 days', now() + make_interval(hours => $5::int), $3,
                 CASE WHEN $4 THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END,
                 CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN $3::uuid END, now(),
                 CASE WHEN $4 THEN 'EXECUTION' ELSE 'PLAN' END, $6)`,
        [campaignId, slug, Owner, approved, endsInHours, active],
      );
    await insertCampaign(Draft, 'ce-draft', false);
    await insertCampaign(Live, 'ce-live', true);
    await insertCampaign(Soon, 'ce-soon', true);
    await insertCampaign(Closed, 'ce-closed', true, -24, false);

    // ── 0. Migration ─────────────────────────────────────────────────────
    console.log('0. Migration: enum mới, down thu hẹp type, up lại');
    const enumValues = async (type: string) =>
      (
        await sql(
          `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = $1`,
          [type],
        )
      ).map((row: { enumlabel: string }) => row.enumlabel);
    const subjectValues = await enumValues('content_subject_type_enum');
    check(
      'content_subject_type_enum có CHARITY_CAMPAIGN và CHARITY_CAMPAIGN_POST',
      ['CHARITY_CAMPAIGN', 'CHARITY_CAMPAIGN_POST'].every((value) =>
        subjectValues.includes(value),
      ),
    );
    await sql(
      `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
       VALUES ('CHARITY_CAMPAIGN', $1, $2, 'LIKE'), ('POST', $1, $2, 'LIKE')`,
      [Live, Giver],
    );
    await sql(
      `INSERT INTO reports (global_id, reporter_user_id, target_type, target_id, reason, description)
       VALUES (gen_random_uuid(), $1, 'CHARITY_CAMPAIGN', $2, 'SCAM', 'Báo thử trước khi lùi migration')`,
      [Giver, Live],
    );
    await dataSource.undoLastMigration();
    const [{ reactions }] = await sql(
      `SELECT count(*)::int AS reactions FROM content_reactions`,
    );
    check(
      'down xoá đúng dòng mang giá trị mới, giữ dòng POST',
      reactions === 1 &&
        !(await enumValues('content_subject_type_enum')).includes(
          'CHARITY_CAMPAIGN',
        ) &&
        !(await enumValues('reports_target_type_enum')).includes(
          'CHARITY_CAMPAIGN',
        ),
      `reactions=${reactions}`,
    );
    await dataSource.runMigrations();
    await sql(`DELETE FROM content_reactions`);
    check(
      'up lại có đủ giá trị',
      (await enumValues('reports_target_type_enum')).includes(
        'CHARITY_CAMPAIGN_POST',
      ),
    );

    // ── 1. Lịch sử sửa ───────────────────────────────────────────────────
    console.log('\n1. Lịch sử sửa (§3.3)');
    const revisionCount = async (campaignId: string) =>
      (
        await sql(
          `SELECT count(*)::int AS total FROM campaign_revisions WHERE campaign_id = $1`,
          [campaignId],
        )
      )[0].total as number;
    await projects.updateProfile({
      campaignId: Draft,
      actorId: Owner,
      profile: {
        appealPurpose: 'Nháp',
        appealAudience: null,
        appealCircumstance: null,
        callToActions: ['LIKE'],
      },
    });
    check(
      'dự án CHƯA duyệt: sửa không sinh revision',
      (await revisionCount(Draft)) === 0,
    );

    await projects.updateProfile({
      campaignId: Live,
      actorId: Owner,
      profile: {
        appealPurpose: 'Giúp 300 em',
        appealAudience: null,
        appealCircumstance: null,
        callToActions: [],
      },
    });
    const [purpose] = await sql(
      `SELECT entity, field, old_value, new_value, is_public, is_important, changed_by
       FROM campaign_revisions WHERE campaign_id = $1`,
      [Live],
    );
    check(
      'đã duyệt: một revision CAMPAIGN.appealPurpose, công khai, không quan trọng',
      (await revisionCount(Live)) === 1 &&
        purpose.entity === 'CAMPAIGN' &&
        purpose.field === 'appealPurpose' &&
        purpose.old_value === null &&
        purpose.new_value === 'Giúp 300 em' &&
        purpose.is_public &&
        !purpose.is_important &&
        purpose.changed_by === Owner,
      JSON.stringify(purpose),
    );

    await projects.replaceParties({
      campaignId: Live,
      actorId: Owner,
      parties: [
        {
          role: 'BENEFICIARY',
          name: 'Điểm trường A',
          address: 'Thôn 3',
          phone: '0901',
          email: null,
          hotline: null,
          picName: null,
          picPhone: null,
          picUserId: null,
          beneficiaryKind: 'GROUP',
          evidenceUrls: [],
        },
      ],
    });
    const [party] = await sql(
      `SELECT field, new_value, is_important FROM campaign_revisions
       WHERE campaign_id = $1 AND entity = 'PARTY'`,
      [Live],
    );
    check(
      'thêm bên thụ hưởng: một revision `*` quan trọng, không mang địa chỉ/SĐT',
      party?.field === '*' &&
        party.is_important &&
        !JSON.stringify(party.new_value).includes('Thôn 3') &&
        !JSON.stringify(party.new_value).includes('0901'),
      JSON.stringify(party),
    );
    const [planChanged] = await sql(
      `SELECT kind, payload FROM campaign_announcements WHERE campaign_id = $1`,
      [Live],
    );
    check(
      'thay đổi quan trọng xếp PLAN_CHANGED vào outbox, payload chỉ có tên field',
      planChanged?.kind === 'PLAN_CHANGED' &&
        planChanged.payload.changes.length === 1 &&
        planChanged.payload.changes[0].entity === 'PARTY' &&
        planChanged.payload.changes[0].field === '*' &&
        Object.keys(planChanged.payload).join() === 'changes',
      JSON.stringify(planChanged),
    );

    const [{ need_id: needId }] = await sql(
      `INSERT INTO campaign_need_items (campaign_id, item_name, unit, target_quantity)
       VALUES ($1, 'Áo ấm', 'chiếc', 100) RETURNING global_id AS need_id`,
      [Live],
    );
    const before = await revisionCount(Live);
    await projects.updateItemNeedProfile({
      campaignId: Live,
      needItemId: needId,
      actorId: Owner,
      profile: {
        unitPrice: null,
        estimatedValue: null,
        itemCondition: null,
        conditionNote: null,
        supplySource: null,
        intakeDeadline: null,
        dropoffAddress: null,
        deliveryInstruction: null,
        receiverName: 'Anh Nhận',
        receiverPhone: null,
        intakeStatus: 'OPEN',
      },
    });
    const receiver = await sql(
      `SELECT field, is_public FROM campaign_revisions
       WHERE campaign_id = $1 AND entity = 'NEED_ITEM'`,
      [Live],
    );
    check(
      'người nhận hàng là revision RIÊNG TƯ',
      (await revisionCount(Live)) === before + 1 &&
        receiver[0]?.field === 'receiverName' &&
        receiver[0].is_public === false,
      JSON.stringify(receiver),
    );

    const funding = await projects.createFundingNeed({
      campaignId: Live,
      actorId: Owner,
      need: {
        title: 'Xăng xe',
        description: null,
        beneficiaryPartyId: null,
        receivingUnit: null,
        bankAccountId: null,
        targetAmount: 5_000_000,
        deadline: null,
        sortOrder: 0,
      },
    });
    const afterCreate = await revisionCount(Live);
    await projects.updateFundingNeed({
      campaignId: Live,
      fundingNeedId: funding.fundingNeedId,
      actorId: Owner,
      need: {
        title: 'Xăng xe',
        description: null,
        beneficiaryPartyId: null,
        receivingUnit: null,
        bankAccountId: null,
        targetAmount: 5_000_000,
        deadline: null,
        sortOrder: 0,
      },
      confirmedAmount: 1_000_000,
      externalAmount: 0,
      status: 'OPEN',
    });
    check(
      'cập nhật số đã xác nhận (tiến độ) KHÔNG sinh revision',
      (await revisionCount(Live)) === afterCreate,
    );

    const startsAt = new Date(Date.now() + 5 * 24 * Hour);
    const phases = (distributionStart: Date) => [
      {
        phase: 'DISTRIBUTION' as const,
        startsAt: distributionStart,
        endsAt: new Date(distributionStart.getTime() + 6 * Hour),
        picName: null,
        picUserId: null,
        hotline: null,
        deliveryMethod: 'ON_SITE' as const,
        reportMode: null,
      },
    ];
    await projects.replacePhases({
      campaignId: Live,
      actorId: Owner,
      phases: phases(startsAt),
    });
    await projects.replacePhases({
      campaignId: Live,
      actorId: Owner,
      phases: phases(new Date(startsAt.getTime() + Hour)),
    });
    const phaseRevisions = await sql(
      `SELECT field, is_important FROM campaign_revisions
       WHERE campaign_id = $1 AND entity = 'PHASE' ORDER BY id`,
      [Live],
    );
    check(
      'lập rồi dời bước trao: `*` rồi startsAt + endsAt, đều quan trọng',
      phaseRevisions.map((row: { field: string }) => row.field).join(',') ===
        '*,startsAt,endsAt' &&
        phaseRevisions.every(
          (row: { is_important: boolean }) => row.is_important,
        ),
      JSON.stringify(phaseRevisions),
    );

    const failedBefore = await revisionCount(Live);
    const outcome = await projects.addBankAccount({
      campaignId: Live,
      actorId: Owner,
      account: {
        label: null,
        bankName: 'VCB',
        accountNo: '1',
        accountName: 'A',
      },
      replacesAccountId: id('99'),
      replaceReason: null,
      limit: 2,
    });
    check(
      'thêm tài khoản thất bại (thay tài khoản không có) không để lại revision',
      outcome.status === 'REPLACED_NOT_FOUND' &&
        (await revisionCount(Live)) === failedBefore,
    );

    let appendOnly = false;
    try {
      await sql(
        `UPDATE campaign_revisions SET field = 'x' WHERE campaign_id = $1`,
        [Live],
      );
    } catch {
      appendOnly = true;
    }
    check('campaign_revisions append-only', appendOnly);

    const changedPublic = await engagement.listChangedFields({
      campaignId: Live,
      publicOnly: true,
    });
    const changedAll = await engagement.listChangedFields({
      campaignId: Live,
      publicOnly: false,
    });
    check(
      'field đã sửa: công khai không có receiverName, workspace có',
      !changedPublic.some((row) => row.field === 'receiverName') &&
        changedAll.some((row) => row.field === 'receiverName'),
    );
    const page1 = await engagement.listRevisions({
      campaignId: Live,
      publicOnly: false,
      beforeRevisionId: null,
      limit: 2,
    });
    const page2 = await engagement.listRevisions({
      campaignId: Live,
      publicOnly: false,
      beforeRevisionId: page1[1].revisionId,
      limit: 100,
    });
    check(
      'phân trang changelog bằng con trỏ: không trùng, không sót',
      page1.length === 2 &&
        page2.length === (await revisionCount(Live)) - 2 &&
        !page2.some((row) =>
          page1.some((head) => head.revisionId === row.revisionId),
        ),
    );

    // ── 2. Giai đoạn → outbox ────────────────────────────────────────────
    console.log('\n2. Chuyển giai đoạn xếp thông báo (§3.10)');
    await sql(`DELETE FROM campaign_announcements`);
    await projects.moveStage({
      campaignId: Live,
      from: 'EXECUTION',
      to: 'EVENT',
      actorId: Owner,
      reason: null,
    });
    await projects.moveStage({
      campaignId: Live,
      from: 'EVENT',
      to: 'EXECUTION',
      actorId: Owner,
      reason: 'Lùi để sửa',
    });
    const stageAnnouncements = await sql(
      `SELECT kind, payload FROM campaign_announcements WHERE campaign_id = $1`,
      [Live],
    );
    check(
      'tiến sang EVENT xếp STAGE_CHANGED; lùi lại không xếp',
      stageAnnouncements.length === 1 &&
        stageAnnouncements[0].payload.to === 'EVENT',
      JSON.stringify(stageAnnouncements),
    );

    // ── 3. Checklist ─────────────────────────────────────────────────────
    console.log('\n3. Checklist tab B (§3.4)');
    await engagement.ensureTasks({ campaignId: Live, schedule: {} });
    await engagement.ensureTasks({
      campaignId: Live,
      schedule: { CLOSE_INTAKE: new Date() },
    });
    const tasks = await engagement.listTasks(Live);
    check(
      'tạo hai lần vẫn đúng 7 việc, đúng thứ tự',
      tasks.length === 7 &&
        tasks[0].taskKey === 'LICENSING' &&
        tasks[6].taskKey === 'PRE_EVENT_NOTICE',
    );
    const done = await engagement.updateTask({
      campaignId: Live,
      taskId: tasks[0].taskId,
      actorId: Owner,
      patch: { status: 'DONE', remark: 'nội bộ' },
    });
    const [taskRevision] = await sql(
      `SELECT field, old_value, new_value FROM campaign_revisions
       WHERE campaign_id = $1 AND entity = 'TASK'`,
      [Live],
    );
    check(
      'đổi trạng thái ghi revision TASK.status; remark giữ, không sinh revision',
      done?.status === 'DONE' &&
        done.remark === 'nội bộ' &&
        taskRevision?.field === 'status' &&
        taskRevision.old_value === 'TODO' &&
        taskRevision.new_value === 'DONE',
      JSON.stringify(taskRevision),
    );
    check(
      'việc của dự án khác → null',
      (await engagement.updateTask({
        campaignId: Soon,
        taskId: tasks[0].taskId,
        actorId: Owner,
        patch: { status: 'DONE' },
      })) === null,
    );

    // ── 4. Quan tâm, đếm, thống kê, người nhận ──────────────────────────
    console.log('\n4. Quan tâm, đếm, thống kê, người nhận (§3.7)');
    check(
      'quan tâm: lần đầu true, lần hai false; bỏ: true rồi false',
      (await engagement.follow(Live, Follower)) &&
        !(await engagement.follow(Live, Follower)) &&
        (await engagement.follow(Live, Gone)) &&
        (await engagement.unfollow(Live, Gone)) &&
        !(await engagement.unfollow(Live, Gone)),
    );
    await sql(
      `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
       VALUES ('CHARITY_CAMPAIGN', $1, $2, 'LIKE'), ('CHARITY_CAMPAIGN', $1, $3, 'LOVE')`,
      [Live, Giver, Follower],
    );
    await sql(
      `INSERT INTO content_comments (global_id, subject_type, subject_id, author_id, body, depth, status)
       VALUES (gen_random_uuid(), 'CHARITY_CAMPAIGN', $1, $2, 'Cố lên', 1, 'VISIBLE'),
              (gen_random_uuid(), 'CHARITY_CAMPAIGN', $1, $2, 'Chờ duyệt', 1, 'PENDING_REVIEW')`,
      [Live, Giver],
    );
    const counters = await engagement.counters(Live);
    check(
      'đếm thẳng: 2 cảm xúc, 1 bình luận đang hiện, 1 người quan tâm',
      counters.reactionCount === 2 &&
        counters.commentCount === 1 &&
        counters.followerCount === 1,
      JSON.stringify(counters),
    );

    await sql(
      `INSERT INTO campaign_contributions (campaign_id, contributor_id, status, decided_at, decided_by)
       VALUES ($1, $2, 'ACCEPTED', now(), $3)`,
      [Live, Giver, Owner],
    ).catch(async () =>
      sql(
        `INSERT INTO campaign_contributions (campaign_id, contributor_id, status)
         VALUES ($1, $2, 'PENDING_REVIEW')`,
        [Live, Giver],
      ),
    );
    await sql(
      `INSERT INTO campaign_participations (campaign_id, user_id, status) VALUES ($1, $2, 'REGISTERED')`,
      [Live, Gone],
    );
    await sql(`UPDATE users SET deleted_at = now() WHERE global_id = $1`, [
      Gone,
    ]);
    const [{ volunteer_need: volunteerNeed }] = await sql(
      `INSERT INTO campaign_volunteer_needs (campaign_id, title, needed_count, updated_by)
       VALUES ($1, 'Bốc xếp', 3, $2) RETURNING global_id AS volunteer_need`,
      [Live, Owner],
    );
    await sql(
      `INSERT INTO campaign_volunteer_registrations (volunteer_need_id, user_id) VALUES ($1, $2)`,
      [volunteerNeed, Volunteer],
    );
    const audience = await engagement.listAudience({
      campaignId: Live,
      excludeUserId: Follower,
    });
    const [contribution] = await sql(
      `SELECT status FROM campaign_contributions WHERE campaign_id = $1`,
      [Live],
    );
    const expectedAudience =
      contribution.status === 'ACCEPTED' ? [Giver, Volunteer] : [Volunteer];
    check(
      'người nhận: góp được chấp nhận + tuyển người; bỏ người gây ra thay đổi và tài khoản đã xoá',
      JSON.stringify(audience) === JSON.stringify(expectedAudience.sort()),
      JSON.stringify(audience),
    );
    const stats = await engagement.internalStats(Live);
    check(
      'thống kê nội bộ: đề nghị theo trạng thái, tuyển người, quan tâm',
      stats.contributions.pendingReview + stats.contributions.accepted === 1 &&
        stats.volunteers.registered === 1 &&
        stats.followerCount === 1 &&
        stats.reports.total === 0,
      JSON.stringify(stats),
    );

    // ── 5. Nhắc 48 giờ ───────────────────────────────────────────────────
    console.log('\n5. Nhắc 48 giờ (§3.4)');
    const soonStart = new Date(Date.now() + 20 * Hour);
    await projects.replacePhases({
      campaignId: Soon,
      actorId: Owner,
      phases: phases(soonStart),
    });
    const due = await engagement.listPreEventCandidates({
      hours: 48,
      limit: 10,
    });
    check(
      'chỉ dự án trao trong ≤ 48 giờ (dự án trao sau 5 ngày không có)',
      due.length === 1 && due[0].campaignId === Soon,
      JSON.stringify(due),
    );
    const key = String(due[0].distributionStartsAt.getTime());
    const queued = await engagement.enqueueAnnouncement({
      campaignId: Soon,
      kind: 'PRE_EVENT',
      payload: {},
      dedupeKey: key,
      actorId: null,
    });
    const again = await engagement.enqueueAnnouncement({
      campaignId: Soon,
      kind: 'PRE_EVENT',
      payload: {},
      dedupeKey: key,
      actorId: null,
    });
    check(
      'xếp một lần; lần hai trùng khoá → false; không còn trong danh sách chờ nhắc',
      queued &&
        !again &&
        (await engagement.listPreEventCandidates({ hours: 48, limit: 10 }))
          .length === 0,
    );
    await projects.replacePhases({
      campaignId: Soon,
      actorId: Owner,
      phases: phases(new Date(soonStart.getTime() + 2 * Hour)),
    });
    check(
      'dời giờ trao → nhắc lại cho mốc mới',
      (await engagement.listPreEventCandidates({ hours: 48, limit: 10 }))
        .length === 1,
    );

    // ── 6. Outbox song song ──────────────────────────────────────────────
    console.log('\n6. Outbox: hai job chạy chồng (§3.10)');
    const pending = (
      await sql(
        `SELECT count(*)::int AS total FROM campaign_announcements WHERE processed_at IS NULL`,
      )
    )[0].total as number;
    const seen: string[] = [];
    const handler = async (announcement: { announcementId: string }) => {
      seen.push(announcement.announcementId);
      await new Promise((resolve) => setTimeout(resolve, 30));
      return 2;
    };
    const [first, second] = await Promise.all([
      engagement.processPendingAnnouncements(50, handler),
      engagement.processPendingAnnouncements(50, handler),
    ]);
    const [{ left, recipients }] = await sql(
      `SELECT count(*) FILTER (WHERE processed_at IS NULL)::int AS left,
              min(recipient_count)::int AS recipients
       FROM campaign_announcements`,
    );
    check(
      'mỗi thông báo xử lý đúng một lần, ghi số người nhận',
      first + second === pending &&
        new Set(seen).size === seen.length &&
        left === 0 &&
        recipients === 2,
      `pending=${pending} first=${first} second=${second} seen=${seen.length}`,
    );

    // ── 7. Bản in ────────────────────────────────────────────────────────
    console.log('\n7. Bản in (§3.13)');
    const [{ last }] = await sql(
      `SELECT global_id AS last FROM campaign_revisions WHERE campaign_id = $1 ORDER BY id DESC LIMIT 1`,
      [Live],
    );
    const created = await engagement.createExport({
      campaignId: Live,
      sectionKey: 'PLAN',
      snapshot: { title: 'x' },
      generatedBy: Owner,
    });
    check(
      'bản in gắn revision cuối; tra theo dự án khác → null',
      created.lastRevisionId === last &&
        (await engagement.findExport(Live, created.exportId))?.snapshot
          .title === 'x' &&
        (await engagement.findExport(Soon, created.exportId)) === null,
    );

    // ── 8. Báo xấu dự án ─────────────────────────────────────────────────
    console.log('\n8. Báo xấu dự án → đình chỉ (§3.8)');
    const reports = new ReportRepository(
      entities.ReportEntity as never,
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
      new AdminConfigRepository(dataSource.manager),
    );
    check(
      'đích hợp lệ: dự án đã duyệt; nháp thì không',
      (await reports.targetExists('CHARITY_CAMPAIGN' as never, Live)) &&
        !(await reports.targetExists('CHARITY_CAMPAIGN' as never, Draft)),
    );
    check(
      'chủ đích là người tạo; màn mở là dự án',
      (await reports.findTargetOwner('CHARITY_CAMPAIGN' as never, Live)) ===
        Owner &&
        (await reports.findContentLocation('CHARITY_CAMPAIGN' as never, Live))
          ?.type === 'CHARITY_CAMPAIGN',
    );
    const report = async (target: string, reporter = Giver) => {
      const [row] = await sql(
        `INSERT INTO reports (global_id, reporter_user_id, target_type, target_id, reason, description)
         VALUES (gen_random_uuid(), $1, 'CHARITY_CAMPAIGN', $2, 'SCAM', 'Dự án có dấu hiệu lừa đảo')
         RETURNING global_id`,
        [reporter, target],
      );
      return row.global_id as string;
    };
    const firstReport = await report(Live);
    const secondReport = await report(Live, Follower);
    const closedReport = await report(Closed);
    for (const reportId of [firstReport, secondReport, closedReport])
      await reports.reviewByAdmin({
        actorUserId: Admin,
        reportId,
        status: 'RESOLVED' as never,
        note: 'Đã xác minh',
      });
    const [live] = await sql(
      `SELECT is_active, end_time > now() AS future FROM campaigns WHERE global_id = $1`,
      [Live],
    );
    const [{ audits }] = await sql(
      `SELECT count(*)::int AS audits FROM admin_audit_logs WHERE action = 'SUSPEND_CHARITY_CAMPAIGN'`,
    );
    const [closed] = await sql(
      `SELECT is_active, end_time < now() AS past FROM campaigns WHERE global_id = $1`,
      [Closed],
    );
    check(
      'kết luận đúng → đình chỉ (giữ end_time), một audit cho hai report; dự án đã đóng không đụng',
      live.is_active === false && live.future && audits === 1 && closed.past,
      `live=${JSON.stringify(live)} audits=${audits}`,
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
  console.log('\nDự án từ thiện đợt 2: mọi phép kiểm đạt');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
