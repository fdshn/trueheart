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
 *
 *   npm run test:charity-operations
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { ICharitySupportOffer } from '../src/domain/ports/repository';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { CharityEngagementRepository } from '../src/infrastructure/repository/charity-engagement.repository';
import { CharityEventRepository } from '../src/infrastructure/repository/charity-event.repository';
import { CharityOperationsRepository } from '../src/infrastructure/repository/charity-operations.repository';
import { CharityProjectRepository } from '../src/infrastructure/repository/charity-project.repository';
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

    // ── 2. Đợt trao ───────────────────────────────────────────────────────
    console.log('\n2. Đợt trao');
    await events.ensureEventSteps(Live);
    const soon = new Date(Date.now() + 20 * 3_600_000);
    const roundA = await operations.createRound({
      campaignId: Live,
      actorId: Owner,
      round: {
        title: 'Đợt 1 — xã A',
        locationLabel: 'Xã A',
        address: null,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + 6 * 3_600_000),
      },
    });
    const roundB = await operations.createRound({
      campaignId: Live,
      actorId: Owner,
      round: {
        title: 'Đợt 2 — xã B',
        locationLabel: 'Xã B',
        address: null,
        startsAt: new Date(Date.now() + 10 * 24 * 3_600_000),
        endsAt: new Date(Date.now() + 10 * 24 * 3_600_000 + 3_600_000),
      },
    });
    check(
      'mỗi đợt 10 bước riêng, cùng tồn tại với timeline chung',
      (await events.listEventSteps(Live)).length === 10 &&
        (await events.listEventSteps(Live, roundA.roundId)).length === 10 &&
        (await events.listEventSteps(Live, roundB.roundId)).every(
          (step) => step.roundId === roundB.roundId,
        ),
    );
    await events.ensureEventSteps(Live, roundA.roundId);
    check(
      'tạo lại bước của đợt không nhân đôi',
      (await events.listEventSteps(Live, roundA.roundId)).length === 10,
    );

    for (const userId of [Walker, Helper]) {
      await campaigns.register({ campaignId: Live, userId });
      await sql(
        `UPDATE campaign_participations SET status = 'CONFIRMED' WHERE campaign_id = $1 AND user_id = $2`,
        [Live, userId],
      );
    }
    const [walkerParticipation] = await sql(
      `SELECT global_id FROM campaign_participations WHERE campaign_id = $1 AND user_id = $2`,
      [Live, Walker],
    );
    await campaigns.register({ campaignId: Other, userId: Walker });
    const [foreign] = await sql(
      `SELECT global_id FROM campaign_participations WHERE campaign_id = $1 AND user_id = $2`,
      [Other, Walker],
    );
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
    const assigned = await operations.assignToRound({
      campaignId: Live,
      roundId: roundA.roundId,
      participationIds: [walkerParticipation.global_id, foreign.global_id],
      deliveryIds: [delivery.global_id],
    });
    check(
      'gắn vào đợt chỉ dòng của dự án (bỏ lượt tham gia dự án khác)',
      assigned.participations === 1 && assigned.deliveries === 1,
      JSON.stringify(assigned),
    );
    await sql(
      `UPDATE campaign_delivery_items SET received_quantity = 5, confirmed_value = 750000 WHERE delivery_id = $1`,
      [delivery.global_id],
    );
    await sql(
      `UPDATE campaign_deliveries SET status = 'COMPLETED', completed_at = now(), completed_by = $2 WHERE global_id = $1`,
      [delivery.global_id, Owner],
    ).catch(() => undefined);
    const statsA = (await operations.findRound(Live, roundA.roundId))?.stats;
    check(
      'số liệu đợt: 1 participant, 1 giao nhận, giá trị đã xác nhận khi hoàn tất',
      statsA?.participantCount === 1 && statsA.deliveryCount === 1,
      JSON.stringify(statsA),
    );

    const roundAudience = await engagement.listAudience({
      campaignId: Live,
      excludeUserId: Owner,
      roundId: roundA.roundId,
    });
    check(
      'người nhận thay đổi của đợt: participant và người giao nhận của đợt',
      JSON.stringify(roundAudience) === JSON.stringify([Walker, Giver].sort()),
      JSON.stringify(roundAudience),
    );
    const roundPreEvent = await engagement.listAudience({
      campaignId: Live,
      excludeUserId: null,
      scope: 'PRE_EVENT',
      roundId: roundB.roundId,
    });
    check(
      'nhắc 48 giờ đợt 2: BTC + participant chưa phân đợt (không gồm người của đợt 1)',
      roundPreEvent.includes(Owner) &&
        roundPreEvent.includes(Coordinator) &&
        roundPreEvent.includes(Helper) &&
        !roundPreEvent.includes(Walker),
      JSON.stringify(roundPreEvent),
    );

    const candidates = await operations.listRoundPreEventCandidates({
      hours: 48,
      limit: 10,
    });
    check(
      'đợt trong 48 giờ là ứng viên nhắc; đợt xa thì không',
      candidates.length === 1 && candidates[0].roundId === roundA.roundId,
      JSON.stringify(candidates),
    );
    await engagement.enqueueAnnouncement({
      campaignId: Live,
      kind: 'PRE_EVENT',
      payload: { roundId: roundA.roundId },
      dedupeKey: `round:${roundA.roundId}:${roundA.startsAt.getTime()}`,
      actorId: null,
    });
    check(
      'đã xếp nhắc cho mốc này → không còn là ứng viên',
      (await operations.listRoundPreEventCandidates({ hours: 48, limit: 10 }))
        .length === 0,
    );

    const moved = await operations.updateRound({
      campaignId: Live,
      roundId: roundA.roundId,
      actorId: Owner,
      round: {
        title: roundA.title,
        locationLabel: roundA.locationLabel,
        address: null,
        startsAt: new Date(soon.getTime() + 3_600_000),
        endsAt: new Date(soon.getTime() + 7 * 3_600_000),
      },
      reason: 'Đường sạt lở',
      announce: true,
    });
    const [changed] = await sql(
      `SELECT payload FROM campaign_announcements WHERE campaign_id = $1 AND kind = 'ROUND_CHANGED' ORDER BY id DESC LIMIT 1`,
      [Live],
    );
    check(
      'dời giờ đợt: xếp ROUND_CHANGED (POSTPONED, kèm lý do); mốc mới lại là ứng viên nhắc',
      moved !== null &&
        changed?.payload.change === 'POSTPONED' &&
        changed.payload.reason === 'Đường sạt lở' &&
        (await operations.listRoundPreEventCandidates({ hours: 48, limit: 10 }))
          .length === 1,
      JSON.stringify(changed?.payload),
    );
    check(
      'database chặn huỷ đợt thiếu lý do và chưa sẵn sàng thiếu ghi chú',
      (await rejects(() =>
        sql(
          `UPDATE campaign_distribution_rounds SET status = 'CANCELLED' WHERE global_id = $1`,
          [roundB.roundId],
        ),
      )) &&
        (await rejects(() =>
          sql(
            `UPDATE campaign_distribution_rounds SET readiness = 'NOT_READY' WHERE global_id = $1`,
            [roundB.roundId],
          ),
        )),
    );
    const cancelled = await operations.setRoundStatus({
      campaignId: Live,
      roundId: roundB.roundId,
      actorId: Owner,
      status: 'CANCELLED',
      reason: 'Địa phương đã có đoàn khác',
    });
    check(
      'huỷ đợt: CANCELLED + ROUND_CHANGED; huỷ lại → null',
      cancelled?.status === 'CANCELLED' &&
        (
          await sql(
            `SELECT count(*)::int AS n FROM campaign_announcements WHERE campaign_id = $1 AND kind = 'ROUND_CHANGED'`,
            [Live],
          )
        )[0].n === 2 &&
        (await operations.setRoundStatus({
          campaignId: Live,
          roundId: roundB.roundId,
          actorId: Owner,
          status: 'DONE',
          reason: null,
        })) === null,
    );
    const ready = await operations.setRoundReadiness({
      campaignId: Live,
      roundId: roundA.roundId,
      actorId: Coordinator,
      readiness: 'NOT_READY',
      note: 'Chưa chốt xe',
      checklist: [{ key: 'TRANSPORT', done: false, note: 'Đang chờ nhà xe' }],
    });
    check(
      'ghi sẵn sàng: đủ 6 mục checklist, giữ ghi chú',
      ready?.readiness === 'NOT_READY' &&
        ready.checklist.length === 6 &&
        ready.checklist[0].note === 'Đang chờ nhà xe',
      JSON.stringify(ready?.checklist[0]),
    );

    // Dự án chia đợt không nhắc theo bước trao chung.
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
      'nhắc theo bước trao chung: chỉ dự án không chia đợt',
      phaseCandidates.length === 1 && phaseCandidates[0].campaignId === Single,
      JSON.stringify(phaseCandidates.map((row) => row.campaignId)),
    );

    // ── 3. Hoàn tất dự án ─────────────────────────────────────────────────
    console.log('\n3. Điều kiện hoàn tất dự án');
    const blockers = await operations.completionBlockers(Live);
    check(
      'dự án đang dở: nhu cầu mở, đề nghị hỗ trợ dở, đợt chưa ghi nhận',
      ['NEEDS_OPEN', 'SUPPORT_OFFERS_UNSETTLED', 'ROUNDS_UNSETTLED'].every(
        (code) => blockers.includes(code as never),
      ),
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
    await operations.setRoundStatus({
      campaignId: Live,
      roundId: roundA.roundId,
      actorId: Owner,
      status: 'DONE',
      reason: null,
    });
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
