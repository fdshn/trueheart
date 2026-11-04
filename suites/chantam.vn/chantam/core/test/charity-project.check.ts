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
 *
 *   npm run test:charity-project
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
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
    const live = await campaigns.findByGlobalId(Live);
    const candidates = await projects.listStageCandidates(50);
    check(
      'tới giờ trao: đọc ra EVENT dù cột vẫn EXECUTION; job nhặt dự án này',
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
        receivingUnit: null,
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
        neededCount: 1,
        startsAt: null,
        endsAt: null,
        locationLabel: null,
        sortOrder: 0,
      },
    });
    const notEligible = await projects.registerVolunteer({
      campaignId: Live,
      volunteerNeedId: volunteer.volunteerNeedId,
      userId: Giver,
      note: null,
    });
    for (const [n, contributor] of [
      [1, Giver],
      [2, Racer1],
      [3, Racer2],
    ] as const)
      await sql(
        `INSERT INTO campaign_contributions (global_id, campaign_id, contributor_id, status, decided_at, decided_by)
         VALUES ($1, $2, $3, 'ACCEPTED', now(), $4)`,
        [id(`4${n}`), Live, contributor, Owner],
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
      'chưa có đóng góp được chấp nhận → NOT_ELIGIBLE',
      notEligible === 'NOT_ELIGIBLE',
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

    console.log('\n7. Ràng buộc');
    const rejects = async (query: string, params: unknown[]) => {
      try {
        await sql(query, params);
        return '';
      } catch (error) {
        return (error as { code?: string }).code ?? 'ERR';
      }
    };
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
