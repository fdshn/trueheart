/**
 * Dự án từ thiện 4 giai đoạn — đợt 1 — trên Postgres THẬT
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.1, §3.2, §3.11, §3.12).
 *
 * - Migration chép người thụ hưởng cũ sang `campaign_parties` rồi xoá bảng; down/up giữ dữ liệu.
 * - Nháp: không duyệt được, không vào hàng đợi; gửi duyệt song song chỉ một lượt thắng.
 * - Duyệt → EXECUTION + nhật ký; đổi giai đoạn có điều kiện (STALE khi người khác vừa đổi).
 * - Job chuyển giai đoạn chỉ nhặt dự án đã tới mốc.
 * - Đơn vị liên quan giữ id, không bao giờ chạm người thụ hưởng cá nhân.
 * - Tài khoản nhận: giới hạn đúng cả khi thêm song song; thay = đóng + tạo trong một lượt.
 * - Hiện vật tách số nhận trong app / ngoài app; tiền; nhân lực (điều kiện, suất cuối song song).
 * - Công khai mục: bản chụp; form mở; ràng buộc database.
 * - Tài khoản thụ hưởng: thay chỉ dòng còn hiệu lực của đúng dự án; xác thực idempotent, không
 *   chạm dòng đã đóng / dự án khác; OWNER so tên với `users.full_name` (NULL → lệch tên).
 *
 *   npm run test:charity-project
 */
import { charityDistributionSettled } from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { GetCharityPublicStatsUseCase } from '../src/application/implementations/charity-project/charity-engagement.use-cases';
import {
  AddCharityBeneficiaryBankAccountUseCase,
  AdvanceCharityStagesUseCase,
  CharityProjectAccess,
  ReplaceCharityPartiesUseCase,
} from '../src/application/implementations/charity-project/charity-project.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { CampaignDistributionSettledSql } from '../src/infrastructure/repository/charity-distribution.sql';
import { CharityEngagementRepository } from '../src/infrastructure/repository/charity-engagement.repository';
import { CharityProjectRepository } from '../src/infrastructure/repository/charity-project.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_project_check';
const id = (tail: string) => `7b000000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Admin = id('02');
const Giver = id('03');
const Other = id('04');
const Racer1 = id('05');
const Racer2 = id('06');
const Verifier = id('07');
const LegacyCampaign = id('10');
const Draft = id('11');
const Live = id('12');
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
    for (const [userId, username] of [
      [Owner, 'cp_owner'],
      [Admin, 'cp_admin'],
      [Giver, 'cp_giver'],
      [Other, 'cp_other'],
      [Racer1, 'cp_racer1'],
      [Racer2, 'cp_racer2'],
      [Verifier, 'cp_verifier'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    const insertCampaign = (
      campaignId: string,
      slug: string,
      approval: string,
      submitted: boolean,
      stage: string,
      type = 'ORGANIZED_CAMPAIGN',
      relation: string | null = null,
    ) =>
      sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage,
            campaign_type, beneficiary_relation)
         VALUES ($1, 'Dự án kiểm', $2, 'Mô tả đủ dài cho dự án kiểm', 'https://cdn.test/a.jpg',
                 'Ấm', now() - interval '1 hour', now() + interval '30 days', $3, $4,
                 CASE WHEN $5 = 'PENDING_APPROVAL' THEN NULL ELSE now() END,
                 CASE WHEN $5 = 'PENDING_APPROVAL' THEN NULL ELSE $3::uuid END,
                 CASE WHEN $6 THEN now() END, $7, $8, $9)`,
        [
          campaignId,
          slug,
          Owner,
          approval,
          approval,
          submitted,
          stage,
          type,
          relation,
        ],
      );

    console.log('0. Migration gộp người thụ hưởng');
    // Lùi tới TRƯỚC migration đợt 1 — các migration sau nó (đợt 2…) lùi theo, rồi chạy lại cả.
    for (;;) {
      const [last] = await sql(
        `SELECT name FROM migrations ORDER BY id DESC LIMIT 1`,
      );
      await dataSource.undoLastMigration();
      if (last.name === 'CharityProjectProfile1802400000000') break;
    }
    await sql(
      `INSERT INTO campaigns
         (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
          created_by, approval_status, approved_at, approved_by, campaign_type, beneficiary_relation)
       VALUES ($1, 'Kêu gọi cũ', 'keu-goi-cu', 'Mô tả đủ dài cho kêu gọi cũ', 'https://cdn.test/a.jpg',
               'Ấm', now() - interval '40 days', now() - interval '1 day', $2, 'APPROVED', now(), $2,
               'INDIVIDUAL_APPEAL', 'OTHER')`,
      [LegacyCampaign, Owner],
    );
    await sql(
      `INSERT INTO campaign_beneficiaries
         (campaign_id, full_name, relation_note, phone, consent_status, updated_by)
       VALUES ($1, 'Bà Ba', 'Hàng xóm', '0912', 'CONFIRMED', $2)`,
      [LegacyCampaign, Owner],
    );
    await dataSource.runMigrations();
    const [moved] = await sql(
      `SELECT name, relation_note, consent_status, role, beneficiary_kind, is_appeal_subject
       FROM campaign_parties WHERE campaign_id = $1`,
      [LegacyCampaign],
    );
    const [legacy] = await sql(
      `SELECT submitted_at IS NOT NULL AS submitted, operation_stage FROM campaigns WHERE global_id = $1`,
      [LegacyCampaign],
    );
    const [{ gone }] = await sql(
      `SELECT to_regclass('public.campaign_beneficiaries') IS NULL AS gone`,
    );
    check(
      'người thụ hưởng cũ chép sang campaign_parties (is_appeal_subject), bảng cũ đã xoá',
      moved?.name === 'Bà Ba' &&
        moved.is_appeal_subject &&
        moved.consent_status === 'CONFIRMED' &&
        moved.beneficiary_kind === 'INDIVIDUAL' &&
        gone,
      JSON.stringify(moved),
    );
    check(
      'dự án cũ: submitted_at = created_at, đã qua end_time → SUMMARY',
      legacy.submitted && legacy.operation_stage === 'SUMMARY',
      JSON.stringify(legacy),
    );

    const ledger = new PointLedgerRepository(dataSource.manager);
    const campaigns = new CharityCampaignRepository(dataSource.manager, ledger);
    const projects = new CharityProjectRepository(dataSource.manager);
    const readBack = await campaigns.findBeneficiary(LegacyCampaign);
    check(
      'findBeneficiary đọc từ campaign_parties',
      readBack?.fullName === 'Bà Ba',
    );

    console.log(
      '\n0b. Migration 1804100000000: đơn vị nhận, suất, điểm tiếp nhận',
    );
    for (;;) {
      const [last] = await sql(
        `SELECT name FROM migrations ORDER BY id DESC LIMIT 1`,
      );
      await dataSource.undoLastMigration();
      if (last.name === 'CharityBeneficiaryPlanAndSchedule1804100000000') break;
    }
    const IntakePrep = id('30');
    const IntakeDist = id('31');
    const IntakeNone = id('32');
    for (const [campaignId, slug, label] of [
      [IntakePrep, 'intake-prep', 'Chùa Bửu Long'],
      [IntakeDist, 'intake-dist', null],
      [IntakeNone, 'intake-none', null],
    ] as const)
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, location_label, location)
         VALUES ($1, 'Lịch cũ', $2, 'Mô tả đủ dài cho lịch cũ', 'https://cdn.test/a.jpg', 'Ấm',
                 '2026-12-01T00:00:00Z', '2026-12-31T00:00:00Z', $3, $4::text,
                 CASE WHEN $4::text IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint(106.7, 10.8), 4326)::geography END)`,
        [campaignId, slug, Owner, label],
      );
    await sql(
      `INSERT INTO campaign_phases (campaign_id, phase, starts_at, ends_at) VALUES
         ($1, 'PREPARATION', '2026-12-02T00:00:00Z', '2026-12-10T00:00:00Z'),
         ($1, 'DISTRIBUTION', '2026-12-12T00:00:00Z', '2026-12-13T00:00:00Z'),
         ($2, 'DISTRIBUTION', '2026-12-14T00:00:00Z', '2026-12-15T00:00:00Z')`,
      [IntakePrep, IntakeDist],
    );
    await dataSource.runMigrations();
    const intakeRows = await sql(
      `SELECT global_id, intake_ends_at FROM campaigns
        WHERE global_id = ANY($1::uuid[])`,
      [[IntakePrep, IntakeDist, IntakeNone]],
    );
    const intakeEnd = (campaignId: string) =>
      new Date(
        intakeRows.find(
          (row: { global_id: string }) => row.global_id === campaignId,
        ).intake_ends_at,
      ).toISOString();
    check(
      'intake_ends_at: PREPARATION.ends_at → DISTRIBUTION.starts_at → end_time',
      intakeEnd(IntakePrep) === '2026-12-10T00:00:00.000Z' &&
        intakeEnd(IntakeDist) === '2026-12-14T00:00:00.000Z' &&
        intakeEnd(IntakeNone) === '2026-12-31T00:00:00.000Z',
      JSON.stringify(intakeRows),
    );
    const intakeLocations = await sql(
      `SELECT campaign_id, position, label,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM campaign_intake_locations
        WHERE campaign_id = ANY($1::uuid[])`,
      [[IntakePrep, IntakeDist, IntakeNone]],
    );
    check(
      'location_label cũ thành điểm tiếp nhận position 0, cùng toạ độ; dự án không có địa điểm thì không có điểm',
      intakeLocations.length === 1 &&
        intakeLocations[0].campaign_id === IntakePrep &&
        intakeLocations[0].position === 0 &&
        intakeLocations[0].label === 'Chùa Bửu Long' &&
        Math.abs(intakeLocations[0].lat - 10.8) < 1e-6 &&
        Math.abs(intakeLocations[0].lng - 106.7) < 1e-6,
      JSON.stringify(intakeLocations),
    );
    const rejected = async (query: string, params: unknown[]) => {
      try {
        await sql(query, params);
        return false;
      } catch (error) {
        return String((error as { code?: string }).code) === '23514';
      }
    };
    check(
      'quantity_per_portion = 0 bị chặn; estimated_portions = -1 bị chặn',
      (await rejected(
        `INSERT INTO campaign_need_items (campaign_id, item_name, unit, target_quantity, quantity_per_portion)
         VALUES ($1, 'Gạo', 'kg', 10, 0)`,
        [IntakePrep],
      )) &&
        (await rejected(
          `INSERT INTO campaign_parties (campaign_id, role, name, estimated_portions)
           VALUES ($1, 'BENEFICIARY', 'Xã A', -1)`,
          [IntakePrep],
        )),
    );
    const [configs] = await sql(
      `SELECT count(*)::int AS total FROM system_configs
        WHERE config_key IN ('charity.max_beneficiaries_per_campaign',
                             'charity.max_intake_locations')`,
    );
    check('hai khoá cấu hình mới đã gieo', configs.total === 2);

    console.log('\n1. Nháp và gửi duyệt');
    await insertCampaign(Draft, 'nhap', 'PENDING_APPROVAL', false, 'PLAN');
    const decidedDraft = await campaigns.decideApproval({
      campaignId: Draft,
      approverId: Admin,
      approve: true,
      note: null,
    });
    const pending = await campaigns.listForAdmin({
      limit: 50,
      offset: 0,
      approvalStatus: 'PENDING_APPROVAL',
    });
    check(
      'nháp: Admin không duyệt được, không có trong hàng đợi chờ duyệt',
      decidedDraft === null &&
        !pending.items.some((item) => item.globalId === Draft),
    );
    const submits = await Promise.all([
      projects.submitDraft({
        campaignId: Draft,
        actorId: Owner,
        approvalStatus: 'PENDING_APPROVAL',
      }),
      projects.submitDraft({
        campaignId: Draft,
        actorId: Owner,
        approvalStatus: 'PENDING_APPROVAL',
      }),
    ]);
    check(
      'gửi duyệt song song: đúng một SUBMITTED',
      submits.filter((s) => s === 'SUBMITTED').length === 1 &&
        submits.includes('NOT_DRAFT'),
      submits.join(','),
    );
    const approved = await campaigns.decideApproval({
      campaignId: Draft,
      approverId: Admin,
      approve: true,
      note: null,
    });
    const events = await projects.listStageEvents(Draft);
    check(
      'duyệt → EXECUTION, có nhật ký PLAN→EXECUTION',
      approved?.operationStage === 'EXECUTION' &&
        events.length === 1 &&
        events[0].fromStage === 'PLAN' &&
        events[0].toStage === 'EXECUTION',
      JSON.stringify(events),
    );

    console.log('\n2. Giai đoạn');
    const stale = await projects.moveStage({
      campaignId: Draft,
      from: 'EVENT',
      to: 'SUMMARY',
      actorId: Owner,
      reason: null,
    });
    const movedStage = await projects.moveStage({
      campaignId: Draft,
      from: 'EXECUTION',
      to: 'EVENT',
      actorId: Owner,
      reason: null,
    });
    check(
      'đổi giai đoạn có điều kiện: sai from → STALE, đúng → MOVED',
      stale === 'STALE' && movedStage === 'MOVED',
    );
    await projects.moveStage({
      campaignId: Draft,
      from: 'EVENT',
      to: 'EXECUTION',
      actorId: Owner,
      reason: 'Hoãn',
    });

    await insertCampaign(Live, 'dang-chay', 'APPROVED', true, 'EXECUTION');
    await projects.replacePhases({
      campaignId: Live,
      actorId: Owner,
      phases: [
        {
          phase: 'PLANNING',
          startsAt: new Date(Date.now() - 10 * Hour),
          endsAt: new Date(Date.now() - 5 * Hour),
          picName: null,
          picUserId: null,
          hotline: null,
          deliveryMethod: null,
          reportMode: null,
        },
        {
          phase: 'DISTRIBUTION',
          startsAt: new Date(Date.now() - Hour),
          endsAt: new Date(Date.now() + 5 * Hour),
          picName: null,
          picUserId: null,
          hotline: '1900',
          deliveryMethod: 'ON_SITE',
          reportMode: null,
        },
      ],
    });
    const heldLive = await campaigns.findByGlobalId(Live);
    const heldCandidates = await projects.listStageCandidates(50);
    const heldBlocked = await projects.listBlockedStageCampaigns(50);
    check(
      'tới giờ trao nhưng tổng duyệt chưa READY: đọc ra vẫn EXECUTION, job không nhặt, vào danh sách nhắc',
      heldLive?.operationStage === 'EXECUTION' &&
        !heldCandidates.some((c) => c.campaignId === Live) &&
        heldBlocked.some(
          (row) =>
            row.campaignId === Live &&
            row.ownerId === Owner &&
            row.reason === 'REHEARSAL_NOT_READY',
        ),
      `${heldLive?.operationStage} ${JSON.stringify(heldBlocked)}`,
    );
    await projects.saveRehearsal({
      campaignId: Live,
      actorId: Owner,
      checklist: [],
      outcome: 'READY',
      reason: null,
      note: null,
    });
    const live = await campaigns.findByGlobalId(Live);
    const candidates = await projects.listStageCandidates(50);
    check(
      'tổng duyệt READY + tới giờ trao: đọc ra EVENT dù cột vẫn EXECUTION; job nhặt dự án này',
      live?.operationStage === 'EVENT' &&
        live.storedOperationStage === 'EXECUTION' &&
        candidates.some((c) => c.campaignId === Live) &&
        !candidates.some((c) => c.campaignId === Draft),
      `${live?.operationStage}/${live?.storedOperationStage}`,
    );
    let appendOnly = '';
    try {
      await sql(`DELETE FROM campaign_stage_events WHERE campaign_id = $1`, [
        Draft,
      ]);
    } catch (error) {
      appendOnly = String((error as Error).message);
    }
    check('nhật ký giai đoạn chỉ ghi thêm', appendOnly.includes('append-only'));

    console.log('\n3. Đơn vị liên quan');
    await campaigns.upsertBeneficiary({
      campaignId: Live,
      actorUserId: Owner,
      beneficiary: {
        fullName: 'Ông Tư',
        relationNote: 'Hàng xóm',
        phone: null,
        address: null,
        consentStatus: 'CONFIRMED',
        verificationNote: null,
      },
    });
    const first = await projects.replaceParties({
      campaignId: Live,
      actorId: Owner,
      parties: [
        {
          role: 'ORGANIZER',
          name: 'CLB A',
          address: null,
          phone: null,
          email: null,
          hotline: null,
          picName: null,
          picPhone: null,
          picUserId: null,
          beneficiaryKind: null,
          evidenceUrls: [],
        },
        {
          role: 'BENEFICIARY',
          name: 'Bản Hoa',
          address: null,
          phone: null,
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
    const organizer = first.find((p) => p.role === 'ORGANIZER')!;
    const second = await projects.replaceParties({
      campaignId: Live,
      actorId: Owner,
      parties: [
        { ...organizer, partyId: organizer.partyId, name: 'CLB A (đổi tên)' },
      ],
    });
    check(
      'thay danh sách: giữ id dòng cũ, xoá dòng không gửi, KHÔNG chạm người thụ hưởng cá nhân',
      second.length === 2 &&
        second.some(
          (p) =>
            p.partyId === organizer.partyId && p.name === 'CLB A (đổi tên)',
        ) &&
        second.some((p) => p.isAppealSubject && p.name === 'Ông Tư') &&
        !second.some((p) => p.name === 'Bản Hoa'),
      JSON.stringify(second.map((p) => p.name)),
    );

    await sql(
      `INSERT INTO campaign_parties (campaign_id, role, name, beneficiary_kind,
                                     estimated_portions, estimated_amount)
       VALUES ($1, 'BENEFICIARY', 'Xã A', 'GROUP', 200, 3000000),
              ($1, 'BENEFICIARY', 'Xã B', 'GROUP', 100, 1000000),
              ($1, 'ORGANIZER', 'UBND', NULL, 999, 999)`,
      [IntakePrep],
    );
    const planned = await campaigns.findByGlobalId(IntakePrep);
    check(
      'findByGlobalId: totalEstimatedPortions/Amount = tổng các đơn vị BENEFICIARY; có intakeLocations, intakeEndsAt',
      planned?.totalEstimatedPortions === 300 &&
        planned.totalEstimatedAmount === 4000000 &&
        planned.intakeLocations.length === 1 &&
        planned.intakeLocations[0].label === 'Chùa Bửu Long' &&
        planned.intakeEndsAt?.toISOString() === '2026-12-10T00:00:00.000Z' &&
        planned.intakeStartsAt.getTime() === planned.startTime.getTime(),
      JSON.stringify({
        portions: planned?.totalEstimatedPortions,
        amount: planned?.totalEstimatedAmount,
        locations: planned?.intakeLocations,
      }),
    );

    console.log('\n4. Tài khoản nhận');
    const adds = await Promise.all(
      ['0001', '0002', '0003'].map((no) =>
        projects.addBankAccount({
          campaignId: Live,
          actorId: Owner,
          account: {
            label: null,
            bankName: 'VCB',
            accountNo: `10${no}`,
            accountName: 'CLB A',
          },
          replacesAccountId: null,
          replaceReason: null,
          limit: 2,
        }),
      ),
    );
    check(
      'giới hạn 2, thêm song song 3: đúng 2 tạo, 1 LIMIT_REACHED',
      adds.filter((a) => a.status === 'CREATED').length === 2 &&
        adds.filter((a) => a.status === 'LIMIT_REACHED').length === 1,
      adds.map((a) => a.status).join(','),
    );
    const createdAccount = adds.find((a) => a.status === 'CREATED') as {
      account: { accountId: string };
    };
    const replaced = await projects.addBankAccount({
      campaignId: Live,
      actorId: Owner,
      account: {
        label: 'Mới',
        bankName: 'BIDV',
        accountNo: '20001',
        accountName: 'CLB A',
      },
      replacesAccountId: createdAccount.account.accountId,
      replaceReason: 'Đổi ngân hàng',
      limit: 2,
    });
    const accounts = await projects.listBankAccounts(Live);
    check(
      'thay tài khoản khi đã đủ suất: đóng cũ + tạo mới trong một lượt, lịch sử còn',
      replaced.status === 'CREATED' &&
        accounts.length === 3 &&
        accounts.filter((a) => a.validTo === null).length === 2 &&
        accounts.some(
          (a) =>
            a.accountId === createdAccount.account.accountId &&
            a.closeReason === 'Đổi ngân hàng',
        ),
    );

    console.log('\n4b. Đếm điều kiện gửi duyệt');
    await sql(
      `INSERT INTO campaign_need_items (global_id, campaign_id, item_name, unit, target_quantity)
       VALUES ($1, $2, 'Nhu cầu đã tắt', 'cái', 1)`,
      [id('29'), Draft],
    );
    await sql(
      `UPDATE campaign_need_items SET is_active = false WHERE global_id = $1`,
      [id('29')],
    );
    const inactiveCounts = await projects.intakeCounts(Draft);
    check(
      'nhu cầu hiện vật không active không tính khi gửi duyệt',
      inactiveCounts.openMaterialNeeds === 0,
      JSON.stringify(inactiveCounts),
    );
    await sql(
      `UPDATE campaign_need_items
       SET is_active = true, intake_status = 'CLOSED' WHERE global_id = $1`,
      [id('29')],
    );
    const closedCounts = await projects.intakeCounts(Draft);
    check(
      'nhu cầu hiện vật CLOSED không tính khi gửi duyệt',
      closedCounts.openMaterialNeeds === 0,
      JSON.stringify(closedCounts),
    );
    await sql(
      `INSERT INTO campaign_bank_accounts
         (campaign_id, bank_name, account_no, account_name, created_by, valid_to, close_reason, closed_by)
       VALUES ($1, 'VCB', '0001', 'Dự án kiểm', $2, now(), 'Kiểm thử tài khoản đã đóng', $2)`,
      [Draft, Owner],
    );
    const closedBankCounts = await projects.intakeCounts(Draft);
    check(
      'tài khoản đã đóng không tính khi gửi duyệt',
      closedBankCounts.liveBankAccounts === 0,
      JSON.stringify(closedBankCounts),
    );

    console.log('\n5. Ba nhóm nhu cầu');
    await sql(
      `INSERT INTO campaign_need_items (global_id, campaign_id, item_name, unit, target_quantity, accepted_quantity, received_quantity)
       VALUES ($1, $2, 'Áo ấm', 'cái', 100, 30, 25)`,
      [id('30'), Live],
    );
    await sql(
      `INSERT INTO campaign_external_contributions (campaign_id, need_item_id, quantity, source_label, received_at, recorded_by)
       VALUES ($1, $2, 10, 'Chùa X', now(), $3)`,
      [Live, id('30'), Owner],
    );
    const [item] = await projects.listItemNeeds(Live);
    check(
      'hiện vật tách nhận trong app (15) / ngoài app (10)',
      item.receivedInAppQuantity === 15 &&
        item.receivedExternalQuantity === 10 &&
        item.approvedQuantity === 30,
      JSON.stringify(item),
    );
    const updatedItem = await projects.updateItemNeedProfile({
      campaignId: Live,
      needItemId: id('30'),
      actorId: Owner,
      profile: {
        unitPrice: 150000,
        estimatedValue: null,
        itemCondition: 'NEW',
        conditionNote: null,
        supplySource: 'DONATION',
        intakeDeadline: null,
        dropoffAddress: 'Số 1',
        deliveryInstruction: null,
        receiverName: 'Anh C',
        receiverPhone: '0901',
        intakeStatus: 'CLOSED',
      },
    });
    check('cập nhật hồ sơ dòng hiện vật', updatedItem);

    const funding = await projects.createFundingNeed({
      campaignId: Live,
      actorId: Owner,
      need: {
        title: 'Tiền xe',
        description: null,
        beneficiaryPartyId: null,
        bankAccountId: null,
        targetAmount: 5_000_000,
        deadline: null,
        sortOrder: 0,
      },
    });
    const fundingUpdated = await projects.updateFundingNeed({
      campaignId: Live,
      fundingNeedId: funding.fundingNeedId,
      actorId: Owner,
      need: { ...funding, title: 'Tiền xe' },
      confirmedAmount: 3_000_000,
      externalAmount: 500_000,
      status: 'OPEN',
    });
    check(
      'kêu gọi tiền: số còn thiếu tính đúng',
      fundingUpdated?.remainingAmount === 1_500_000,
    );

    const volunteer = await projects.createVolunteerNeed({
      campaignId: Live,
      actorId: Owner,
      need: {
        title: 'Bốc xếp',
        description: null,
        requirements: null,
        neededCount: 2,
        startsAt: null,
        endsAt: null,
        locationLabel: null,
        sortOrder: 0,
      },
    });
    // Chốt 05/11: tham gia độc lập với đóng góp — người chưa góp gì vẫn nhận vị trí được.
    const withoutContribution = await projects.registerVolunteer({
      campaignId: Live,
      volunteerNeedId: volunteer.volunteerNeedId,
      userId: Giver,
      note: null,
    });
    const [giverParticipation] = await sql(
      `SELECT status FROM campaign_participations WHERE campaign_id = $1 AND user_id = $2`,
      [Live, Giver],
    );
    const race = await Promise.all(
      [Racer1, Racer2].map((userId) =>
        projects.registerVolunteer({
          campaignId: Live,
          volunteerNeedId: volunteer.volunteerNeedId,
          userId,
          note: null,
        }),
      ),
    );
    check(
      'không cần đóng góp → REGISTERED, kèm lượt tham gia chờ duyệt',
      withoutContribution === 'REGISTERED' &&
        giverParticipation?.status === 'REGISTERED',
      `${withoutContribution} / ${giverParticipation?.status}`,
    );
    const confirmedVolunteer = await projects.confirmVolunteer({
      campaignId: Live,
      volunteerNeedId: volunteer.volunteerNeedId,
      userId: Giver,
      actorId: Owner,
    });
    const [giverAfterConfirm] = await sql(
      `SELECT status, status_changed_by FROM campaign_participations
        WHERE campaign_id = $1 AND user_id = $2`,
      [Live, Giver],
    );
    check(
      'xác nhận vị trí → lượt tham gia CONFIRMED (ghi người xác nhận)',
      confirmedVolunteer &&
        giverAfterConfirm?.status === 'CONFIRMED' &&
        giverAfterConfirm.status_changed_by === Owner,
      JSON.stringify(giverAfterConfirm),
    );
    check(
      'hai người tranh suất cuối song song: một REGISTERED, một FULL',
      race.filter((r) => r === 'REGISTERED').length === 1 &&
        race.includes('FULL'),
      race.join(','),
    );
    const winner = race[0] === 'REGISTERED' ? Racer1 : Racer2;
    const again = await projects.registerVolunteer({
      campaignId: Live,
      volunteerNeedId: volunteer.volunteerNeedId,
      userId: winner,
      note: null,
    });
    const cancelled = await projects.cancelVolunteer({
      campaignId: Live,
      volunteerNeedId: volunteer.volunteerNeedId,
      userId: winner,
    });
    const reRegister = await projects.registerVolunteer({
      campaignId: Live,
      volunteerNeedId: volunteer.volunteerNeedId,
      userId: winner,
      note: null,
    });
    check(
      'đăng ký lại → ALREADY_REGISTERED; huỷ rồi đăng ký lại được (dòng mới)',
      again === 'ALREADY_REGISTERED' &&
        cancelled &&
        reRegister === 'REGISTERED',
    );

    console.log('\n5b. Chỉ số công khai theo MONEY');
    const publicStats = new GetCharityPublicStatsUseCase(
      campaigns,
      projects,
      new CharityEngagementRepository(dataSource.manager),
    );
    const statsWithMoney = await publicStats.handle({
      idOrSlug: 'dang-chay',
      userId: null,
    });
    await sql(
      `UPDATE campaigns SET accepted_contribution_types = ARRAY['MATERIAL', 'SERVICE']::text[] WHERE global_id = $1`,
      [Live],
    );
    const statsWithoutMoney = await publicStats.handle({
      idOrSlug: 'dang-chay',
      userId: null,
    });
    await sql(
      `UPDATE campaigns SET accepted_contribution_types = ARRAY['MATERIAL', 'MONEY', 'SERVICE']::text[] WHERE global_id = $1`,
      [Live],
    );
    check(
      'public-stats: nhận MONEY thì có tổng tiền; tắt MONEY thì funding null',
      statsWithMoney.needs.funding?.target === 5_000_000 &&
        statsWithoutMoney.needs.funding === null &&
        !JSON.stringify(statsWithoutMoney).includes('5000000'),
      JSON.stringify({
        withMoney: statsWithMoney.needs.funding,
        withoutMoney: statsWithoutMoney.needs.funding,
      }),
    );

    console.log('\n6. Công khai mục + form mở');
    await projects.replaceCustomSections({
      campaignId: Live,
      actorId: Owner,
      sections: [
        {
          parentSection: 'PLAN',
          title: 'Thêm',
          visibility: 'PUBLIC',
          fields: [
            {
              label: 'Ghi chú công khai',
              fieldType: 'TEXT',
              visibility: 'PUBLIC',
              required: false,
              options: [],
              value: 'Xin chào',
            },
            {
              label: 'Nội bộ',
              fieldType: 'NUMBER',
              visibility: 'ORGANIZER_ONLY',
              required: false,
              options: [],
              value: 7,
            },
          ],
        },
      ],
    });
    const custom = await projects.listCustomSections(Live);
    await projects.publishSection({
      campaignId: Live,
      sectionKey: 'PLAN',
      actorId: Owner,
      snapshot: { hello: 'world' },
    });
    const states = await projects.listSectionStates(Live);
    check(
      'form mở lưu đủ trường kèm giá trị; công khai lưu bản chụp',
      custom[0]?.fields.length === 2 &&
        custom[0].fields[1].value === 7 &&
        states.some(
          (s) =>
            s.sectionKey === 'PLAN' &&
            s.publishedAt !== null &&
            (s.publishedSnapshot as { hello: string }).hello === 'world',
        ),
    );

    const rejects = async (query: string, params: unknown[]) => {
      try {
        await sql(query, params);
        return '';
      } catch (error) {
        return (error as { code?: string }).code ?? 'ERR';
      }
    };

    console.log('\n7. Tài khoản thụ hưởng');
    const firstBeneficiaryAccount = await projects.addBeneficiaryBankAccount({
      campaignId: Live,
      actorId: Owner,
      account: {
        holderType: 'OWNER',
        partyId: null,
        bankName: 'VCB',
        accountNo: '12345678',
        accountName: 'Nguyen Van A',
      },
      replacesAccountId: null,
      replaceReason: null,
    });
    const firstBeneficiaryId =
      firstBeneficiaryAccount.status === 'CREATED'
        ? firstBeneficiaryAccount.account.accountId
        : '';
    await projects.verifyBeneficiaryBankAccount({
      campaignId: Live,
      accountId: firstBeneficiaryId,
      actorId: Verifier,
    });
    const replacement = await projects.addBeneficiaryBankAccount({
      campaignId: Live,
      actorId: Owner,
      account: {
        holderType: 'OWNER',
        partyId: null,
        bankName: 'VCB',
        accountNo: '87654321',
        accountName: 'Nguyen Van B',
      },
      replacesAccountId: firstBeneficiaryId,
      replaceReason: 'Đổi người nhận',
    });
    const beneficiaryAccounts =
      await projects.listBeneficiaryBankAccounts(Live);
    check(
      'thay tài khoản thụ hưởng đóng bản cũ và bản mới luôn chưa xác thực',
      replacement.status === 'CREATED' &&
        beneficiaryAccounts.some(
          (account) =>
            account.accountId === firstBeneficiaryId &&
            account.validTo !== null,
        ) &&
        replacement.account.verifiedAt === null &&
        replacement.account.verifiedBy === null,
    );
    await sql(`DELETE FROM users WHERE global_id = $1`, [Verifier]);
    const afterVerifierDeleted = (
      await projects.listBeneficiaryBankAccounts(Live)
    ).find((account) => account.accountId === firstBeneficiaryId);
    check(
      'xoá người xác thực giữ thời điểm xác thực và xoá người xác thực',
      afterVerifierDeleted !== undefined &&
        afterVerifierDeleted.verifiedAt !== null &&
        afterVerifierDeleted.verifiedBy === null,
    );
    const otherCampaignAccount = await projects.addBeneficiaryBankAccount({
      campaignId: Draft,
      actorId: Owner,
      account: {
        holderType: 'OWNER',
        partyId: null,
        bankName: 'ACB',
        accountNo: '99990000',
        accountName: 'Nguyen Van A',
      },
      replacesAccountId: null,
      replaceReason: null,
    });
    const otherCampaignAccountId =
      otherCampaignAccount.status === 'CREATED'
        ? otherCampaignAccount.account.accountId
        : '';
    const replaceWith = (replacesAccountId: string) =>
      projects.addBeneficiaryBankAccount({
        campaignId: Live,
        actorId: Owner,
        account: {
          holderType: 'OWNER',
          partyId: null,
          bankName: 'VCB',
          accountNo: '55556666',
          accountName: 'Nguyen Van C',
        },
        replacesAccountId,
        replaceReason: 'Thử thay',
      });
    const replaceClosed = await replaceWith(firstBeneficiaryId);
    const replaceForeign = await replaceWith(otherCampaignAccountId);
    check(
      'thay tài khoản thụ hưởng đã đóng / của dự án khác → REPLACED_NOT_FOUND, không tạo dòng',
      replaceClosed.status === 'REPLACED_NOT_FOUND' &&
        replaceForeign.status === 'REPLACED_NOT_FOUND' &&
        !(await projects.listBeneficiaryBankAccounts(Live)).some(
          (account) => account.accountNo === '55556666',
        ),
    );
    const verifyClosed = await projects.verifyBeneficiaryBankAccount({
      campaignId: Live,
      accountId: firstBeneficiaryId,
      actorId: Admin,
    });
    const verifyForeign = await projects.verifyBeneficiaryBankAccount({
      campaignId: Live,
      accountId: otherCampaignAccountId,
      actorId: Admin,
    });
    check(
      'xác thực dòng đã đóng / dòng của dự án khác → null, dự án kia vẫn chưa xác thực',
      verifyClosed === null &&
        verifyForeign === null &&
        (await projects.listBeneficiaryBankAccounts(Draft))[0]?.verifiedAt ===
          null,
    );
    const replacementId =
      replacement.status === 'CREATED' ? replacement.account.accountId : '';
    const firstVerify = await projects.verifyBeneficiaryBankAccount({
      campaignId: Live,
      accountId: replacementId,
      actorId: Admin,
    });
    const secondVerify = await projects.verifyBeneficiaryBankAccount({
      campaignId: Live,
      accountId: replacementId,
      actorId: Other,
    });
    check(
      'xác thực lại idempotent: giữ verified_at và verified_by ban đầu',
      firstVerify !== null &&
        secondVerify !== null &&
        firstVerify.verifiedBy === Admin &&
        secondVerify.verifiedBy === Admin &&
        secondVerify.verifiedAt?.getTime() ===
          firstVerify.verifiedAt?.getTime(),
    );
    const addOwnerAccount = new AddCharityBeneficiaryBankAccountUseCase(
      new CharityProjectAccess(campaigns, {
        hasPermission: async () => false,
        getConfigValue: async () => null,
      } as never),
      projects,
    );
    const ownerAccountCommand = {
      userId: Owner,
      campaignId: Live,
      account: {
        holderType: 'OWNER' as const,
        partyId: null,
        bankName: 'VCB',
        accountNo: '77778888',
        accountName: 'NGUYEN VAN DUC',
      },
      replacesAccountId: null,
      replaceReason: null,
    };
    const nullNameOwner = await projects.findOwnerFullName(Live);
    const nullNameCode = await addOwnerAccount.handle(ownerAccountCommand).then(
      () => null,
      (error: unknown) => (error as { code?: number }).code ?? -1,
    );
    await sql(
      `UPDATE users SET full_name = 'Nguyễn Văn Đức' WHERE global_id = $1`,
      [Owner],
    );
    const ownerFullName = await projects.findOwnerFullName(Live);
    const ownerAccount = await addOwnerAccount.handle(ownerAccountCommand);
    check(
      'findOwnerFullName: NULL → OWNER lệch tên 0x13_5a; có họ tên có dấu → tạo với tên không dấu',
      nullNameOwner === null &&
        nullNameCode === 0x13_5a &&
        ownerFullName === 'Nguyễn Văn Đức' &&
        ownerAccount.accountNo === '77778888' &&
        ownerAccount.verifiedAt === null,
      String(nullNameCode),
    );
    const fakeAdmin = {
      hasPermission: async () => false,
      getConfigValue: async () => null,
    } as never;
    const partiesNow = await projects.listParties(Live);
    const keptOrganizer = partiesNow.find((p) => p.role === 'ORGANIZER')!;
    const appealSubject = partiesNow.find((p) => p.isAppealSubject)!;
    const groupInput = {
      role: 'BENEFICIARY' as const,
      name: 'Nhóm Hoa',
      address: null,
      phone: null,
      email: null,
      hotline: null,
      picName: null,
      picPhone: null,
      picUserId: null,
      beneficiaryKind: 'GROUP' as const,
      evidenceUrls: [],
    };
    // Sau duyệt, chủ dự án KHÔNG có quyền đăng không cần duyệt thêm đơn vị nhận → 409.
    let reviewCode = 0;
    try {
      await new ReplaceCharityPartiesUseCase(
        new CharityProjectAccess(campaigns, fakeAdmin, {
          getCapability: async () => ({ allowed: false }),
        } as never),
        projects,
      ).handle({
        userId: Owner,
        campaignId: Live,
        parties: [keptOrganizer, groupInput],
      });
    } catch (error) {
      reviewCode = Number((error as { code?: number }).code);
    }
    check(
      'sau duyệt: chủ dự án thường thêm đơn vị nhận → 409 CHARITY_CHANGE_REQUIRES_REVIEW, không ghi',
      reviewCode === 0x13_64 &&
        !(await projects.listParties(Live)).some((p) => p.name === 'Nhóm Hoa'),
      String(reviewCode),
    );
    const replaceParties = new ReplaceCharityPartiesUseCase(
      new CharityProjectAccess(campaigns, fakeAdmin, {
        getCapability: async () => ({ allowed: true }),
      } as never),
      projects,
    );
    const withGroup = await replaceParties.handle({
      userId: Owner,
      campaignId: Live,
      parties: [keptOrganizer, groupInput],
    });
    const groupParty = withGroup.find((p) => p.name === 'Nhóm Hoa')!;
    const beneficiaryOf = async (partyId: string, accountName: string) => {
      const outcome = await projects.addBeneficiaryBankAccount({
        campaignId: Live,
        actorId: Owner,
        account: {
          holderType: 'BENEFICIARY',
          partyId,
          bankName: 'VCB',
          accountNo: `3${partyId.slice(-7)}`,
          accountName,
        },
        replacesAccountId: null,
        replaceReason: null,
      });
      return outcome.status === 'CREATED' ? outcome.account.accountId : '';
    };
    const groupAccountId = await beneficiaryOf(groupParty.partyId, 'NHOM HOA');
    const appealAccountId = await beneficiaryOf(
      appealSubject.partyId,
      'ONG TU',
    );
    const groupVerified = await projects.verifyBeneficiaryBankAccount({
      campaignId: Live,
      accountId: groupAccountId,
      actorId: Admin,
    });
    const renamed = await replaceParties.handle({
      userId: Owner,
      campaignId: Live,
      parties: [keptOrganizer, { ...groupParty, name: 'Nhóm Hoa (đổi tên)' }],
    });
    const afterRename = await projects.listBeneficiaryBankAccounts(Live);
    const groupAfter = afterRename.find((a) => a.accountId === groupAccountId);
    check(
      'PUT parties bỏ dòng kêu gọi cá nhân (còn tài khoản) vẫn được; đổi tên bên thụ hưởng giữ verified_at',
      renamed.some(
        (p) =>
          p.partyId === groupParty.partyId && p.name === 'Nhóm Hoa (đổi tên)',
      ) &&
        renamed.some((p) => p.partyId === appealSubject.partyId) &&
        groupAfter?.validTo === null &&
        groupAfter.verifiedAt?.getTime() ===
          groupVerified?.verifiedAt?.getTime() &&
        afterRename.some(
          (a) => a.accountId === appealAccountId && a.validTo === null,
        ),
    );
    const removeGroup = await replaceParties
      .handle({ userId: Owner, campaignId: Live, parties: [keptOrganizer] })
      .then(
        () => '',
        (error: unknown) => (error as Error).message,
      );
    check(
      'PUT parties bỏ bên thụ hưởng thường còn tài khoản → 400, bên đó vẫn còn',
      removeGroup ===
        'parties: bên thụ hưởng "Nhóm Hoa (đổi tên)" còn tài khoản thụ hưởng đang hiệu lực — đóng tài khoản trước' &&
        (await projects.listParties(Live)).some(
          (p) => p.partyId === groupParty.partyId,
        ),
      removeGroup,
    );
    check(
      'OWNER không được gắn party_id',
      (await rejects(
        `INSERT INTO campaign_beneficiary_bank_accounts
           (campaign_id, holder_type, party_id, bank_name, account_no, account_name)
         VALUES ($1, 'OWNER', $2, 'VCB', '11223344', 'Sai')`,
        [Live, id('20')],
      )) === '23514',
    );
    console.log('\n8. Ràng buộc');
    check(
      'nháp không thể "đã duyệt" (CHK_campaigns_draft_undecided)',
      (await rejects(
        `UPDATE campaigns SET submitted_at = NULL WHERE global_id = $1`,
        [Live],
      )) === '23514',
    );
    // Đường ghi KIỂU CŨ (seed, script, chỗ chưa biết tới dự án): không nói gì về nháp hay
    // giai đoạn. Mặc định + trigger giữ hàng hợp lệ thay vì làm hỏng lượt ghi.
    const [legacyApproved] = await sql(
      `INSERT INTO campaigns (title, slug, description, banner_url, badge_name, start_time, end_time,
         created_by, approval_status, approved_at, approved_by)
       VALUES ('x', 'x-1', 'Mô tả đủ dài x', 'https://cdn.test/a.jpg', 'x', now(), now() + interval '1 day',
               $1, 'APPROVED', now(), $1)
       RETURNING submitted_at IS NOT NULL AS submitted, operation_stage`,
      [Owner],
    );
    const [pendingForced] = await sql(
      `INSERT INTO campaigns (title, slug, description, banner_url, badge_name, start_time, end_time,
         created_by, approval_status, operation_stage)
       VALUES ('y', 'y-1', 'Mô tả đủ dài y', 'https://cdn.test/a.jpg', 'y', now(), now() + interval '1 day',
               $1, 'PENDING_APPROVAL', 'EXECUTION')
       RETURNING operation_stage`,
      [Owner],
    );
    check(
      'ghi kiểu cũ: đã duyệt → gửi sẵn + EXECUTION; chưa duyệt luôn về PLAN',
      legacyApproved.submitted &&
        legacyApproved.operation_stage === 'EXECUTION' &&
        pendingForced.operation_stage === 'PLAN',
      JSON.stringify({ legacyApproved, pendingForced }),
    );
    check(
      'một kêu gọi cá nhân chỉ một người thụ hưởng (UQ_campaign_parties_appeal_subject)',
      (await rejects(
        `INSERT INTO campaign_parties (campaign_id, role, name, beneficiary_kind, is_appeal_subject, relation_note, consent_status)
         VALUES ($1, 'BENEFICIARY', 'Người thứ hai', 'INDIVIDUAL', true, 'x', 'PENDING')`,
        [Live],
      )) === '23505',
    );
    check(
      'deliveryMethod chỉ cho bước DISTRIBUTION',
      (await rejects(
        `INSERT INTO campaign_phases (campaign_id, phase, starts_at, ends_at, delivery_method)
         VALUES ($1, 'REPORTING', now(), now() + interval '1 day', 'SHIP')`,
        [Draft],
      )) === '23514',
    );
    // ── Tổng duyệt và điều kiện hoàn tất bước trao (CR 22/11/2026) ──────────
    console.log('\n9. Tổng duyệt và bước trao cấp chiến dịch');
    const savedRehearsal = await projects.saveRehearsal({
      campaignId: Live,
      actorId: Owner,
      checklist: [
        { key: 'RECIPIENTS', status: 'DONE', note: null },
        { key: 'GOODS_AND_FUNDS', status: 'DONE', note: null },
        { key: 'TRANSPORT', status: 'DONE', note: 'Xe 16 chỗ' },
        { key: 'STAFF', status: 'DONE', note: null },
        { key: 'SUPERVISORS', status: 'DONE', note: null },
        { key: 'VENUE_AND_TIME', status: 'DONE', note: null },
        { key: 'LOCAL_CONTACT', status: 'DONE', note: null },
      ],
      outcome: 'READY',
      reason: null,
      note: null,
    });
    check(
      'ghi tổng duyệt READY ghi decided_at, đọc lại đủ 7 mục',
      savedRehearsal.outcome === 'READY' &&
        savedRehearsal.decidedAt instanceof Date &&
        savedRehearsal.checklist.length === 7,
      JSON.stringify(savedRehearsal),
    );
    const keptRehearsal = await projects.saveRehearsal({
      campaignId: Live,
      actorId: Owner,
      checklist: [],
      outcome: undefined,
      reason: null,
      note: 'Chỉ sửa ghi chú',
    });
    check(
      'bỏ trống outcome giữ kết quả READY đã lưu',
      keptRehearsal.outcome === 'READY' &&
        keptRehearsal.note === 'Chỉ sửa ghi chú',
      JSON.stringify(keptRehearsal),
    );
    const [closedAccount] = await sql(
      `INSERT INTO campaign_beneficiary_bank_accounts
         (campaign_id, holder_type, bank_name, account_no, account_name,
          verified_at, verified_by, valid_to, close_reason, closed_by)
       VALUES ($1, 'OWNER', 'VCB', '99887766', 'Chu du an', now(), $2,
               now(), 'Đóng thử', $2)
       RETURNING global_id`,
      [Live, Owner],
    );
    await sql(
      `UPDATE campaigns SET distribution_method = 'BANK_TRANSFER',
              distribution_contribution_types = ARRAY['MONEY']::text[],
              distribution_evidence_urls = '["https://cdn.test/bt.jpg"]'::jsonb
        WHERE global_id = $1`,
      [Live],
    );
    await sql(
      `INSERT INTO campaign_distribution_private_details
         (campaign_id, beneficiary_bank_account_id, transfer_content)
       VALUES ($1, $2, 'Chuyen tien')
       ON CONFLICT (campaign_id) DO UPDATE
         SET beneficiary_bank_account_id = EXCLUDED.beneficiary_bank_account_id`,
      [Live, closedAccount.global_id],
    );
    const settlement = await projects.distributionSettlement(Live);
    check(
      'BANK_TRANSFER gắn tài khoản đã đóng (dù đã xác thực) → live = false',
      settlement.method === 'BANK_TRANSFER' &&
        settlement.beneficiaryAccount?.live === false &&
        settlement.beneficiaryAccount.verified === true &&
        settlement.beneficiaryAccount.sameCampaign === true,
      JSON.stringify(settlement),
    );
    const phasesWithRehearsal = await projects.replacePhases({
      campaignId: Live,
      actorId: Owner,
      phases: [
        {
          phase: 'PREPARATION',
          startsAt: new Date(Date.now() - 20 * Hour),
          endsAt: new Date(Date.now() - 12 * Hour),
          picName: null,
          picUserId: null,
          hotline: null,
          deliveryMethod: null,
          reportMode: null,
        },
        {
          phase: 'REHEARSAL',
          startsAt: new Date(Date.now() - 11 * Hour),
          endsAt: new Date(Date.now() - 2 * Hour),
          picName: 'Anh Tư',
          picUserId: null,
          hotline: null,
          deliveryMethod: null,
          reportMode: null,
        },
        {
          phase: 'DISTRIBUTION',
          startsAt: new Date(Date.now() - Hour),
          endsAt: new Date(Date.now() + 5 * Hour),
          picName: null,
          picUserId: null,
          hotline: null,
          deliveryMethod: null,
          reportMode: null,
        },
      ],
    });
    check(
      'PUT phases nhận REHEARSAL nằm giữa PREPARATION và DISTRIBUTION, đọc ra đúng thứ tự',
      JSON.stringify(
        (phasesWithRehearsal ?? []).map((phase) => phase.phase),
      ) === JSON.stringify(['PREPARATION', 'REHEARSAL', 'DISTRIBUTION']) &&
        (await projects.getRehearsal(Live))?.phase?.picName === 'Anh Tư',
      JSON.stringify(phasesWithRehearsal),
    );

    // ── Job có cổng: hàng bị giữ không chiếm LIMIT, nhắc ban tổ chức (CR 22/11/2026) ──
    console.log('\n10. Job chuyển giai đoạn có cổng');
    const Gated = [id('20'), id('21'), id('22'), id('23')];
    const LateExecution = id('24');
    const ShippingEvent = id('25');
    const insertGated = async (
      campaignId: string,
      stage: string,
      phaseStart: string,
      phaseEnd: string,
      endTime: string,
    ) => {
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, campaign_type,
            operation_stage)
         VALUES ($1, $4, $5, 'Mô tả đủ dài cho chiến dịch có cổng',
                 'https://cdn.test/a.jpg', 'Ấm', now() - interval '10 days', ${endTime},
                 $2, 'APPROVED', now(), $2, 'ORGANIZED_CAMPAIGN', $3)`,
        [campaignId, Owner, stage, `Cổng ${campaignId}`, `cong-${campaignId}`],
      );
      await sql(
        `INSERT INTO campaign_phases (campaign_id, phase, starts_at, ends_at)
         VALUES ($1, 'DISTRIBUTION', ${phaseStart}, ${phaseEnd})`,
        [campaignId],
      );
    };
    for (const campaignId of Gated)
      await insertGated(
        campaignId,
        'EXECUTION',
        "now() - interval '1 hour'",
        "now() + interval '5 hours'",
        "now() + interval '1 day'",
      );
    await projects.saveRehearsal({
      campaignId: Gated[3],
      actorId: Owner,
      checklist: [],
      outcome: 'READY',
      reason: null,
      note: null,
    });
    const allReady = await projects.listStageCandidates(1000);
    const limited = await projects.listStageCandidates(allReady.length);
    check(
      '3 chiến dịch bị giữ (id nhỏ hơn) không chiếm LIMIT: chiến dịch READY vẫn được nhặt',
      allReady.some((c) => c.campaignId === Gated[3]) &&
        !allReady.some((c) => Gated.slice(0, 3).includes(c.campaignId)) &&
        limited.some((c) => c.campaignId === Gated[3]) &&
        limited.every((c) => c.rehearsalReady),
      JSON.stringify(limited.map((c) => c.campaignId)),
    );
    const blockedRows = await projects.listBlockedStageCampaigns(1000);
    check(
      'danh sách nhắc có đúng 3 chiến dịch chưa READY với lý do REHEARSAL_NOT_READY',
      Gated.slice(0, 3).every((campaignId) =>
        blockedRows.some(
          (row) =>
            row.campaignId === campaignId &&
            row.reason === 'REHEARSAL_NOT_READY',
        ),
      ) && !blockedRows.some((row) => row.campaignId === Gated[3]),
      JSON.stringify(blockedRows),
    );

    await insertGated(
      LateExecution,
      'EXECUTION',
      "now() - interval '3 days'",
      "now() - interval '2 days'",
      "now() - interval '1 day'",
    );
    const sent: { idempotencyKey?: string | null; userId: string }[] = [];
    const job = new AdvanceCharityStagesUseCase(projects, {
      handle: async (command: {
        idempotencyKey?: string | null;
        userId: string;
      }) => {
        sent.push(command);
        return { created: true, pushedDevices: 0 };
      },
    } as never);
    const jobResult = await job.handle({ limit: 1000, dryRun: false });
    const lateAfter = await campaigns.findByGlobalId(LateExecution);
    const readyAfter = await campaigns.findByGlobalId(Gated[3]);
    check(
      'EXECUTION quá giờ kết thúc mà chưa READY: job giữ nguyên EXECUTION, gửi nhắc REHEARSAL_NOT_READY',
      lateAfter?.storedOperationStage === 'EXECUTION' &&
        lateAfter.operationStage === 'EXECUTION' &&
        sent.some(
          (command) =>
            command.userId === Owner &&
            String(command.idempotencyKey).startsWith(
              `CHARITY_ORGANIZER_REMINDER:${LateExecution}:REHEARSAL_NOT_READY:`,
            ),
        ) &&
        jobResult.reminded >= 4,
      `${lateAfter?.storedOperationStage} ${JSON.stringify(jobResult)}`,
    );
    check(
      'chiến dịch READY tới giờ trao: job ghi EXECUTION → EVENT',
      readyAfter?.storedOperationStage === 'EVENT',
      String(readyAfter?.storedOperationStage),
    );

    const overdueRows = await projects.listOverdueSummaries(1000);
    check(
      'listOverdueSummaries: chiến dịch mở, quá end_time, chưa công khai tổng kết (job nhắc SUMMARY_OVERDUE)',
      overdueRows.some(
        (row) => row.campaignId === LateExecution && row.ownerId === Owner,
      ) && !overdueRows.some((row) => row.campaignId === Gated[0]),
      JSON.stringify(overdueRows),
    );
    await sql(
      `INSERT INTO campaign_summaries (campaign_id, summary, published_at)
       VALUES ($1, 'Xong', now())`,
      [LateExecution],
    );
    check(
      'công khai tổng kết -> rời danh sách quá hạn',
      !(await projects.listOverdueSummaries(1000)).some(
        (row) => row.campaignId === LateExecution,
      ),
    );

    await insertGated(
      ShippingEvent,
      'EVENT',
      "now() - interval '3 days'",
      "now() - interval '2 days'",
      "now() - interval '1 day'",
    );
    await sql(
      `UPDATE campaigns SET distribution_method = 'SHIPPING',
              distribution_contribution_types = ARRAY['MATERIAL']::text[],
              distribution_evidence_urls = '["https://cdn.test/ship.jpg"]'::jsonb
        WHERE global_id = $1`,
      [ShippingEvent],
    );
    await sql(
      `INSERT INTO campaign_distribution_private_details (campaign_id, carrier)
       VALUES ($1, 'GHN')`,
      [ShippingEvent],
    );
    const settledParity = async () => {
      const stored = await projects.distributionSettlement(ShippingEvent);
      const ts = charityDistributionSettled({
        distributionMethod: stored.method,
        evidenceUrls: stored.evidenceUrls,
        trackingCode: stored.trackingCode,
        beneficiaryAccount: stored.beneficiaryAccount,
      }).settled;
      const [row] = await sql(
        `SELECT ${CampaignDistributionSettledSql('campaigns')} AS settled
           FROM campaigns WHERE global_id = $1`,
        [ShippingEvent],
      );
      return { ts, sql: row.settled === true };
    };
    const shippingHeld = await campaigns.findByGlobalId(ShippingEvent);
    const parityHeld = await settledParity();
    const shippingBlocked = await projects.listBlockedStageCampaigns(1000);
    check(
      'EVENT + SHIPPING chưa có mã vận đơn: đọc ra vẫn EVENT, nhắc DISTRIBUTION_EVIDENCE_MISSING, SQL = TS',
      shippingHeld?.operationStage === 'EVENT' &&
        shippingBlocked.some(
          (row) =>
            row.campaignId === ShippingEvent &&
            row.reason === 'DISTRIBUTION_EVIDENCE_MISSING',
        ) &&
        parityHeld.ts === false &&
        parityHeld.sql === false,
      `${shippingHeld?.operationStage} ${JSON.stringify(parityHeld)}`,
    );
    await sql(
      `UPDATE campaign_distribution_private_details SET tracking_code = 'GHN123'
        WHERE campaign_id = $1`,
      [ShippingEvent],
    );
    const shippingDone = await campaigns.findByGlobalId(ShippingEvent);
    const parityDone = await settledParity();
    check(
      'thêm mã vận đơn: đọc ra SUMMARY ngay (đường đọc), SQL = TS',
      shippingDone?.operationStage === 'SUMMARY' &&
        shippingDone.storedOperationStage === 'EVENT' &&
        parityDone.ts === true &&
        parityDone.sql === true,
      `${shippingDone?.operationStage} ${JSON.stringify(parityDone)}`,
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
    `\n${failures.length === 0 ? 'Dự án từ thiện đợt 1: nháp, giai đoạn, hồ sơ, ba nhóm nhu cầu, công khai đều đúng' : `${failures.length} phép kiểm thất bại`}`,
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
