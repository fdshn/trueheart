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
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityAppealRepository } from '../src/infrastructure/repository/charity-appeal.repository';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { CharityPointsRepository } from '../src/infrastructure/repository/charity-points.repository';
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
