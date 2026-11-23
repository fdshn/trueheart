/**
 * Dự án từ thiện 4 giai đoạn — đợt 4b — trên Postgres THẬT
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.9, §3.16).
 *
 * - Hoàn tất giao nhận ghi giá trị xác nhận: số ban tổ chức nhập, hoặc thực nhận × đơn giá.
 * - Điểm theo giá trị: rule TẮT thì không mở award; bật thì 1 điểm / 10.000đ.
 * - Trần: vướng trần thì HOÃN (không bỏ), bỏ trần thì job ghi tiếp; hai award song song không
 *   cùng lọt trần; ghi lại không sinh bút toán đôi.
 * - Chấm lại thấp hơn → bút toán trừ ngay; bài bị ẩn → điểm về 0.
 * - Khiếu nại: một mỗi đối tượng, chuyển trạng thái có điều kiện, nhật ký append-only, quá hạn,
 *   người vận hành khác, số liệu cho Admin.
 *
 *   npm run test:charity-points
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { CharityPointsService } from '../src/application/implementations/charity-project/charity-points.service';
import { GetPointFeedUseCase } from '../src/application/implementations/point/get-point-feed.use-case';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityAppealRepository } from '../src/infrastructure/repository/charity-appeal.repository';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { CharityPointsRepository } from '../src/infrastructure/repository/charity-points.repository';
import {
  PointFeedRepository,
  pointFeedListSql,
} from '../src/infrastructure/repository/point-feed.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_points_check';
const id = (tail: string) => `7f000000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Coordinator = id('02');
const Giver = id('03');
const Walker = id('04');
const Live = id('10');
const Other = id('11');

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
    const ledger = new PointLedgerRepository(dataSource.manager);
    const pointsRepo = new CharityPointsRepository(dataSource.manager, ledger);
    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const service = new CharityPointsService(pointsRepo, adminConfig);
    const campaigns = new CharityCampaignRepository(dataSource.manager, ledger);
    const appeals = new CharityAppealRepository(dataSource.manager);

    for (const [userId, username] of [
      [Owner, 'cpt_owner'],
      [Coordinator, 'cpt_coord'],
      [Giver, 'cpt_giver'],
      [Walker, 'cpt_walker'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    for (const [campaignId, slug] of [
      [Live, 'cpt-live'],
      [Other, 'cpt-other'],
    ])
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage)
         VALUES ($1, 'Dự án kiểm', $2, 'Mô tả đủ dài cho dự án kiểm', 'https://cdn.test/a.jpg',
                 'Ấm', now() - interval '10 days', now() + interval '20 days', $3, 'APPROVED',
                 now(), $3, now(), 'SUMMARY')`,
        [campaignId, slug, Owner],
      );
    const setConfig = (key: string, value: number) =>
      sql(
        `UPDATE system_configs SET value_json = $2::jsonb WHERE config_key = $1`,
        [key, String(value)],
      );
    const setRule = (code: string, enabled: boolean) =>
      sql(`UPDATE point_rules SET is_enabled = $2 WHERE code = $1`, [
        code,
        enabled,
      ]);
    const ledgerFor = async (rule: string) =>
      (
        await sql(
          `SELECT COALESCE(SUM(delta), 0)::int AS total, count(*)::int AS rows
           FROM point_ledger WHERE rule_code = $1`,
          [rule],
        )
      )[0] as { total: number; rows: number };

    // Một lượt giao nhận ACCEPTED hai dòng, dựng thẳng bằng SQL.
    const makeDelivery = async (campaignId: string, tag: string) => {
      const needs: string[] = [];
      for (const [name, price] of [
        [`Áo ${tag}`, null],
        [`Chăn ${tag}`, 20_000],
      ] as const) {
        const [need] = await sql(
          `INSERT INTO campaign_need_items
             (campaign_id, item_name, unit, target_quantity, accepted_quantity, unit_price)
           VALUES ($1, $2, 'cái', 100, 10, $3) RETURNING global_id`,
          [campaignId, name, price],
        );
        needs.push(need.global_id);
      }
      const [contribution] = await sql(
        `INSERT INTO campaign_contributions (campaign_id, contributor_id, status)
         VALUES ($1, $2, 'PENDING_REVIEW') RETURNING global_id`,
        [campaignId, Giver],
      );
      const items: string[] = [];
      for (const need of needs) {
        const [item] = await sql(
          `INSERT INTO campaign_contribution_items
             (contribution_id, need_item_id, offered_quantity, accepted_quantity)
           VALUES ($1, $2, 10, 10) RETURNING global_id`,
          [contribution.global_id, need],
        );
        items.push(item.global_id);
      }
      await sql(
        `UPDATE campaign_contributions SET status = 'ACCEPTED', decided_at = now(), decided_by = $2
         WHERE global_id = $1`,
        [contribution.global_id, Owner],
      );
      const [delivery] = await sql(
        `INSERT INTO campaign_deliveries (campaign_id, contribution_id, contributor_id, organizer_id)
         VALUES ($1, $2, $3, $4) RETURNING global_id`,
        [campaignId, contribution.global_id, Giver, Owner],
      );
      for (const [index, need] of needs.entries())
        await sql(
          `INSERT INTO campaign_delivery_items
             (delivery_id, contribution_item_id, need_item_id, accepted_quantity)
           VALUES ($1, $2, $3, 10)`,
          [delivery.global_id, items[index], need],
        );
      return { deliveryId: delivery.global_id as string, needs };
    };

    // ── 1. Giá trị xác nhận ──────────────────────────────────────────────
    console.log('1. Giá trị xác nhận khi hoàn tất giao nhận');
    const first = await makeDelivery(Live, 'A');
    await campaigns.completeDelivery({
      deliveryId: first.deliveryId,
      organizerId: Owner,
      received: [
        {
          needItemId: first.needs[0],
          receivedQuantity: 8,
          confirmedValue: 1_500_000,
        },
        { needItemId: first.needs[1], receivedQuantity: 5 },
      ],
    });
    const values = await sql(
      `SELECT confirmed_value::int AS value FROM campaign_delivery_items
       WHERE delivery_id = $1 ORDER BY id`,
      [first.deliveryId],
    );
    const delivery = await pointsRepo.deliveryValue(first.deliveryId);
    check(
      'dòng có nhập → đúng số nhập; dòng bỏ trống → thực nhận × đơn giá; tổng 1.600.000',
      values[0].value === 1_500_000 &&
        values[1].value === 100_000 &&
        delivery?.confirmedValue === 1_600_000,
      JSON.stringify(values),
    );

    // ── 2. Điểm theo giá trị ─────────────────────────────────────────────
    console.log('\n2. Điểm theo giá trị vật phẩm');
    await service.awardItemValue(first.deliveryId);
    check(
      'rule đang TẮT (mặc định) → không mở award',
      (
        await pointsRepo.findAwards({
          referenceType: 'CHARITY_DELIVERY',
          referenceId: first.deliveryId,
        })
      ).length === 0,
    );
    await setRule('CHARITY_ITEM_VALUE', true);
    await service.awardItemValue(first.deliveryId);
    await service.awardItemValue(first.deliveryId);
    const itemLedger = await ledgerFor('CHARITY_ITEM_VALUE');
    check(
      'bật rule → 160 điểm (1 / 10.000đ); gọi hai lần vẫn một bút toán',
      itemLedger.total === 160 && itemLedger.rows === 1,
      JSON.stringify(itemLedger),
    );
    await pointsRepo.setDeliveryAdjustedValue({
      deliveryId: first.deliveryId,
      value: 2_000_000,
    });
    await service.awardItemValue(first.deliveryId);
    const adjusted = await ledgerFor('CHARITY_ITEM_VALUE');
    check(
      'điều chỉnh giá trị lên 2.000.000 → bút toán chênh +40, không sửa bút toán cũ',
      adjusted.total === 200 && adjusted.rows === 2,
      JSON.stringify(adjusted),
    );
    const second = await makeDelivery(Live, 'B');
    await campaigns.completeDelivery({
      deliveryId: second.deliveryId,
      organizerId: Owner,
      received: second.needs.map((needItemId) => ({
        needItemId,
        receivedQuantity: 10,
        confirmedValue: 300_000,
      })),
    });
    const missing = await pointsRepo.listDeliveriesWithoutAward(30, 10);
    check(
      'job thấy lượt giao nhận chưa có award (khoảng hở sau commit)',
      missing.includes(second.deliveryId) &&
        !missing.includes(first.deliveryId),
    );

    // ── 3. Trần: hoãn chứ không bỏ ───────────────────────────────────────
    console.log('\n3. Trần điểm — hoãn chứ không bỏ');
    await setRule('CHARITY_PARTICIPATION', true);
    await setConfig('charity.points_cap.charity_participation.daily', 50);
    await service.awardParticipation({
      campaignId: Live,
      participantId: Walker,
      completionScore: 80,
    });
    await service.awardParticipation({
      campaignId: Other,
      participantId: Walker,
      completionScore: 40,
    });
    let participation = await ledgerFor('CHARITY_PARTICIPATION');
    const pending = await pointsRepo.listUnsettled(10);
    check(
      'trần ngày 50: lượt 80 ghi 50 (hoãn 30), lượt 40 hoãn cả; vẫn nằm chờ',
      participation.total === 50 &&
        pending.filter((award) => award.ruleCode === 'CHARITY_PARTICIPATION')
          .length === 2,
      JSON.stringify(participation),
    );
    await setConfig('charity.points_cap.charity_participation.daily', 0);
    const settled = await service.settlePending(50);
    participation = await ledgerFor('CHARITY_PARTICIPATION');
    check(
      'bỏ trần → job ghi tiếp đủ 120; vá luôn award giao nhận còn thiếu',
      participation.total === 120 &&
        settled.backfilled >= 1 &&
        (await ledgerFor('CHARITY_ITEM_VALUE')).total === 260,
      JSON.stringify(settled),
    );
    await service.awardParticipation({
      campaignId: Live,
      participantId: Walker,
      completionScore: 60,
    });
    participation = await ledgerFor('CHARITY_PARTICIPATION');
    const [negative] = await sql(
      `SELECT delta FROM point_ledger WHERE rule_code = 'CHARITY_PARTICIPATION' ORDER BY id DESC LIMIT 1`,
    );
    check(
      'chấm lại 80 → 60: bút toán −20 ghi ngay (không vướng trần)',
      participation.total === 100 && negative.delta === -20,
      JSON.stringify(participation),
    );

    // ── 4. Song song dưới trần ───────────────────────────────────────────
    console.log('\n4. Hai award song song cùng trần');
    await setConfig('charity.points_cap.charity_participation.project', 0);
    await setConfig('charity.points_cap.charity_participation.daily', 130);
    const racers = await Promise.all(
      [Live, Other].map((campaignId, index) =>
        pointsRepo.upsertAward({
          campaignId,
          userId: Giver,
          ruleCode: 'CHARITY_PARTICIPATION',
          referenceType: 'CHARITY_PARTICIPATION',
          referenceId: `${campaignId}:${Giver}:${index}`,
          targetPoints: 100,
          reason: 'Song song',
        }),
      ),
    );
    const caps = await service.caps('CHARITY_PARTICIPATION');
    await Promise.all(
      racers.map((award) =>
        pointsRepo.settle({
          awardId: award.awardId,
          caps,
          dayStart: new Date(Date.now() - 3_600_000),
        }),
      ),
    );
    const [{ giver_total: giverTotal }] = await sql(
      `SELECT COALESCE(SUM(delta), 0)::int AS giver_total FROM point_ledger
       WHERE rule_code = 'CHARITY_PARTICIPATION' AND user_id = $1`,
      [Giver],
    );
    check(
      'trần ngày 130, hai award 100 song song → tổng đúng 130',
      giverTotal === 130,
      `total=${giverTotal}`,
    );

    // ── 5. Bài bị ẩn → điểm về 0 ─────────────────────────────────────────
    console.log('\n5. Bài ảnh/clip bị ẩn');
    await setRule('CHARITY_POST_IMAGE', true);
    const [post] = await sql(
      `INSERT INTO campaign_posts (campaign_id, author_id, author_role, stage, body)
       VALUES ($1, $2, 'PARTICIPANT', 'EVENT', 'Ảnh') RETURNING global_id`,
      [Live, Walker],
    );
    await service.awardPost({
      postId: post.global_id,
      campaignId: Live,
      authorId: Walker,
      videoCount: 0,
      imageCount: 2,
    });
    const imageBefore = (await ledgerFor('CHARITY_POST_IMAGE')).total;
    await sql(
      `UPDATE campaign_posts SET hidden_at = now(), hidden_reason = 'Vi phạm' WHERE global_id = $1`,
      [post.global_id],
    );
    await service.settlePending(50);
    const imageAfter = (await ledgerFor('CHARITY_POST_IMAGE')).total;
    check(
      '2 ảnh × 2 điểm (chốt 05/11, không hệ số) = 4; bị ẩn → job trừ về 0',
      imageBefore === 4 && imageAfter === 0,
      `before=${imageBefore} after=${imageAfter}`,
    );

    // ── 6. Khiếu nại ─────────────────────────────────────────────────────
    console.log('\n6. Khiếu nại');
    const [evaluation] = await sql(
      `INSERT INTO campaign_participant_evaluations
         (campaign_id, participant_id, completion_score, evaluated_by)
       VALUES ($1, $2, 60, $3) RETURNING global_id`,
      [Live, Walker, Owner],
    );
    const target = await appeals.findEvaluationTarget(evaluation.global_id);
    check(
      'đối tượng khiếu nại: lần chấm hiện hành',
      target?.isLatest === true && target.completionScore === 60,
    );
    const appeal = await appeals.create({
      campaignId: Live,
      appellantId: Walker,
      targetType: 'EVALUATION',
      targetId: evaluation.global_id,
      originalValue: 60,
      requestedValue: 90,
      description: 'Tôi có mặt từ đầu tới cuối',
      evidenceUrls: [],
      organizerDueAt: new Date(Date.now() - 1000),
    });
    const duplicate = await appeals.create({
      campaignId: Live,
      appellantId: Walker,
      targetType: 'EVALUATION',
      targetId: evaluation.global_id,
      originalValue: 60,
      requestedValue: 90,
      description: 'Gửi lần hai',
      evidenceUrls: [],
      organizerDueAt: new Date(),
    });
    check(
      'một khiếu nại mỗi đối tượng',
      appeal !== 'DUPLICATED' && duplicate === 'DUPLICATED',
    );
    const appealId = (appeal as { appealId: string }).appealId;
    check(
      'quá hạn tầng 1 nằm trong danh sách job',
      (await appeals.listOverdue(new Date(), 10)).some(
        (row) => row.appealId === appealId,
      ),
    );
    const [moved, stale] = await Promise.all(
      [1, 2].map(() =>
        appeals.transition({
          appealId,
          expected: 'ORGANIZER_REVIEW',
          next: 'AWAITING_APPELLANT',
          action: 'ORGANIZER_ADJUST',
          actorId: Owner,
          value: 85,
          reason: 'Đối chiếu điểm danh',
          organizerDecision: 'ADJUST',
          appellantDueAt: new Date(Date.now() + 86_400_000),
        }),
      ),
    );
    check(
      'hai người cùng xét → đúng một lượt thắng',
      [moved, stale].filter(Boolean).length === 1,
    );
    const closed = await appeals.transition({
      appealId,
      expected: 'AWAITING_APPELLANT',
      next: 'CLOSED',
      action: 'APPELLANT_ACCEPT',
      actorId: Walker,
      value: null,
      reason: null,
      outcome: 'ADJUSTED_ACCEPTED',
    });
    const events = await appeals.listEvents(appealId);
    check(
      'chấp nhận → đóng có kết quả; nhật ký SUBMIT → ADJUST → ACCEPT',
      closed?.status === 'CLOSED' &&
        closed.outcome === 'ADJUSTED_ACCEPTED' &&
        closed.organizerValue === 85 &&
        events.map((event) => event.action).join() ===
          'SUBMIT,ORGANIZER_ADJUST,APPELLANT_ACCEPT',
    );
    let appendOnly = false;
    try {
      await sql(`DELETE FROM campaign_appeal_events WHERE appeal_id = $1`, [
        appealId,
      ]);
    } catch {
      appendOnly = true;
    }
    check('nhật ký khiếu nại append-only', appendOnly);
    let closedGuard = false;
    try {
      await sql(
        `UPDATE campaign_appeals SET status = 'CLOSED', outcome = NULL WHERE global_id = $1`,
        [appealId],
      );
    } catch {
      closedGuard = true;
    }
    check('database chặn CLOSED thiếu kết quả', closedGuard);
    await sql(
      `INSERT INTO campaign_coordinators (campaign_id, user_id, granted_by) VALUES ($1, $2, $1::text::uuid)`,
      [Live, Coordinator],
    ).catch(() =>
      sql(
        `INSERT INTO campaign_coordinators (campaign_id, user_id, granted_by) VALUES ($1, $2, $3)`,
        [Live, Coordinator, Owner],
      ),
    );
    check(
      'người vận hành khác: chủ thấy 1 (coordinator), dự án không coordinator thấy 0',
      (await appeals.countOtherOperators(Live, Owner)) === 1 &&
        (await appeals.countOtherOperators(Other, Owner)) === 0,
    );
    const adminView = await appeals.listForAdmin({
      status: null,
      limit: 10,
      offset: 0,
    });
    check(
      'hàng đợi Admin có số lần ban tổ chức bị khiếu nại thành công',
      adminView[0]?.organizerOverturnedCount === 1 &&
        adminView[0].appellantRejectedCount === 0,
      JSON.stringify(adminView[0]),
    );

    // ── 7. Migration 1804300000000: hệ số thưởng, cặp award thưởng ───────
    console.log('\n7. Ràng buộc hệ số thưởng và award thưởng (CR 22/11/2026)');
    const rejected = async (query: string, params: unknown[]) =>
      sql(query, params).then(
        () => 'nhận',
        (error: Error) => error.message,
      );
    const bonusPercent30 = await rejected(
      `UPDATE campaigns SET point_bonus_percent = 30 WHERE global_id = $1`,
      [Live],
    );
    check(
      'point_bonus_percent = 30 bị CHECK chặn',
      bonusPercent30.includes('check constraint'),
      bonusPercent30,
    );
    const bonusWithoutBase = await rejected(
      `INSERT INTO campaign_point_awards
         (campaign_id, user_id, rule_code, reference_type, reference_id, target_points, reason)
       VALUES ($1, $2, 'CHARITY_CAMPAIGN_BONUS', 'CHARITY_PARTICIPATION', 'x:1', 5, 'thử')`,
      [Live, Walker],
    );
    check(
      'award thưởng thiếu base_award_id bị chặn',
      bonusWithoutBase.includes('CHK_campaign_point_awards_bonus_base'),
      bonusWithoutBase,
    );
    const [anyBase] = await sql(
      `SELECT global_id FROM campaign_point_awards
        WHERE rule_code <> 'CHARITY_CAMPAIGN_BONUS' ORDER BY id LIMIT 1`,
    );
    const baseWithBase = await rejected(
      `INSERT INTO campaign_point_awards
         (campaign_id, user_id, rule_code, reference_type, reference_id, target_points, reason,
          base_award_id)
       VALUES ($1, $2, 'CHARITY_PARTICIPATION', 'CHARITY_PARTICIPATION', 'x:2', 5, 'thử', $3)`,
      [Live, Walker, anyBase?.global_id ?? null],
    );
    check(
      'award gốc mang base_award_id bị chặn',
      baseWithBase.includes('CHK_campaign_point_awards_bonus_base'),
      baseWithBase,
    );

    // ── 8. Thưởng hệ số đi cặp với điểm gốc, chung trần (CR 22/11/2026) ────
    console.log('\n8. Bút toán thưởng hệ số chiến dịch');
    const BonusCamp = id('20');
    const ZeroCamp = id('21');
    const [U1, U2, U3, U6, U7] = ['41', '42', '43', '46', '47'].map(id);
    for (const [userId, username] of [
      [U1, 'cpt_u1'],
      [U2, 'cpt_u2'],
      [U3, 'cpt_u3'],
      [U6, 'cpt_u6'],
      [U7, 'cpt_u7'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId, username],
      );
    for (const [campaignId, slug, percent] of [
      [BonusCamp, 'cpt-bonus', 50],
      [ZeroCamp, 'cpt-zero', 0],
    ] as const)
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at,
            operation_stage, point_bonus_percent, requested_point_bonus_percent)
         VALUES ($1, 'Dự án thưởng', $2, 'Mô tả đủ dài cho dự án kiểm',
                 'https://cdn.test/a.jpg', now() - interval '10 days',
                 now() + interval '20 days', $3, 'APPROVED', now(), $3, now(), 'SUMMARY',
                 $4, $4)`,
        [campaignId, slug, Owner, percent],
      );
    const CapKey = 'charity.points_cap.charity_participation.daily';
    await setRule('CHARITY_PARTICIPATION', true);
    await setConfig(CapKey, 0);
    const entriesOf = async (userId: string) =>
      (await sql(
        `SELECT id::int AS id, rule_code, delta, reference_type, reference_id,
                xmin::text AS tx
           FROM point_ledger WHERE user_id = $1 ORDER BY id`,
        [userId],
      )) as {
        id: number;
        rule_code: string;
        delta: number;
        reference_type: string;
        reference_id: string;
        tx: string;
      }[];
    const sumOf = (
      rows: { rule_code: string; delta: number }[],
      rule: string,
    ) =>
      rows
        .filter((row) => row.rule_code === rule)
        .reduce((total, row) => total + row.delta, 0);
    const score = (
      userId: string,
      completionScore: number,
      campaignId = BonusCamp,
    ) =>
      service.awardParticipation({
        campaignId,
        participantId: userId,
        completionScore,
      });

    await score(U1, 15);
    let rows = await entriesOf(U1);
    const baseEntry = rows.find(
      (row) => row.rule_code === 'CHARITY_PARTICIPATION',
    );
    const bonusEntry = rows.find(
      (row) => row.rule_code === 'CHARITY_CAMPAIGN_BONUS',
    );
    check(
      'hệ số 50, điểm gốc 15 → hai bút toán 15 và 7; thưởng trỏ POINT_LEDGER = id bút toán gốc, cùng transaction',
      baseEntry?.delta === 15 &&
        bonusEntry?.delta === 7 &&
        bonusEntry.reference_type === 'POINT_LEDGER' &&
        bonusEntry.reference_id === String(baseEntry.id) &&
        bonusEntry.tx === baseEntry.tx,
      JSON.stringify(rows),
    );

    await sql(
      `UPDATE campaigns SET point_bonus_percent = 100 WHERE global_id = $1`,
      [BonusCamp],
    );
    await service.settlePending(100);
    rows = await entriesOf(U1);
    check(
      'đổi hệ số 50→100 sau khi ghi → bút toán cũ không đổi',
      sumOf(rows, 'CHARITY_CAMPAIGN_BONUS') === 7 && rows.length === 2,
      JSON.stringify(rows),
    );
    await sql(
      `UPDATE campaigns SET point_bonus_percent = 50 WHERE global_id = $1`,
      [BonusCamp],
    );

    await score(U1, 0);
    rows = await entriesOf(U1);
    check(
      'chấm lại về 0 → bút toán gốc −15 và thưởng −7',
      sumOf(rows, 'CHARITY_PARTICIPATION') === 0 &&
        sumOf(rows, 'CHARITY_CAMPAIGN_BONUS') === 0 &&
        rows.some((row) => row.delta === -15) &&
        rows.some((row) => row.delta === -7),
      JSON.stringify(rows.map((row) => [row.rule_code, row.delta])),
    );

    await setConfig(CapKey, 20);
    await score(U2, 15);
    rows = await entriesOf(U2);
    const [u2Bonus] = await sql(
      `SELECT bonus.target_points, bonus.applied_points
         FROM campaign_point_awards bonus
         JOIN campaign_point_awards base ON base.global_id = bonus.base_award_id
        WHERE base.user_id = $1`,
      [U2],
    );
    check(
      'trần ngày 20, gốc 15 hệ số 50 → gốc 15, thưởng 5, phần thưởng còn 2 hoãn',
      sumOf(rows, 'CHARITY_PARTICIPATION') === 15 &&
        sumOf(rows, 'CHARITY_CAMPAIGN_BONUS') === 5 &&
        u2Bonus?.target_points === 7 &&
        u2Bonus?.applied_points === 5,
      JSON.stringify({ rows, u2Bonus }),
    );

    await setConfig(CapKey, 10);
    await score(U3, 15);
    rows = await entriesOf(U3);
    check(
      'trần ngày 10, gốc 15 → gốc 10 hoãn 5, thưởng 0',
      sumOf(rows, 'CHARITY_PARTICIPATION') === 10 &&
        sumOf(rows, 'CHARITY_CAMPAIGN_BONUS') === 0,
      JSON.stringify(rows),
    );
    await setConfig(CapKey, 0);
    await service.settlePending(100);
    rows = await entriesOf(U3);
    const u2After = await entriesOf(U2);
    check(
      'nâng trần → job ghi gốc 5 rồi thưởng (U3 gốc 15 + thưởng 7; U2 phần thưởng hoãn 2 cũng được ghi)',
      sumOf(rows, 'CHARITY_PARTICIPATION') === 15 &&
        sumOf(rows, 'CHARITY_CAMPAIGN_BONUS') === 7 &&
        sumOf(u2After, 'CHARITY_CAMPAIGN_BONUS') === 7,
      JSON.stringify({
        u3: rows.map((row) => [row.rule_code, row.delta]),
        u2: u2After.map((row) => [row.rule_code, row.delta]),
      }),
    );
    const remainder = u2After.filter(
      (row) => row.rule_code === 'CHARITY_CAMPAIGN_BONUS',
    );
    const u2Base = u2After.find(
      (row) => row.rule_code === 'CHARITY_PARTICIPATION',
    );
    check(
      'phần thưởng hoãn ghi riêng vẫn trỏ bút toán gốc mới nhất của award gốc',
      remainder.length === 2 &&
        remainder.every((row) => row.reference_id === String(u2Base?.id)),
      JSON.stringify(remainder),
    );

    await sql(
      `INSERT INTO campaign_participations
         (campaign_id, user_id, status, role, checked_in_at, checked_in_by)
       VALUES ($1, $2, 'CHECKED_IN', 'SUPERVISOR', now(), $3)`,
      [BonusCamp, U6, Owner],
    );
    await score(U6, 40);
    rows = await entriesOf(U6);
    check(
      'giám sát viên được chấm mức hoàn thành → CHARITY_PARTICIPATION + thưởng',
      sumOf(rows, 'CHARITY_PARTICIPATION') === 40 &&
        sumOf(rows, 'CHARITY_CAMPAIGN_BONUS') === 20,
      JSON.stringify(rows),
    );

    await score(U7, 40, ZeroCamp);
    const [{ n: zeroBonusAwards }] = await sql(
      `SELECT count(*)::int AS n FROM campaign_point_awards
        WHERE user_id = $1 AND rule_code = 'CHARITY_CAMPAIGN_BONUS'`,
      [U7],
    );
    check(
      'hệ số 0 → không tạo award thưởng',
      zeroBonusAwards === 0 &&
        sumOf(await entriesOf(U7), 'CHARITY_PARTICIPATION') === 40,
      String(zeroBonusAwards),
    );

    await setRule('CHARITY_CONTRIBUTION_COMPLETED', true);
    const bonusDelivery = await makeDelivery(BonusCamp, 'T');
    await campaigns.completeDelivery({
      deliveryId: bonusDelivery.deliveryId,
      organizerId: Owner,
      received: bonusDelivery.needs.map((needItemId) => ({
        needItemId,
        receivedQuantity: 1,
      })),
    });
    const [contributionEntry] = await sql(
      `SELECT entry.id::int AS id, entry.delta, entry.xmin::text AS tx
         FROM point_ledger entry
         JOIN campaign_deliveries delivery
           ON delivery.contribution_id::text = entry.reference_id
        WHERE entry.rule_code = 'CHARITY_CONTRIBUTION_COMPLETED' AND delivery.global_id = $1`,
      [bonusDelivery.deliveryId],
    );
    const [contributionBonus] = await sql(
      `SELECT delta, xmin::text AS tx FROM point_ledger
        WHERE rule_code = 'CHARITY_CAMPAIGN_BONUS' AND reference_type = 'POINT_LEDGER'
          AND reference_id = $1`,
      [String(contributionEntry?.id ?? -1)],
    );
    check(
      'đóng góp hoàn tất ở chiến dịch hệ số 50 → +10 và thưởng +5 trỏ bút toán gốc, cùng transaction',
      contributionEntry?.delta === 10 &&
        contributionBonus?.delta === 5 &&
        contributionBonus.tx === contributionEntry.tx,
      JSON.stringify({ contributionEntry, contributionBonus }),
    );

    // ── 9. Bảng tin điểm (CR 22/11/2026, Review Focus 3) ───────────────────
    console.log(
      '\n9. Bảng tin điểm: gộp thưởng, loại phạt/điều chỉnh, không lộ lý do',
    );
    const [FeedU, FeedViewer, FeedSuspended] = ['51', '52', '53'].map(id);
    for (const [userId, username] of [
      [FeedU, 'cpt_feed_u'],
      [FeedViewer, 'cpt_feed_viewer'],
      [FeedSuspended, 'cpt_feed_suspended'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status, full_name)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', 'Người Thử')`,
        [userId, username],
      );
    await score(FeedU, 60);
    const adjust = (
      userId: string,
      ruleCode: string,
      delta: number,
      reason: string,
      tag: string,
    ) =>
      ledger.appendAdjustment({
        userId,
        ruleCode,
        delta,
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId: `ref-${tag}-bi-mat`,
        idempotencyKey: `feed-check:${tag}`,
        actor: Owner,
        source: 'ADMIN',
        reason,
      });
    await adjust(FeedU, 'ADMIN_ADJUSTMENT', 50, 'Bù lỗi hệ thống XYZ', 'adj');
    await adjust(
      FeedU,
      'CONTENT_VIOLATION_PENALTY',
      -20,
      'Đăng nội dung cấm',
      'pen',
    );
    await adjust(FeedU, 'REVERSAL', 20, 'Hoàn phạt vì nhầm', 'rev');
    await adjust(FeedU, 'CHECK_IN_DAILY', 5, 'Điểm danh', 'chk');
    await adjust(
      FeedSuspended,
      'CHECK_IN_STREAK_MILESTONE',
      40,
      'Mốc 7 ngày',
      'sus',
    );
    await sql(
      `UPDATE users SET suspended_until = now() + interval '3 days' WHERE global_id = $1`,
      [FeedSuspended],
    );
    const noCache = { read: async () => null, write: async () => undefined };
    const noThrottle = {
      assertWithinLimit: async () => undefined,
      registerHit: async () => undefined,
    };
    const feedRepository = new PointFeedRepository(dataSource.manager);
    const feedUseCase = new GetPointFeedUseCase(
      feedRepository,
      noCache,
      noThrottle,
      adminConfig,
      ledger,
    );
    const general = await feedUseCase.handle({
      viewerId: FeedViewer,
      userId: null,
      afterId: null,
      limit: 50,
    });
    const mine = general.entries.filter((entry) => entry.user.userId === FeedU);
    check(
      'feed chung (ngưỡng 10): đúng một dòng của U — delta 90, bonusPercent 50, tiêu đề tham gia',
      mine.length === 1 &&
        mine[0].delta === 90 &&
        mine[0].bonusPercent === 50 &&
        mine[0].ruleTitle === 'Tham gia dự án từ thiện' &&
        mine[0].context?.type === 'CHARITY_CAMPAIGN',
      JSON.stringify(mine),
    );
    const generalJson = JSON.stringify(general);
    check(
      'JSON không có lý do XYZ, id tham chiếu, rule_code hay reason',
      !generalJson.includes('XYZ') &&
        !generalJson.includes('bi-mat') &&
        !generalJson.includes('rule_code') &&
        !generalJson.includes('ruleCode') &&
        !generalJson.includes('reason') &&
        !generalJson.includes('CHARITY_POINT_AWARD'),
    );
    const own = await feedUseCase.handle({
      viewerId: FeedU,
      userId: FeedU,
      afterId: null,
      limit: 50,
    });
    check(
      'CHECK_IN_DAILY +5 không có ở feed chung nhưng có ở feed của chính U; phạt/điều chỉnh/đảo không có ở đâu',
      !general.entries.some(
        (entry) => entry.user.userId === FeedU && entry.delta === 5,
      ) &&
        own.entries.some(
          (entry) => entry.ruleTitle === 'Điểm danh hằng ngày',
        ) &&
        !JSON.stringify(own).includes('XYZ') &&
        own.entries.length === 2,
      JSON.stringify(
        own.entries.map((entry) => [entry.ruleTitle, entry.delta]),
      ),
    );
    check(
      'người bị khoá (suspended_until tương lai) → không có trên feed chung',
      !general.entries.some((entry) => entry.user.userId === FeedSuspended),
    );
    await sql(
      `UPDATE users SET show_in_public_point_feed = false WHERE global_id = $1`,
      [FeedU],
    );
    const hidden = await feedUseCase.handle({
      viewerId: FeedViewer,
      userId: null,
      afterId: null,
      limit: 50,
    });
    let hiddenError: string | null = null;
    try {
      await feedUseCase.handle({
        viewerId: FeedViewer,
        userId: FeedU,
        afterId: null,
        limit: 50,
      });
    } catch (error) {
      hiddenError = (error as Error).constructor.name;
    }
    check(
      'U tắt cờ → vắng khỏi feed chung; người khác xem feed của U → 404',
      !hidden.entries.some((entry) => entry.user.userId === FeedU) &&
        hiddenError === 'UserNotFoundException',
      String(hiddenError),
    );
    const afterFirst = await feedUseCase.handle({
      viewerId: FeedViewer,
      userId: null,
      afterId: general.latestId,
      limit: 50,
    });
    check(
      'afterId = latestId → không có gì mới, entries [] kèm latestId',
      afterFirst.entries.length === 0 &&
        afterFirst.latestId === general.latestId,
      JSON.stringify({ latest: afterFirst.latestId }),
    );
    const plan = await dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL enable_seqscan = off');
      const statement = pointFeedListSql({
        userScoped: true,
        ascending: false,
      });
      return (await manager.query(
        `EXPLAIN ${statement.sql}`,
        statement.params({
          afterId: null,
          limit: 20,
          userId: FeedU,
          minDelta: 0,
          excludedRuleCodes: ['ADMIN_ADJUSTMENT'],
          mergedRuleCodes: ['CHARITY_CAMPAIGN_BONUS'],
        }),
      )) as { 'QUERY PLAN': string }[];
    });
    check(
      'EXPLAIN truy vấn theo người dùng đi qua IDX_point_ledger_user_id',
      plan.some((line) =>
        line['QUERY PLAN'].includes('IDX_point_ledger_user_id'),
      ),
      plan
        .map((line) => line['QUERY PLAN'])
        .join(' | ')
        .slice(0, 300),
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
  console.log('\nDự án từ thiện đợt 4b: mọi phép kiểm đạt');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
