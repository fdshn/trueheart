/**
 * Dự án từ thiện — đợt 5b/5c, quyết định 05/11 — trên Postgres THẬT
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.2, §3.4, §3.11, §3.18).
 *
 * - Hỗ trợ mở: tổng hợp chờ xét / đã nhận / hoàn thành / nguồn ngoài / còn thiếu; nguồn ngoài
 *   bắt buộc bằng chứng; có người nhận thì không xoá; đổi trạng thái có điều kiện.
 * - Đợt trao: timeline riêng mỗi đợt (cùng tồn tại với timeline chung); đổi giờ / huỷ xếp
 *   `ROUND_CHANGED`; ràng buộc lý do; gắn participant / giao nhận chỉ trong dự án; số liệu đợt.
 * - Nhắc 48 giờ theo đợt, chống trùng theo (đợt, mốc); dự án chia đợt không nhắc theo bước chung.
 * - Người nhận theo đợt.
 * - Điều kiện hoàn tất dự án.
 * - Nguồn ngoài app: mã chứng từ trùng → lỗi nghiệp vụ.
 * - Mục tiêu hạng mục hiện vật: sửa kèm giải trình phần dư, ghi lịch sử.
 * - Hoãn bước trao: lịch sử sửa có lý do.
 * - Đợt BANK_TRANSFER: chỉ gắn tài khoản thụ hưởng còn hiệu lực của dự án; DONE cần tài khoản đã
 *   xác thực (thay tài khoản → bản mới chưa xác thực → DONE bị từ chối); bản công khai không lộ số.
 *
 *   npm run test:charity-operations
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { GetCharityPublicProjectUseCase } from '../src/application/implementations/charity-project/charity-project.use-cases';
import { ICharitySupportOffer } from '../src/domain/ports/repository';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { CharityEngagementRepository } from '../src/infrastructure/repository/charity-engagement.repository';
import { CharityEventRepository } from '../src/infrastructure/repository/charity-event.repository';
import { CharityOperationsRepository } from '../src/infrastructure/repository/charity-operations.repository';
import { CharityProjectRepository } from '../src/infrastructure/repository/charity-project.repository';
import { CharitySummaryRepository } from '../src/infrastructure/repository/charity-summary.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_operations_check';
const id = (tail: string) => `7d000000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Coordinator = id('02');
const Helper = id('03');
const Walker = id('04');
const Giver = id('05');
const Live = id('10');
const Other = id('11');
const Single = id('12');

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

  const legacyMigrations = resolveAllEntities(migrations).filter(
    (migration) => Number(migration.name.slice(-13)) < 1804000000000,
  );
  const legacyDataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: legacyMigrations,
    migrationsTableName: 'migrations',
    extra: { max: 12 },
  });
  await legacyDataSource.initialize();
  opened.push(legacyDataSource);
  await legacyDataSource.runMigrations();
  const legacySql = (query: string, params: unknown[] = []) =>
    legacyDataSource.query(query, params);
  const LegacyRounds = id('20');
  const LegacyOwnTimeline = id('21');
  for (const [campaignId, slug] of [
    [LegacyRounds, 'legacy-rounds'],
    [LegacyOwnTimeline, 'legacy-own-timeline'],
  ])
    await legacySql(
      `INSERT INTO campaigns (global_id, title, slug, description, banner_url, badge_name, start_time, end_time)
       VALUES ($1, 'Legacy distribution', $2, 'Mô tả đủ dài cho dự án cũ',
               'https://cdn.test/a.jpg', 'Ấm', now(), now() + interval '20 days')`,
      [campaignId, slug],
    );
  const legacyRound = async (
    campaignId: string,
    title: string,
    startsIn: string,
    extra: { status?: string; method?: string; evidence?: string[] } = {},
  ): Promise<string> => {
    const [row] = await legacySql(
      `INSERT INTO campaign_distribution_rounds
         (campaign_id, title, starts_at, ends_at, status, status_reason,
          distribution_method, evidence_urls)
       VALUES ($1, $2, now() + $3::interval, now() + $3::interval + interval '1 hour',
               $4::text, CASE WHEN $4::text = 'CANCELLED' THEN 'Huỷ thử' END, $5, $6::jsonb)
       RETURNING global_id`,
      [
        campaignId,
        title,
        startsIn,
        extra.status ?? 'PLANNED',
        extra.method ?? null,
        JSON.stringify(extra.evidence ?? []),
      ],
    );
    return row.global_id as string;
  };
  const legacySteps = async (campaignId: string, roundId: string | null) =>
    legacySql(
      `INSERT INTO campaign_event_steps (campaign_id, round_id, step_key, sort_order)
       SELECT $1, $2, step.key, step.sort_order
       FROM unnest($3::text[], $4::int[]) AS step(key, sort_order)`,
      [
        campaignId,
        roundId,
        [
          'GATHER',
          'BRIEFING',
          'TRAVEL',
          'REST_STOP',
          'ARRIVE',
          'MEET_LOCAL_AUTHORITY',
          'MEET_RECIPIENTS',
          'DISTRIBUTE',
          'WRAP_UP',
          'RETURN',
        ],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      ],
    );
  const roundCancelled = await legacyRound(LegacyRounds, 'R1 huỷ', '10 days', {
    status: 'CANCELLED',
  });
  const roundChosen = await legacyRound(LegacyRounds, 'R2 ship', '5 days', {
    method: 'SHIPPING',
    evidence: ['https://cdn.test/e1.jpg', 'https://cdn.test/e2.jpg'],
  });
  const roundOlder = await legacyRound(LegacyRounds, 'R3 cũ', '1 day');
  await legacySql(
    `INSERT INTO campaign_round_private_details (round_id, campaign_id, tracking_code)
     VALUES ($1, $2, 'VN123')`,
    [roundChosen, LegacyRounds],
  );
  for (const roundId of [roundCancelled, roundChosen, roundOlder])
    await legacySteps(LegacyRounds, roundId);
  await legacySteps(LegacyOwnTimeline, null);
  const ownRound = await legacyRound(LegacyOwnTimeline, 'Một đợt', '3 days');
  await legacySteps(LegacyOwnTimeline, ownRound);
  await legacyDataSource.destroy();

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
    const events = new CharityEventRepository(dataSource.manager);
    const operations = new CharityOperationsRepository(dataSource.manager);
    const projects = new CharityProjectRepository(dataSource.manager);

    // ── 0. Migration 1804000000000: bỏ đợt trao ─────────────────────────────
    console.log('0. Migration bỏ đợt trao');
    const [moved] = await sql(
      `SELECT c.distribution_method, jsonb_array_length(c.distribution_evidence_urls) AS evidence,
              d.tracking_code,
              (SELECT count(*)::int FROM campaign_event_steps s WHERE s.campaign_id = c.global_id) AS steps
         FROM campaigns c
         LEFT JOIN campaign_distribution_private_details d ON d.campaign_id = c.global_id
        WHERE c.global_id = $1`,
      [LegacyRounds],
    );
    check(
      'giữ đợt mới nhất chưa huỷ: SHIPPING, 2 bằng chứng, mã vận đơn VN123, đúng 10 bước',
      moved?.distribution_method === 'SHIPPING' &&
        moved?.evidence === 2 &&
        moved?.tracking_code === 'VN123' &&
        moved?.steps === 10,
      JSON.stringify(moved),
    );
    check(
      'timeline UNIQUE (chiến dịch, bước): chèn trùng bị từ chối',
      await rejects(() =>
        sql(
          `INSERT INTO campaign_event_steps (campaign_id, step_key, sort_order)
           VALUES ($1, 'GATHER', 0)`,
          [LegacyRounds],
        ),
      ),
    );
    const [ownTimeline] = await sql(
      `SELECT count(*)::int AS steps FROM campaign_event_steps WHERE campaign_id = $1`,
      [LegacyOwnTimeline],
    );
    check(
      'chiến dịch đã có timeline riêng giữ đúng 10 bước của mình',
      ownTimeline?.steps === 10,
      JSON.stringify(ownTimeline),
    );
    const [gone] = await sql(
      `SELECT to_regclass('public.campaign_distribution_rounds') IS NULL AS rounds_gone,
              to_regclass('public.campaign_round_private_details') IS NULL AS details_gone,
              NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'campaign_participations' AND column_name = 'round_id'
              ) AS no_round_id`,
    );
    check(
      'không còn bảng đợt trao và cột round_id',
      gone?.rounds_gone === true &&
        gone?.details_gone === true &&
        gone?.no_round_id === true,
      JSON.stringify(gone),
    );
    check(
      'campaign_phases nhận REHEARSAL',
      !(await rejects(() =>
        sql(
          `INSERT INTO campaign_phases (campaign_id, phase, starts_at, ends_at)
           VALUES ($1, 'REHEARSAL', now() + interval '1 day', now() + interval '2 days')`,
          [LegacyOwnTimeline],
        ),
      )),
    );
    check(
      'campaign_rehearsals từ chối NOT_READY không có lý do',
      await rejects(() =>
        sql(
          `INSERT INTO campaign_rehearsals (campaign_id, outcome, reason, decided_at)
           VALUES ($1, 'NOT_READY', '  ', now())`,
          [LegacyOwnTimeline],
        ),
      ),
    );
    check(
      'distribution_evidence_urls quá 20 ảnh bị từ chối',
      await rejects(() =>
        sql(
          `UPDATE campaigns SET distribution_evidence_urls = $2::jsonb WHERE global_id = $1`,
          [
            LegacyOwnTimeline,
            JSON.stringify(
              Array.from({ length: 21 }, (_, i) => `https://cdn.test/${i}.jpg`),
            ),
          ],
        ),
      ),
    );

    for (const [userId, username] of [
      [Owner, 'cop_owner'],
      [Coordinator, 'cop_coord'],
      [Helper, 'cop_helper'],
      [Walker, 'cop_walker'],
      [Giver, 'cop_giver'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    for (const [campaignId, slug] of [
      [Live, 'cop-live'],
      [Other, 'cop-other'],
      [Single, 'cop-single'],
    ])
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage)
         VALUES ($1, 'Dự án kiểm', $2, 'Mô tả đủ dài cho dự án kiểm', 'https://cdn.test/a.jpg',
                 'Ấm', now() - interval '5 days', now() + interval '20 days', $3, 'APPROVED',
                 now(), $3, now(), 'EXECUTION')`,
        [campaignId, slug, Owner],
      );
    await sql(
      `INSERT INTO campaign_coordinators (campaign_id, user_id, granted_by) VALUES ($1, $2, $3)`,
      [Live, Coordinator, Owner],
    );

    // ── 1. Hỗ trợ mở ──────────────────────────────────────────────────────
    console.log('1. Hỗ trợ mở');
    const transport = await operations.createSupportNeed({
      campaignId: Live,
      actorId: Owner,
      need: {
        supportType: 'TRANSPORT',
        title: 'Xe 16 chỗ',
        description: null,
        unit: 'chuyến',
        targetQuantity: 5,
        startsAt: null,
        endsAt: null,
        locationLabel: 'Hà Giang',
        requirements: null,
        handoverMethod: 'Đón tại kho',
        picName: 'Anh Tư',
        picPhone: '0900000000',
        sortOrder: 0,
      },
    });
    const offers: ICharitySupportOffer[] = [];
    for (const [userId, quantity] of [
      [Helper, 2],
      [Walker, 1],
      [Helper, 1],
    ] as const)
      offers.push(
        await operations.createOffer({
          supportNeedId: transport.supportNeedId,
          userId,
          quantity,
          note: null,
        }),
      );
    await operations.transitionOffer({
      campaignId: Live,
      offerId: offers[0].offerId,
      from: ['PENDING'],
      to: 'ACCEPTED',
      actorId: Owner,
      reason: null,
      completedQuantity: null,
    });
    await operations.transitionOffer({
      campaignId: Live,
      offerId: offers[1].offerId,
      from: ['PENDING'],
      to: 'ACCEPTED',
      actorId: Owner,
      reason: null,
      completedQuantity: null,
    });
    await operations.transitionOffer({
      campaignId: Live,
      offerId: offers[1].offerId,
      from: ['ACCEPTED'],
      to: 'COMPLETED',
      actorId: Owner,
      reason: null,
      completedQuantity: 1,
    });
    const withExternal = await operations.updateSupportNeed({
      campaignId: Live,
      supportNeedId: transport.supportNeedId,
      actorId: Owner,
      need: { ...transport },
      external: {
        quantity: 1,
        evidenceUrls: ['https://cdn.test/hop-dong-xe.png'],
        note: 'Nhà xe tặng',
      },
      status: 'OPEN',
    });
    check(
      'tổng hợp: chờ 1, đã nhận 2, hoàn thành 1, ngoài 1, còn thiếu 3, 3 đề nghị',
      withExternal?.pendingQuantity === 1 &&
        withExternal.acceptedQuantity === 2 &&
        withExternal.completedQuantity === 1 &&
        withExternal.external.quantity === 1 &&
        withExternal.remainingQuantity === 3 &&
        withExternal.offerCount === 3,
      JSON.stringify(withExternal),
    );
    check(
      'database chặn nguồn ngoài thiếu bằng chứng; hoàn thành vượt số đã nhận',
      (await rejects(() =>
        sql(
          `UPDATE campaign_other_support_needs SET external_quantity = 2, external_evidence_urls = '[]'::jsonb WHERE global_id = $1`,
          [transport.supportNeedId],
        ),
      )) &&
        (await rejects(() =>
          sql(
            `UPDATE campaign_other_support_offers SET status = 'COMPLETED', completed_quantity = 9 WHERE global_id = $1`,
            [offers[0].offerId],
          ),
        )),
    );
    const [winA, winB] = await Promise.all(
      [0, 1].map(() =>
        operations.transitionOffer({
          campaignId: Live,
          offerId: offers[2].offerId,
          from: ['PENDING'],
          to: 'ACCEPTED',
          actorId: Owner,
          reason: null,
          completedQuantity: null,
        }),
      ),
    );
    check(
      'hai lượt xét song song: một thắng',
      [winA, winB].filter(Boolean).length === 1,
    );
    check(
      'đề nghị dự án khác → null; của tôi lọc đúng',
      (await operations.findOffer(Other, offers[0].offerId)) === null &&
        (
          await operations.listOffers({
            campaignId: Live,
            supportNeedId: null,
            userId: Helper,
          })
        ).length === 2,
    );
    const emptyNeed = await operations.createSupportNeed({
      campaignId: Live,
      actorId: Owner,
      need: { ...transport, title: 'Âm thanh', supportType: 'EQUIPMENT' },
    });
    check(
      'có người nhận → HAS_OFFERS; chưa ai nhận → xoá được',
      (await operations.deleteSupportNeed(Live, transport.supportNeedId)) ===
        'HAS_OFFERS' &&
        (await operations.deleteSupportNeed(Live, emptyNeed.supportNeedId)) ===
          'DELETED',
    );

    // ── 2. Dữ liệu vận hành chung + timeline + nhắc 48 giờ theo chiến dịch ──
    console.log('\n2. Timeline và nhắc 48 giờ theo chiến dịch');
    await events.ensureEventSteps(Live);
    await events.ensureEventSteps(Live);
    check(
      'timeline chiến dịch: đúng 10 bước, tạo lại không nhân đôi',
      (await events.listEventSteps(Live)).length === 10,
    );

    for (const userId of [Walker, Helper]) {
      await campaigns.register({ campaignId: Live, userId });
      await sql(
        `UPDATE campaign_participations SET status = 'CONFIRMED' WHERE campaign_id = $1 AND user_id = $2`,
        [Live, userId],
      );
    }
    const [need] = await sql(
      `INSERT INTO campaign_need_items (campaign_id, item_name, unit, target_quantity, accepted_quantity)
       VALUES ($1, 'Áo ấm', 'cái', 10, 5) RETURNING global_id`,
      [Live],
    );
    const [contribution] = await sql(
      `INSERT INTO campaign_contributions (campaign_id, contributor_id, status)
       VALUES ($1, $2, 'PENDING_REVIEW') RETURNING global_id`,
      [Live, Giver],
    );
    const [item] = await sql(
      `INSERT INTO campaign_contribution_items (contribution_id, need_item_id, offered_quantity, accepted_quantity)
       VALUES ($1, $2, 5, 5) RETURNING global_id`,
      [contribution.global_id, need.global_id],
    );
    await sql(
      `UPDATE campaign_contributions SET status = 'ACCEPTED', decided_at = now(), decided_by = $2 WHERE global_id = $1`,
      [contribution.global_id, Owner],
    );
    const [delivery] = await sql(
      `INSERT INTO campaign_deliveries (campaign_id, contribution_id, contributor_id, organizer_id)
       VALUES ($1, $2, $3, $4) RETURNING global_id`,
      [Live, contribution.global_id, Giver, Owner],
    );
    await sql(
      `INSERT INTO campaign_delivery_items (delivery_id, contribution_item_id, need_item_id, accepted_quantity)
       VALUES ($1, $2, $3, 5)`,
      [delivery.global_id, item.global_id, need.global_id],
    );
    await sql(
      `UPDATE campaign_delivery_items SET received_quantity = 5, confirmed_value = 750000 WHERE delivery_id = $1`,
      [delivery.global_id],
    );
    await sql(
      `UPDATE campaign_deliveries SET status = 'COMPLETED', completed_at = now(), completed_by = $2 WHERE global_id = $1`,
      [delivery.global_id, Owner],
    ).catch(() => undefined);
    for (const campaignId of [Live, Single])
      await sql(
        `INSERT INTO campaign_phases (campaign_id, phase, starts_at, ends_at)
         VALUES ($1, 'DISTRIBUTION', now() + interval '10 hours', now() + interval '20 hours')`,
        [campaignId],
      );
    const phaseCandidates = await engagement.listPreEventCandidates({
      hours: 48,
      limit: 10,
    });
    check(
      'nhắc 48 giờ theo bước trao của chiến dịch (không còn ngoại lệ chia đợt)',
      [Live, Single].every((campaignId) =>
        phaseCandidates.some((row) => row.campaignId === campaignId),
      ),
      JSON.stringify(phaseCandidates.map((row) => row.campaignId)),
    );

    // ── 3. Hoàn tất dự án ─────────────────────────────────────────────────
    console.log('\n3. Điều kiện hoàn tất dự án');
    const blockers = await operations.completionBlockers(Live);
    check(
      'dự án đang dở: nhu cầu mở, đề nghị hỗ trợ dở; không còn blocker đợt trao',
      ['NEEDS_OPEN', 'SUPPORT_OFFERS_UNSETTLED'].every((code) =>
        blockers.includes(code as never),
      ) && !blockers.includes('ROUNDS_UNSETTLED' as never),
      JSON.stringify(blockers),
    );
    await sql(
      `UPDATE campaign_need_items SET intake_status = 'CLOSED', received_quantity = 12 WHERE campaign_id = $1`,
      [Live],
    );
    await sql(
      `UPDATE campaign_other_support_needs SET status = 'CLOSED' WHERE campaign_id = $1`,
      [Live],
    );
    await sql(
      `UPDATE campaign_other_support_offers SET status = 'WITHDRAWN' WHERE status IN ('PENDING', 'ACCEPTED')`,
    );
    await sql(
      `UPDATE campaign_deliveries SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2, cancel_reason = 'x'
        WHERE campaign_id = $1 AND status = 'ACCEPTED'`,
      [Live, Owner],
    );
    check(
      'nhận vượt mục tiêu mà chưa giải trình → SURPLUS_UNEXPLAINED',
      JSON.stringify(await operations.completionBlockers(Live)) ===
        JSON.stringify(['SURPLUS_UNEXPLAINED']),
      JSON.stringify(await operations.completionBlockers(Live)),
    );

    // ── 4. Mục tiêu hạng mục + giải trình phần dư ─────────────────────────
    console.log('\n4. Mục tiêu và giải trình phần dư');
    const [itemNeed] = await projects.listItemNeeds(Live);
    await projects.updateItemNeedProfile({
      campaignId: Live,
      needItemId: itemNeed.needItemId,
      actorId: Owner,
      profile: { ...itemNeed },
      targetQuantity: 8,
      surplusExplanation: 'Phần dư 4 áo chuyển cho điểm trường bên cạnh',
    });
    const [afterTarget] = await projects.listItemNeeds(Live);
    const revisions = await sql(
      `SELECT field FROM campaign_revisions WHERE campaign_id = $1 AND entity = 'NEED_ITEM' ORDER BY field`,
      [Live],
    );
    check(
      'giảm mục tiêu kèm giải trình: lưu, ghi lịch sử hai field; hết vướng hoàn tất',
      afterTarget.targetQuantity === 8 &&
        afterTarget.surplusExplanation?.startsWith('Phần dư') === true &&
        revisions.map((row: { field: string }) => row.field).join() ===
          'surplusExplanation,targetQuantity' &&
        (await operations.completionBlockers(Live)).length === 0,
      JSON.stringify(revisions),
    );

    // ── 5. Nguồn ngoài app: mã chứng từ ───────────────────────────────────
    console.log('\n5. Nguồn ngoài app chống đếm trùng');
    await sql(
      `UPDATE campaign_need_items SET intake_status = 'OPEN' WHERE campaign_id = $1`,
      [Live],
    );
    const record = (reference: string) =>
      campaigns.recordExternalContribution({
        campaignId: Live,
        recordedBy: Owner,
        needItemId: itemNeed.needItemId,
        quantity: 1,
        sourceLabel: 'Tạp hoá đầu hẻm',
        receivedAt: new Date(Date.now() - 3_600_000),
        evidenceNote: 'Ảnh biên nhận',
        sourceReference: reference,
      });
    const first = await record('BN-001');
    let duplicateName = '';
    try {
      await record(' bn-001 ');
    } catch (error) {
      duplicateName = (error as Error).constructor.name;
    }
    check(
      'mã chứng từ trùng (không phân biệt hoa thường, khoảng trắng) → lỗi nghiệp vụ',
      first.sourceReference === 'BN-001' &&
        duplicateName === 'CharityExternalSourceDuplicatedException',
      duplicateName,
    );
    const adjusted = await campaigns.amendExternalContribution({
      externalId: first.globalId,
      actorUserId: Owner,
      action: 'ADJUST',
      reason: 'Đếm lại',
      quantity: 2,
    });
    check(
      'điều chỉnh: bản thay thế giữ mã chứng từ (bản cũ đã huỷ nên không trùng)',
      adjusted.sourceReference === 'BN-001' && adjusted.quantity === 2,
    );

    // ── 6. Hoãn bước trao: lịch sử có lý do ───────────────────────────────
    console.log('\n6. Hoãn bước trao');
    const phases = await projects.listPhases(Single);
    await projects.replacePhases({
      campaignId: Single,
      actorId: Owner,
      phases: phases.map((phase) => ({
        ...phase,
        startsAt: new Date(phase.startsAt.getTime() + 24 * 3_600_000),
        endsAt: new Date(phase.endsAt.getTime() + 24 * 3_600_000),
      })),
      reason: 'Mưa lũ',
    });
    const [postponed] = await sql(
      `SELECT reason FROM campaign_revisions WHERE campaign_id = $1 AND entity = 'PHASE' LIMIT 1`,
      [Single],
    );
    check(
      'lịch sử sửa của lần hoãn mang lý do',
      postponed?.reason === 'Mưa lũ',
    );

    // ── 7. Tranh chấp đóng góp ────────────────────────────────────────────
    console.log('\n7. Tranh chấp đóng góp');
    const parties = await operations.findContributionParties(
      contribution.global_id,
    );
    check(
      'hai bên của đóng góp: người góp + người tạo dự án',
      parties?.contributorId === Giver &&
        parties.campaignCreatedBy === Owner &&
        parties.status === 'ACCEPTED',
      JSON.stringify(parties),
    );
    const opened = await operations.openDispute({
      campaignId: Live,
      contributionId: contribution.global_id,
      openedBy: Giver,
      party: 'CONTRIBUTOR',
      reason: 'QUANTITY_MISMATCH',
      description: 'Tôi gửi 5 áo nhưng biên nhận ghi 4',
      evidenceUrls: ['https://cdn.test/bien-nhan.png'],
    });
    const again = await operations.openDispute({
      campaignId: Live,
      contributionId: contribution.global_id,
      openedBy: Owner,
      party: 'ORGANIZER',
      reason: 'OTHER',
      description: 'Mở thêm một tranh chấp nữa',
      evidenceUrls: [],
    });
    const viewed = await campaigns.findContributionByGlobalId(
      contribution.global_id,
    );
    check(
      'mở được; tranh chấp thứ hai khi đang mở → ALREADY_OPEN; đóng góp hiện OPEN',
      opened !== 'ALREADY_OPEN' &&
        opened.openedByParty === 'CONTRIBUTOR' &&
        again === 'ALREADY_OPEN' &&
        viewed?.disputeStatus === 'OPEN',
      JSON.stringify(viewed?.disputeStatus),
    );
    check(
      'tranh chấp mở chặn hoàn tất dự án',
      (await operations.completionBlockers(Live)).includes(
        'CONTRIBUTIONS_DISPUTED',
      ),
    );
    const disputeId = (opened as { disputeId: string }).disputeId;
    check(
      'database chặn giải quyết thiếu kết luận và đóng thiếu mốc',
      (await rejects(() =>
        sql(
          `UPDATE campaign_contribution_disputes SET status = 'RESOLVED', closed_at = now() WHERE global_id = $1`,
          [disputeId],
        ),
      )) &&
        (await rejects(() =>
          sql(
            `UPDATE campaign_contribution_disputes SET status = 'WITHDRAWN' WHERE global_id = $1`,
            [disputeId],
          ),
        )),
    );
    const [closeA, closeB] = await Promise.all(
      [0, 1].map(() =>
        operations.closeDispute({
          disputeId,
          to: 'RESOLVED',
          actorId: Owner,
          resolution: 'Đếm lại kho: đủ 5 áo, đã sửa biên nhận',
        }),
      ),
    );
    check(
      'hai lượt giải quyết song song: một thắng; hết chặn hoàn tất',
      [closeA, closeB].filter(Boolean).length === 1 &&
        !(await operations.completionBlockers(Live)).includes(
          'CONTRIBUTIONS_DISPUTED',
        ),
    );
    const reopened = await operations.openDispute({
      campaignId: Live,
      contributionId: contribution.global_id,
      openedBy: Owner,
      party: 'ORGANIZER',
      reason: 'QUALITY_ISSUE',
      description: 'Phát hiện thêm 2 áo rách khi đóng gói',
      evidenceUrls: [],
    });
    check(
      'đóng rồi thì mở tranh chấp mới được; danh sách theo dự án đủ 2',
      reopened !== 'ALREADY_OPEN' &&
        (
          await operations.listDisputes({
            campaignId: Live,
            contributionId: null,
            status: null,
          })
        ).length === 2,
    );

    // ── 8. Độ dài clip ────────────────────────────────────────────────────
    console.log('\n8. Độ dài clip');
    await sql(
      `UPDATE campaigns SET operation_stage = 'EVENT' WHERE global_id = $1`,
      [Live],
    );
    const clip = await events.reserveUpload({
      campaignId: Live,
      userId: Owner,
      mediaType: 'VIDEO',
      since: new Date(Date.now() - 3_600_000),
      quota: 5,
      durationSeconds: 45,
      sign: async () => ({ key: 'users/owner/campaign-media/clip-45.mp4' }),
    });
    const post = await events.createPost({
      campaignId: Live,
      authorId: Owner,
      authorRole: 'ORGANIZER',
      stage: 'EVENT',
      body: null,
      media: [
        {
          storageKey: 'users/owner/campaign-media/clip-45.mp4',
          publicUrl: 'https://cdn.test/clip-45.mp4',
          mediaType: 'VIDEO',
        },
      ],
    });
    check(
      'độ dài khai lúc ký đi theo media của bài; database chặn > 3600 giây',
      clip.status === 'RESERVED' &&
        post !== 'MEDIA_INVALID' &&
        post.media[0].durationSeconds === 45 &&
        (await rejects(() =>
          sql(
            `UPDATE campaign_post_uploads SET duration_seconds = 4000 WHERE storage_key = $1`,
            ['users/owner/campaign-media/clip-45.mp4'],
          ),
        )),
      post === 'MEDIA_INVALID' ? post : JSON.stringify(post.media),
    );
    const [maxConfig] = await sql(
      `SELECT value_json FROM system_configs WHERE config_key = 'charity.post_max_video_seconds'`,
    );
    check('cấu hình mặc định 60 giây', Number(maxConfig?.value_json) === 60);
    const beforeSummary = await events.summaryStartedAt(Live);
    await projects.moveStage({
      campaignId: Live,
      from: 'EVENT',
      to: 'SUMMARY',
      actorId: Owner,
      reason: 'Trao xong',
    });
    const [afterHours] = await sql(
      `SELECT value_json FROM system_configs WHERE config_key = 'charity.post_after_event_hours'`,
    );
    const startedAt = await events.summaryStartedAt(Live);
    check(
      'mốc sang Tổng kết đọc từ nhật ký giai đoạn; cửa sổ đăng sau sự kiện mặc định 72 giờ',
      beforeSummary === null &&
        startedAt !== null &&
        Math.abs(startedAt.getTime() - Date.now()) < 60_000 &&
        Number(afterHours?.value_json) === 72,
      String(startedAt),
    );

    // ── 9. Job dọn ảnh mồ côi giữ bằng chứng trao của chiến dịch ──────────
    console.log('\n9. Dọn ảnh mồ côi giữ bằng chứng trao');
    const liveEvidence: { value: string }[] = await sql(
      `SELECT jsonb_array_elements_text(distribution_evidence_urls) AS value
         FROM campaigns
        WHERE jsonb_typeof(distribution_evidence_urls) = 'array'`,
    );
    check(
      'nguồn key campaigns.distribution_evidence_urls trả bằng chứng đã chuyển lên chiến dịch',
      liveEvidence.some((row) => row.value === 'https://cdn.test/e1.jpg'),
      JSON.stringify(liveEvidence),
    );
    // ── 10. Hình thức trao cấp chiến dịch: công khai không lộ riêng tư ──────
    console.log('\n10. Hình thức trao cấp chiến dịch');
    await operations.saveDistribution({
      campaignId: Live,
      actorId: Owner,
      distribution: {
        distributionMethod: 'DIRECT_RECIPIENT',
        contributionTypes: ['MATERIAL'],
        serviceType: null,
        serviceChannel: null,
        privateDetails: {
          beneficiaryBankAccountId: null,
          recipientName: 'Bà Năm',
          recipientPhone: '0966554433',
          recipientAddress: 'Số 7 hẻm kín, ấp Hai',
          coordinatorName: 'Anh Tư',
          coordinatorPhone: '0900000004',
          carrier: null,
          shippingFeePayer: null,
          estimatedShippingFee: null,
          trackingCode: null,
          transferContent: null,
        },
      },
    });
    await operations.saveDistributionEvidence({
      campaignId: Live,
      actorId: Owner,
      evidenceUrls: ['https://cdn.test/live-evidence.jpg'],
    });
    const workspaceDistribution = await operations.getDistribution(Live);
    check(
      'workspace đọc lại đủ chi tiết riêng tư và bằng chứng',
      workspaceDistribution?.privateDetails.recipientPhone === '0966554433' &&
        workspaceDistribution.evidenceUrls[0] ===
          'https://cdn.test/live-evidence.jpg',
      JSON.stringify(workspaceDistribution),
    );
    const publicProject = await new GetCharityPublicProjectUseCase(
      campaigns,
      projects,
      engagement,
      events,
      new CharitySummaryRepository(dataSource.manager),
      operations,
    ).handle({ idOrSlug: 'cop-live', userId: null });
    const publicJson = JSON.stringify(publicProject);
    check(
      'bản công khai thật có hình thức + bằng chứng nhưng không có SĐT/địa chỉ người nhận',
      publicProject.distribution?.method === 'DIRECT_RECIPIENT' &&
        publicProject.distribution.evidenceUrls.length === 1 &&
        !publicJson.includes('0966554433') &&
        !publicJson.includes('Số 7 hẻm kín'),
      JSON.stringify(publicProject.distribution),
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
  console.log('\nDự án từ thiện đợt 5b/5c: mọi phép kiểm đạt');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
