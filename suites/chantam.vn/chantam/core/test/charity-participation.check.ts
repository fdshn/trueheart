/**
 * Dự án từ thiện — đợt 5a, vòng đời participant (chốt 05/11) — trên Postgres THẬT
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.4, §3.5, §3.11).
 *
 * - Đổi trạng thái có điều kiện: hai người bấm cùng lúc thì một người thắng; check-in ghi mốc.
 * - Database chặn trạng thái lạ, CHECKED_IN thiếu mốc, CANCELLED thiếu `cancelled_at`.
 * - Đăng ký lại chỉ hồi lượt đã huỷ (xoá dấu check-in cũ); bị từ chối thì không tự đăng ký lại.
 * - Huỷ được cả khi đã check-in; đã hoàn thành thì không.
 * - Số người tham gia đếm lượt còn hiệu lực; danh sách công khai chỉ người đã được nhận.
 * - Nhắc 48 giờ: người tạo, coordinator, participant đã duyệt — không gồm chờ duyệt, người quan
 *   tâm, người đóng góp.
 * - Danh sách cho ban tổ chức kèm vị trí tuyển người đang nhận.
 *
 *   npm run test:charity-participation
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { CharityEngagementRepository } from '../src/infrastructure/repository/charity-engagement.repository';
import { CharityParticipationRepository } from '../src/infrastructure/repository/charity-participation.repository';
import { CharitySummaryRepository } from '../src/infrastructure/repository/charity-summary.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_participation_check';
const id = (tail: string) => `7e000000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Coordinator = id('02');
const Pending = id('03');
const Confirmed = id('04');
const Attendee = id('05');
const Rejected = id('06');
const Follower = id('07');
const Giver = id('08');
const Live = id('10');

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function rejects(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch {
    return true;
  }
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
    const ledger = new PointLedgerRepository(dataSource.manager);
    const campaigns = new CharityCampaignRepository(dataSource.manager, ledger);
    const engagement = new CharityEngagementRepository(dataSource.manager);
    const summaries = new CharitySummaryRepository(dataSource.manager);
    const participations = new CharityParticipationRepository(
      dataSource.manager,
    );

    for (const [userId, username] of [
      [Owner, 'cpa_owner'],
      [Coordinator, 'cpa_coord'],
      [Pending, 'cpa_pending'],
      [Confirmed, 'cpa_confirmed'],
      [Attendee, 'cpa_attendee'],
      [Rejected, 'cpa_rejected'],
      [Follower, 'cpa_follower'],
      [Giver, 'cpa_giver'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    await sql(
      `INSERT INTO campaigns
         (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
          created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage)
       VALUES ($1, 'Dự án kiểm', 'cpa-live', 'Mô tả đủ dài cho dự án kiểm',
               'https://cdn.test/a.jpg', 'Ấm', now() + interval '2 days',
               now() + interval '20 days', $2, 'APPROVED', now(), $2, now(), 'EXECUTION')`,
      [Live, Owner],
    );
    await sql(
      `INSERT INTO campaign_coordinators (campaign_id, user_id, granted_by) VALUES ($1, $2, $3)`,
      [Live, Coordinator, Owner],
    );
    await sql(
      `INSERT INTO campaign_follows (campaign_id, user_id) VALUES ($1, $2)`,
      [Live, Follower],
    );
    await sql(
      `INSERT INTO campaign_contributions (campaign_id, contributor_id, status)
       VALUES ($1, $2, 'PENDING_REVIEW')`,
      [Live, Giver],
    );
    for (const userId of [Pending, Confirmed, Attendee, Rejected])
      await campaigns.register({ campaignId: Live, userId });
    const idOf = async (userId: string) =>
      (await participations.findByUser(Live, userId))?.participationId ?? '';

    // ── 1. Đổi trạng thái có điều kiện ────────────────────────────────────
    console.log('1. Duyệt, check-in');
    const confirmedId = await idOf(Confirmed);
    const [first, second] = await Promise.all(
      [0, 1].map(() =>
        participations.transition({
          campaignId: Live,
          participationId: confirmedId,
          from: ['REGISTERED', 'WAITLISTED'],
          to: 'CONFIRMED',
          actorId: Owner,
          reason: null,
          checkIn: false,
        }),
      ),
    );
    check(
      'hai lượt duyệt song song: một thắng, một nhận null',
      [first, second].filter((row) => row?.status === 'CONFIRMED').length ===
        1 && [first, second].includes(null),
    );
    const attendeeId = await idOf(Attendee);
    await participations.transition({
      campaignId: Live,
      participationId: attendeeId,
      from: ['REGISTERED'],
      to: 'CONFIRMED',
      actorId: Owner,
      reason: null,
      checkIn: false,
    });
    const checkedIn = await participations.transition({
      campaignId: Live,
      participationId: attendeeId,
      from: ['CONFIRMED'],
      to: 'CHECKED_IN',
      actorId: Coordinator,
      reason: null,
      checkIn: true,
    });
    check(
      'check-in ghi mốc và người check-in',
      checkedIn?.status === 'CHECKED_IN' &&
        checkedIn.checkedInAt !== null &&
        checkedIn.checkedInBy === Coordinator &&
        checkedIn.statusChangedBy === Coordinator,
      JSON.stringify(checkedIn),
    );
    const rejected = await participations.transition({
      campaignId: Live,
      participationId: await idOf(Rejected),
      from: ['REGISTERED'],
      to: 'REJECTED',
      actorId: Owner,
      reason: 'Đủ người',
      checkIn: false,
    });
    check(
      'từ chối giữ lý do',
      rejected?.status === 'REJECTED' && rejected.statusReason === 'Đủ người',
    );
    check(
      'dự án khác / id lạ → null',
      (await participations.find(id('99'), attendeeId)) === null &&
        (await participations.transition({
          campaignId: id('99'),
          participationId: attendeeId,
          from: ['CHECKED_IN'],
          to: 'COMPLETED',
          actorId: Owner,
          reason: null,
          checkIn: false,
        })) === null,
    );

    // ── 2. Ràng buộc ──────────────────────────────────────────────────────
    console.log('\n2. Ràng buộc database');
    check(
      'chặn trạng thái lạ, CHECKED_IN thiếu mốc, CANCELLED thiếu cancelled_at',
      (await rejects(() =>
        sql(
          `UPDATE campaign_participations SET status = 'ATTENDED' WHERE user_id = $1`,
          [Pending],
        ),
      )) &&
        (await rejects(() =>
          sql(
            `UPDATE campaign_participations SET status = 'CHECKED_IN' WHERE user_id = $1`,
            [Pending],
          ),
        )) &&
        (await rejects(() =>
          sql(
            `UPDATE campaign_participations SET status = 'CANCELLED' WHERE user_id = $1`,
            [Pending],
          ),
        )),
    );

    // ── 3. Đăng ký lại, huỷ ───────────────────────────────────────────────
    console.log('\n3. Đăng ký lại, huỷ');
    const rejectedAgain = await campaigns.register({
      campaignId: Live,
      userId: Rejected,
    });
    check(
      'bị từ chối thì không tự đăng ký lại được (created: false)',
      rejectedAgain.created === false &&
        (await participations.findByUser(Live, Rejected))?.status ===
          'REJECTED',
    );
    const cancelledAttendee = await campaigns.cancelParticipation({
      campaignId: Live,
      userId: Attendee,
    });
    const reRegistered = await campaigns.register({
      campaignId: Live,
      userId: Attendee,
    });
    const afterReRegister = await participations.findByUser(Live, Attendee);
    check(
      'huỷ được khi đã check-in; đăng ký lại → chờ duyệt, xoá dấu check-in cũ',
      cancelledAttendee &&
        reRegistered.created &&
        afterReRegister?.status === 'REGISTERED' &&
        afterReRegister.checkedInAt === null &&
        afterReRegister.cancelledAt === null,
      JSON.stringify(afterReRegister),
    );
    await sql(
      `UPDATE campaign_participations
          SET status = 'COMPLETED', checked_in_at = now(), checked_in_by = $2
        WHERE campaign_id = $1 AND user_id = $3`,
      [Live, Owner, Attendee],
    );
    check(
      'đã hoàn thành thì không huỷ được',
      !(await campaigns.cancelParticipation({
        campaignId: Live,
        userId: Attendee,
      })),
    );

    // ── 4. Đếm và danh sách ───────────────────────────────────────────────
    console.log('\n4. Đếm, danh sách công khai, nhắc 48 giờ');
    const campaign = await campaigns.findByGlobalId(Live);
    check(
      'số người tham gia: chờ duyệt + đã xác nhận + đã hoàn thành = 3 (bỏ bị từ chối)',
      campaign?.participantCount === 3,
      `count=${campaign?.participantCount}`,
    );
    await sql(
      `UPDATE campaign_participations SET show_name_publicly = true WHERE campaign_id = $1`,
      [Live],
    );
    const supporters = await summaries.publicSupporters(Live, 10);
    check(
      'danh sách công khai chỉ người đã được nhận (xác nhận / hoàn thành)',
      supporters.participantCount === 2 &&
        JSON.stringify(supporters.participants) ===
          JSON.stringify(['cpa_attendee', 'cpa_confirmed']),
      JSON.stringify(supporters),
    );
    const preEvent = await engagement.listAudience({
      campaignId: Live,
      excludeUserId: Owner,
      scope: 'PRE_EVENT',
    });
    check(
      'nhắc 48 giờ: người tạo, coordinator, participant đã xác nhận — không chờ duyệt / người quan tâm / người đóng góp',
      JSON.stringify(preEvent) ===
        JSON.stringify([Owner, Coordinator, Confirmed].sort()),
      JSON.stringify(preEvent),
    );
    const general = await engagement.listAudience({
      campaignId: Live,
      excludeUserId: Owner,
    });
    check(
      'thông báo chung: người tham gia còn hiệu lực + người quan tâm (bỏ bị từ chối)',
      JSON.stringify(general) ===
        JSON.stringify([Pending, Confirmed, Attendee, Follower].sort()),
      JSON.stringify(general),
    );

    // ── 5. Danh sách cho ban tổ chức ──────────────────────────────────────
    console.log('\n5. Danh sách cho ban tổ chức');
    const [{ need }] = await sql(
      `INSERT INTO campaign_volunteer_needs (campaign_id, title, needed_count, updated_by)
       VALUES ($1, 'Bốc xếp', 3, $2) RETURNING global_id AS need`,
      [Live, Owner],
    );
    await sql(
      `INSERT INTO campaign_volunteer_registrations (volunteer_need_id, user_id) VALUES ($1, $2)`,
      [need, Confirmed],
    );
    const all = await participations.list({ campaignId: Live, status: null });
    const onlyRejected = await participations.list({
      campaignId: Live,
      status: 'REJECTED',
    });
    const confirmedRow = all.find((row) => row.user.userId === Confirmed);
    check(
      'đủ 4 lượt; lọc theo trạng thái; kèm vị trí đang nhận',
      all.length === 4 &&
        onlyRejected.length === 1 &&
        confirmedRow?.positions.length === 1 &&
        confirmedRow.positions[0].title === 'Bốc xếp',
      JSON.stringify(confirmedRow?.positions),
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
  console.log('\nDự án từ thiện đợt 5a: mọi phép kiểm đạt');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
