/**
 * Dự án từ thiện 4 giai đoạn — đợt 4a — trên Postgres THẬT
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.6, §3.14, §3.17).
 *
 * - Tổng kết: upsert; sửa SAU khi công khai mới ghi revision; lần công khai đầu xếp thông báo
 *   một lần (công khai lại không gửi đôi).
 * - Báo cáo tài chính: database giữ kỳ hợp lệ, sao kê không rỗng, số dư tự tính.
 * - Chấm mức hoàn thành: append-only, điểm hiện hành là lần mới nhất; ai được chấm.
 * - Nickname: mặc định theo cài đặt tài khoản, chọn lại từng lần; danh sách công khai chỉ có
 *   người cho phép.
 * - Card Home: chỉ card bật, trong khung giờ, dự án còn chạy; ràng buộc database; audit.
 *
 *   npm run test:charity-summary
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CharitySummaryRepository } from '../src/infrastructure/repository/charity-summary.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_summary_check';
const id = (tail: string) => `7e000000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Admin = id('02');
const Shy = id('03');
const Proud = id('04');
const Walker = id('05');
const Live = id('10');
const Ended = id('11');

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function rejects(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
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
    extra: { max: 8 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);
    const summaries = new CharitySummaryRepository(dataSource.manager);

    for (const [userId, username] of [
      [Owner, 'cs_owner'],
      [Admin, 'cs_admin'],
      [Shy, 'cs_shy'],
      [Proud, 'cs_proud'],
      [Walker, 'cs_walker'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    await sql(
      `UPDATE users SET show_in_public_supporter_lists = true WHERE global_id = $1`,
      [Proud],
    );
    for (const [campaignId, slug, active, endsIn] of [
      [Live, 'cs-live', true, '20 days'],
      [Ended, 'cs-ended', false, '-1 day'],
    ])
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage,
            is_active)
         VALUES ($1, 'Dự án kiểm', $2, 'Mô tả đủ dài cho dự án kiểm', 'https://cdn.test/a.jpg',
                 'Ấm', now() - interval '30 days', now() + $4::interval, $3, 'APPROVED',
                 now(), $3, now(), 'SUMMARY', $5)`,
        [campaignId, slug, Owner, endsIn, active],
      );

    // ── 1. Tổng kết ──────────────────────────────────────────────────────
    console.log('1. Tổng kết');
    const revisions = async () =>
      (
        await sql(
          `SELECT count(*)::int AS total FROM campaign_revisions WHERE campaign_id = $1`,
          [Live],
        )
      )[0].total as number;
    const content = (summary: string) => ({
      summary,
      usageReport: null,
      thanksMessage: 'Cảm ơn mọi người',
      lessonsLearned: null,
      evidenceUrls: [],
    });
    await summaries.saveSummary({
      campaignId: Live,
      actorId: Owner,
      content: content('Bản nháp'),
    });
    await summaries.saveSummary({
      campaignId: Live,
      actorId: Owner,
      content: content('Bản nháp 2'),
    });
    check('sửa nháp không sinh revision', (await revisions()) === 0);
    const published = await summaries.publishSummary({
      campaignId: Live,
      actorId: Owner,
    });
    await summaries.publishSummary({ campaignId: Live, actorId: Owner });
    const [{ announcements }] = await sql(
      `SELECT count(*)::int AS announcements FROM campaign_announcements
       WHERE campaign_id = $1 AND kind = 'SUMMARY_PUBLISHED'`,
      [Live],
    );
    check(
      'công khai hai lần → một thông báo',
      published?.publishedAt !== null && announcements === 1,
      `announcements=${announcements}`,
    );
    await summaries.saveSummary({
      campaignId: Live,
      actorId: Owner,
      content: content('Đã sửa sau khi công khai'),
    });
    const [summaryRevision] = await sql(
      `SELECT entity, field, old_value, new_value FROM campaign_revisions WHERE campaign_id = $1`,
      [Live],
    );
    check(
      'sửa sau khi công khai → revision SUMMARY.summary',
      summaryRevision?.entity === 'SUMMARY' &&
        summaryRevision.field === 'summary' &&
        summaryRevision.old_value === 'Bản nháp 2',
      JSON.stringify(summaryRevision),
    );
    check(
      'publish khi chưa có tổng kết → null',
      (await summaries.publishSummary({
        campaignId: Ended,
        actorId: Owner,
      })) === null,
    );

    // ── 2. Báo cáo tài chính ─────────────────────────────────────────────
    console.log('\n2. Báo cáo tài chính');
    const report = {
      periodFrom: '2026-10-01',
      periodTo: '2026-10-31',
      totalIncome: 15_000_000,
      totalExpense: 12_500_000,
      explanation: 'Mua áo và vận chuyển',
      statementUrls: ['https://cdn.test/sao-ke.png'],
    };
    const created = await summaries.createFinancialReport({
      campaignId: Live,
      actorId: Owner,
      report,
    });
    check(
      'số dư database tính; ngày trả đúng YYYY-MM-DD',
      created.balance === 2_500_000 && created.periodFrom === '2026-10-01',
      JSON.stringify(created),
    );
    const beforeUpdate = await revisions();
    await summaries.updateFinancialReport({
      campaignId: Live,
      reportId: created.reportId,
      actorId: Owner,
      report: { ...report, totalExpense: 13_000_000 },
    });
    const [important] = await sql(
      `SELECT field, is_important FROM campaign_revisions
       WHERE campaign_id = $1 AND entity = 'FINANCIAL_REPORT' AND field = 'totalExpense'`,
      [Live],
    );
    check(
      'tổng kết đã công khai: tạo + sửa báo cáo ghi revision; đổi tổng chi là quan trọng',
      (await revisions()) > beforeUpdate && important?.is_important === true,
    );
    check(
      'database chặn sao kê rỗng, kỳ ngược, diễn giải trống',
      (await rejects(() =>
        summaries.createFinancialReport({
          campaignId: Live,
          actorId: Owner,
          report: { ...report, statementUrls: [] },
        }),
      )) &&
        (await rejects(() =>
          summaries.createFinancialReport({
            campaignId: Live,
            actorId: Owner,
            report: { ...report, periodFrom: '2026-11-30' },
          }),
        )) &&
        (await rejects(() =>
          summaries.createFinancialReport({
            campaignId: Live,
            actorId: Owner,
            report: { ...report, explanation: '   ' },
          }),
        )),
    );
    check(
      'sửa báo cáo của dự án khác → null',
      (await summaries.updateFinancialReport({
        campaignId: Ended,
        reportId: created.reportId,
        actorId: Owner,
        report,
      })) === null,
    );

    // ── 3. Chấm mức hoàn thành ───────────────────────────────────────────
    console.log('\n3. Chấm mức hoàn thành');
    await sql(
      `INSERT INTO campaign_participations (campaign_id, user_id, status) VALUES ($1, $2, 'REGISTERED')`,
      [Live, Walker],
    );
    check(
      'người tham gia là ứng viên; người ngoài thì không',
      (await summaries.isEvaluationCandidate(Live, Walker)) &&
        !(await summaries.isEvaluationCandidate(Live, Shy)),
    );
    await summaries.addEvaluation({
      campaignId: Live,
      participantId: Walker,
      completionScore: 70,
      note: 'Đến muộn',
      evaluatedBy: Owner,
      source: 'ORGANIZER',
    });
    const second = await summaries.addEvaluation({
      campaignId: Live,
      participantId: Walker,
      completionScore: 90,
      note: null,
      evaluatedBy: Owner,
      source: 'ORGANIZER',
    });
    const latest = await summaries.listLatestEvaluations(Live);
    check(
      'chấm lại = dòng mới; danh sách chỉ có lần mới nhất (version 2)',
      second.completionScore === 90 &&
        second.version === 2 &&
        latest.length === 1 &&
        latest[0].completionScore === 90,
    );
    check(
      'append-only; database chặn điểm ngoài 0–100',
      (await rejects(() =>
        sql(
          `UPDATE campaign_participant_evaluations SET completion_score = 10`,
        ),
      )) &&
        (await rejects(() =>
          summaries.addEvaluation({
            campaignId: Live,
            participantId: Walker,
            completionScore: 101,
            note: null,
            evaluatedBy: Owner,
            source: 'ORGANIZER',
          }),
        )),
    );

    // ── 4. Nickname công khai ────────────────────────────────────────────
    console.log('\n4. Nickname công khai');
    const contribute = async (userId: string) => {
      const [row] = await sql(
        `INSERT INTO campaign_contributions (campaign_id, contributor_id, status)
         VALUES ($1, $2, 'PENDING_REVIEW') RETURNING global_id`,
        [Live, userId],
      );
      await sql(
        `UPDATE campaign_contributions SET status = 'ACCEPTED', decided_at = now(), decided_by = $2
         WHERE global_id = $1`,
        [row.global_id, Owner],
      ).catch(() => undefined);
      return row.global_id as string;
    };
    const shyContribution = await contribute(Shy);
    const proudContribution = await contribute(Proud);
    for (const [contributionId, userId] of [
      [shyContribution, Shy],
      [proudContribution, Proud],
    ])
      await summaries.setContributionPublicName({
        campaignId: Live,
        contributionId,
        userId,
        show: null,
      });
    let listed = await summaries.publicSupporters(Live, 200);
    check(
      'mặc định theo cài đặt tài khoản: chỉ người bật hiện tên; con số tổng gồm cả người ẩn',
      listed.supporters.join() === 'cs_proud' && listed.supporterCount === 2,
      JSON.stringify(listed),
    );
    await summaries.setContributionPublicName({
      campaignId: Live,
      contributionId: shyContribution,
      userId: Shy,
      show: true,
    });
    check(
      'chọn lại từng lần',
      (await summaries.publicSupporters(Live, 200)).supporters.join() ===
        'cs_proud,cs_shy',
    );
    check(
      'không phải đóng góp của mình → false',
      !(await summaries.setContributionPublicName({
        campaignId: Live,
        contributionId: shyContribution,
        userId: Proud,
        show: false,
      })),
    );
    await summaries.setParticipationPublicName({
      campaignId: Live,
      userId: Walker,
      show: true,
    });
    listed = await summaries.publicSupporters(Live, 200);
    check(
      'người tham gia cho phép thì hiện',
      listed.participants.join() === 'cs_walker' &&
        listed.participantCount === 1,
    );

    // ── 5. Card Home ─────────────────────────────────────────────────────
    console.log('\n5. Card Home');
    await summaries.requestPromotion({
      campaignId: Live,
      note: 'Cần thêm người',
    });
    const promotion = (featuredOnHome: boolean, extra = {}) => ({
      featuredOnHome,
      featuredTitle: featuredOnHome ? 'Áo ấm cho em' : null,
      featuredMessage: null,
      featuredMediaUrl: null,
      featuredCta: featuredOnHome ? ('SUPPORT' as const) : null,
      featuredFrom: null,
      featuredUntil: null,
      featuredPriority: 1,
      ...extra,
    });
    const on = await summaries.setPromotion({
      campaignId: Live,
      actorId: Admin,
      reason: 'Ưu tiên tuần này',
      promotion: promotion(true),
    });
    check(
      'bật → đề xuất coi như đã xử lý; card hiện, ảnh mặc định là ảnh bìa',
      on?.featuredOnHome === true &&
        on.promotionRequestedAt === null &&
        (await summaries.listHomeCards(5))[0]?.mediaUrl ===
          'https://cdn.test/a.jpg',
    );
    await summaries.setPromotion({
      campaignId: Live,
      actorId: Admin,
      reason: 'Hết khung',
      promotion: promotion(true, {
        featuredUntil: new Date(Date.now() - 60_000),
        featuredFrom: new Date(Date.now() - 120_000),
      }),
    });
    await summaries.setPromotion({
      campaignId: Ended,
      actorId: Admin,
      reason: 'Thử dự án đã đóng',
      promotion: promotion(true),
    });
    const [{ audits }] = await sql(
      `SELECT count(*)::int AS audits FROM admin_audit_logs WHERE action = 'CHARITY_CAMPAIGN_PROMOTION'`,
    );
    check(
      'hết khung giờ / dự án đã đóng → không có card; mỗi lần đổi một audit',
      (await summaries.listHomeCards(5)).length === 0 && audits === 3,
      `audits=${audits}`,
    );
    check(
      'database chặn bật mà thiếu tiêu đề/CTA',
      await rejects(() =>
        sql(
          `UPDATE campaigns SET featured_on_home = true, featured_title = NULL WHERE global_id = $1`,
          [Live],
        ),
      ),
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
  console.log('\nDự án từ thiện đợt 4a: mọi phép kiểm đạt');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
