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
      totalIncome: 1_200_000,
      totalExpense: 500_000,
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
      created.balance === 700_000 && created.periodFrom === '2026-10-01',
      JSON.stringify(created),
    );
    const beforeUpdate = await revisions();
    await summaries.updateFinancialReport({
      campaignId: Live,
      reportId: created.reportId,
      actorId: Owner,
      report: { ...report, totalExpense: 600_000 },
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

    // ── 2a. Ba tổng tiếp nhận ─────────────────────────────────────────────
    console.log('\n2a. Ba tổng tiếp nhận');
    const [needPiece] = await sql(
      `INSERT INTO campaign_need_items (campaign_id, item_name, unit, target_quantity, received_quantity)
       VALUES ($1, 'Áo ấm', 'chiếc', 10, 2) RETURNING global_id`,
      [Live],
    );
    await sql(
      `INSERT INTO campaign_need_items (campaign_id, item_name, unit, target_quantity, received_quantity)
       VALUES ($1, 'Gạo', 'kg', 20, 3)`,
      [Live],
    );
    const [contribution] = await sql(
      `INSERT INTO campaign_contributions
         (campaign_id, contributor_id, status, decided_at, decided_by)
       VALUES ($1, $2, 'ACCEPTED', now(), $3) RETURNING global_id`,
      [Live, Shy, Owner],
    );
    const [delivery] = await sql(
      `INSERT INTO campaign_deliveries
         (campaign_id, contribution_id, contributor_id, organizer_id, status, completed_at, completed_by)
       VALUES ($1, $2, $3, $4, 'COMPLETED', now(), $4) RETURNING global_id`,
      [Live, contribution.global_id, Shy, Owner],
    );
    await sql(
      `INSERT INTO campaign_contribution_items (contribution_id, need_item_id, offered_quantity)
       VALUES ($1, $2, 2)`,
      [contribution.global_id, needPiece.global_id],
    );
    await sql(
      `INSERT INTO campaign_delivery_items
         (delivery_id, contribution_item_id, need_item_id, accepted_quantity, received_quantity, confirmed_value)
       SELECT $1, item.global_id, item.need_item_id, 2, 2, 200000
       FROM campaign_contribution_items item WHERE item.contribution_id = $2`,
      [delivery.global_id, contribution.global_id],
    );
    await sql(
      `INSERT INTO campaign_funding_needs (campaign_id, title, target_amount, confirmed_amount, external_amount)
       VALUES ($1, 'Mua áo', 2000000, 1000000, 500000)`,
      [Live],
    );
    const [supportNeed] = await sql(
      `INSERT INTO campaign_other_support_needs
         (campaign_id, support_type, title, unit, target_quantity, external_quantity,
          external_evidence_urls)
       VALUES ($1, 'LABOR', 'Bốc xếp', 'buổi', 10, 1, '["https://cdn.test/external"]')
       RETURNING global_id`,
      [Live],
    );
    await sql(
      `INSERT INTO campaign_other_support_offers (need_id, user_id, quantity, completed_quantity, status)
       VALUES ($1, $2, 2, 2, 'COMPLETED')`,
      [supportNeed.global_id, Walker],
    );
    // Giá trị hiện vật tính theo cả chiến dịch (không còn đợt trao): lượt hoàn tất có giá trị
    // điều chỉnh được cộng, lượt đã huỷ thì bỏ.
    for (const [status, adjusted] of [
      ['COMPLETED', 50000],
      ['CANCELLED', 999999],
    ] as const) {
      const [extra] = await sql(
        `INSERT INTO campaign_contributions
           (campaign_id, contributor_id, status, decided_at, decided_by)
         VALUES ($1, $2, 'ACCEPTED', now(), $3) RETURNING global_id`,
        [Live, Shy, Owner],
      );
      await sql(
        `INSERT INTO campaign_deliveries
           (campaign_id, contribution_id, contributor_id, organizer_id, status,
            completed_at, completed_by, cancelled_at, cancelled_by, cancel_reason,
            confirmed_value_adjusted)
         VALUES ($1, $2, $3, $4, $5::text,
                 CASE WHEN $5::text = 'COMPLETED' THEN now() END,
                 CASE WHEN $5::text = 'COMPLETED' THEN $4::uuid END,
                 CASE WHEN $5::text = 'CANCELLED' THEN now() END,
                 CASE WHEN $5::text = 'CANCELLED' THEN $4::uuid END,
                 CASE WHEN $5::text = 'CANCELLED' THEN 'Huỷ thử' END,
                 $6)`,
        [Live, extra.global_id, Shy, Owner, status, adjusted],
      );
    }
    const totals = await summaries.intakeTotals(Live);
    check(
      'hiện vật nhóm theo đơn vị và giá trị chỉ tính giao nhận hoàn tất trong app',
      totals.material.lines.length === 2 &&
        totals.material.lines.some(
          (line) => line.unit === 'chiếc' && line.receivedQuantity === 2,
        ) &&
        totals.material.lines.some(
          (line) => line.unit === 'kg' && line.receivedQuantity === 3,
        ) &&
        totals.material.confirmedValue === 250000,
      JSON.stringify(totals.material),
    );
    check(
      'tiền xác nhận, ngoài app, tổng và tổng thu báo cáo tách riêng',
      totals.money?.confirmedAmount === 1000000 &&
        totals.money.externalAmount === 500000 &&
        totals.money.totalAmount === 1500000 &&
        totals.money.reportedIncome === 1200000,
      JSON.stringify(totals.money),
    );
    check(
      'dịch vụ gộp hoàn tất trong app và ngoài app theo loại, đơn vị',
      totals.service.lines.length === 1 &&
        totals.service.lines[0].supportType === 'LABOR' &&
        totals.service.lines[0].unit === 'buổi' &&
        totals.service.lines[0].completedQuantity === 3,
      JSON.stringify(totals.service),
    );

    // ── 3. Chấm mức hoàn thành ───────────────────────────────────────────
    console.log('\n3. Chấm mức hoàn thành');
    await sql(
      `INSERT INTO campaign_participations (campaign_id, user_id, status) VALUES ($1, $2, 'REGISTERED')`,
      [Live, Walker],
    );
    const pendingIsCandidate = await summaries.isEvaluationCandidate(
      Live,
      Walker,
    );
    await sql(
      `UPDATE campaign_participations
          SET status = 'CHECKED_IN', checked_in_at = now(), checked_in_by = $3
        WHERE campaign_id = $1 AND user_id = $2`,
      [Live, Walker, Owner],
    );
    check(
      'chỉ participant đã check-in là ứng viên (chốt 05/11); đăng ký chờ duyệt và người ngoài thì không',
      !pendingIsCandidate &&
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
