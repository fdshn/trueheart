/**
 * Acceptance của phân hệ đóng góp vật phẩm từ thiện (F65b), trên Postgres THẬT.
 *
 * Mười hai tiêu chí của `docs/plan/CHARITY-CONTRIBUTION-DESIGN.md` §11. Mỗi tiêu chí
 * in ra một nhóm riêng có đánh số, để bảng theo dõi §12 trỏ được thẳng vào nhóm nào
 * canh tiêu chí nào.
 *
 * ## Tiêu chí 1 phải ÉP khoảng chồng lấn
 *
 * Hai lượt chấp nhận "cùng lúc" trên một máy cục bộ chạy gần như nối tiếp, và phép kiểm
 * xanh cả khi KHÔNG có khoá nào — đo được ngày 12/10 lúc viết lát C. Nên nhóm 1 cài một
 * trigger `pg_sleep` ngay trước lượt ghi các dòng đề nghị (tức SAU khi đọc phần còn
 * thiếu, TRƯỚC khi cộng projection) rồi gỡ đi. Có khoá thì lượt sau phải chờ; không có
 * khoá thì cả hai cùng đọc thấy 100 và cùng thắng.
 *
 * ## Một tiêu chí chưa có gì để canh
 *
 * Tiêu chí 6 nói về liên hệ/địa chỉ của NGƯỜI THỤ HƯỞNG. Schema hiện CHƯA lưu thông tin
 * đó ở đâu cả, nên phần đo được ở đây là `contactNote` của người tặng không lọt ra
 * đường công khai. Ghi rõ để không ai đọc nhóm 6 xanh rồi tưởng đã có kho dữ liệu riêng
 * tư cho người thụ hưởng.
 */
import { IGiftRequestRepository } from '@/domain/ports/repository';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  CreateCharityCampaignUseCase,
  GetCampaignNeedsUseCase,
  SubmitCharityContributionUseCase,
} from '../src/application/implementations/charity-campaign/charity-campaign.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { EntitlementRepository } from '../src/infrastructure/repository/entitlement.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_contribution_check';
const Hour = 3_600_000;

const DiamondId = 'c2000000-0000-4000-8000-0000000000d1';
const GoldId = 'c2000000-0000-4000-8000-0000000000a1';
const MemberId = 'c2000000-0000-4000-8000-0000000000e1';
const GiverA = 'c2000000-0000-4000-8000-0000000000b1';
const GiverB = 'c2000000-0000-4000-8000-0000000000b2';
const GiverC = 'c2000000-0000-4000-8000-0000000000b3';
const Outsider = 'c2000000-0000-4000-8000-0000000000ff';

const RuleCode = 'CHARITY_CONTRIBUTION_COMPLETED';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function errorName(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as Error)?.constructor?.name ?? 'unknown';
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
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  const q = (sql: string, params: unknown[] = []) =>
    dataSource.query(sql, params);

  try {
    const ledger = new PointLedgerRepository(dataSource.manager);
    const repo = new CharityCampaignRepository(dataSource.manager, ledger);
    const entitlements = new EntitlementRepository(dataSource.manager, {
      countOpenByRequester: async (): Promise<number> => 0,
    } as unknown as IGiftRequestRepository);
    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const create = new CreateCharityCampaignUseCase(
      repo,
      entitlements,
      adminConfig,
    );
    // Notifier câm: script này đo dữ liệu, còn nội dung và việc nối thông báo có phép
    // kiểm riêng ở `charity.notifier.spec.ts` và spec use case.
    const silent = {
      contributionSubmitted: async () => undefined,
      contributionDecided: async () => undefined,
      deliveryCompleted: async () => undefined,
      deliveryCancelled: async () => undefined,
    } as never;
    const submit = new SubmitCharityContributionUseCase(repo, silent);
    const needsView = new GetCampaignNeedsUseCase(repo);

    for (const [id, name, rank] of [
      [DiamondId, 'tc-kimcuong', 'DIAMOND'],
      [GoldId, 'tc-vang', 'GOLD'],
      [MemberId, 'tc-thanhvien', 'MEMBER'],
      [GiverA, 'tc-tang-a', 'MEMBER'],
      [GiverB, 'tc-tang-b', 'MEMBER'],
      [GiverC, 'tc-tang-c', 'MEMBER'],
      [Outsider, 'tc-ngoai', 'MEMBER'],
    ] as const)
      await q(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2::text, 'x', $3, 'ACTIVE')`,
        [id, name, rank],
      );

    const start = new Date(Date.now() - Hour);
    const baseInput = (overrides: Record<string, unknown> = {}) => ({
      title: `Hoạt động ${randomUUID().slice(0, 6)}`,
      description: 'Kiểm acceptance đóng góp vật phẩm từ thiện.',
      bannerUrl: 'https://cdn.chantam.vn/a.jpg',
      badgeName: 'Tấm lòng',
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 30 * 24 * Hour).toISOString(),
      campaignType: 'ORGANIZED_CAMPAIGN' as const,
      ...overrides,
    });

    // ── 11. Quyền tạo và trạng thái ban đầu ─────────────────────────────────
    console.log('11. Thành viên/Bạc/Vàng chờ duyệt; Kim Cương public ngay');

    const diamond = await create.handle({
      ...baseInput({
        needs: [
          { itemName: 'Gạo tẻ', unit: 'kg', targetQuantity: 100 },
          { itemName: 'Mì gói', unit: 'thùng', targetQuantity: 10 },
        ],
      }),
      actorUserId: DiamondId,
      asAdmin: false,
    });
    check(
      'Kim Cương tạo hoạt động có tổ chức → APPROVED + is_active, không chờ Admin',
      diamond.approvalStatus === 'APPROVED' && diamond.isActive,
      `${diamond.approvalStatus} / active=${diamond.isActive}`,
    );
    const goldAppeal = await create.handle({
      ...baseInput({
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'OTHER',
      }),
      actorUserId: GoldId,
      asAdmin: false,
    });
    check(
      'Vàng tạo kêu gọi cá nhân → PENDING_APPROVAL',
      goldAppeal.approvalStatus === 'PENDING_APPROVAL',
      goldAppeal.approvalStatus,
    );
    const memberAppeal = await create.handle({
      ...baseInput({
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'SELF',
      }),
      actorUserId: MemberId,
      asAdmin: false,
    });
    check(
      'Thành viên tạo kêu gọi cá nhân → PENDING_APPROVAL',
      memberAppeal.approvalStatus === 'PENDING_APPROVAL',
    );
    check(
      'Thành viên tạo hoạt động CÓ TỔ CHỨC → bị từ chối',
      (await errorName(
        create.handle({
          ...baseInput(),
          actorUserId: MemberId,
          asAdmin: false,
        }),
      )) === 'CharityCampaignCreateNotAllowedException',
    );
    const [stored] = await q(
      `SELECT approval_status FROM campaigns WHERE global_id = $1`,
      [diamond.globalId],
    );
    check(
      'database ghi APPROVED chứ không ghi chữ ACTIVE vào approval_status',
      stored.approval_status === 'APPROVED',
      stored.approval_status,
    );

    const needs = await repo.listNeeds(diamond.globalId);
    const rice = needs.find((need) => need.unit === 'kg')!;
    const noodles = needs.find((need) => need.unit === 'thùng')!;

    async function contribute(
      giver: string,
      items: { needItemId: string; offeredQuantity: number }[],
      contactNote?: string,
    ) {
      return submit.handle({
        campaignId: diamond.globalId,
        contributorId: giver,
        contactNote,
        items,
      });
    }
    const lineOf = (
      contribution: {
        items: readonly { needItemId: string; globalId: string }[];
      },
      needId: string,
    ) =>
      contribution.items.find((item) => item.needItemId === needId)!.globalId;
    const needOf = async (needId: string) =>
      (await repo.listNeeds(diamond.globalId)).find(
        (need) => need.globalId === needId,
      )!;

    // ── 1. Hai người tổ chức chấp nhận cùng lúc ─────────────────────────────
    console.log('\n1. Hai lượt chấp nhận CHỒNG LÊN nhau không vượt mục tiêu');

    const a = await contribute(GiverA, [
      { needItemId: rice.globalId, offeredQuantity: 60 },
    ]);
    const b = await contribute(GiverB, [
      { needItemId: rice.globalId, offeredQuantity: 60 },
    ]);
    await q(`CREATE OR REPLACE FUNCTION acceptance_slow() RETURNS trigger AS $$
             BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q(`CREATE TRIGGER acceptance_slow
             BEFORE UPDATE ON campaign_contribution_items
             FOR EACH ROW EXECUTE FUNCTION acceptance_slow()`);
    const raced = await Promise.allSettled(
      [a, b].map((contribution) =>
        repo.decideContribution({
          contributionId: contribution.globalId,
          organizerId: DiamondId,
          decisionKey: `race-${contribution.globalId}`,
          decisions: [
            {
              contributionItemId: lineOf(contribution, rice.globalId),
              acceptedQuantity: 60,
            },
          ],
        }),
      ),
    );
    await q(`DROP TRIGGER acceptance_slow ON campaign_contribution_items`);
    const winners = raced.filter((result) => result.status === 'fulfilled');
    const losers = raced.filter(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult[];
    check(
      'đúng MỘT lượt thắng',
      winners.length === 1 && losers.length === 1,
      `${winners.length} thắng / ${losers.length} thua`,
    );
    check(
      'lượt thua là NeedExceeded và báo đúng phần còn lại 40',
      losers[0]?.reason?.constructor?.name === 'CharityNeedExceededException' &&
        String(losers[0]?.reason?.message).includes('40'),
      `${losers[0]?.reason?.constructor?.name}: ${losers[0]?.reason?.message}`,
    );
    check(
      'projection không vượt mục tiêu',
      (await needOf(rice.globalId)).acceptedQuantity === 60,
      `accepted=${(await needOf(rice.globalId)).acceptedQuantity}`,
    );
    const winner = raced[0].status === 'fulfilled' ? a : b;
    const loser = winner === a ? b : a;

    // ── 7. Retry cùng khoá ───────────────────────────────────────────────────
    console.log('\n7. Retry cùng idempotency key chỉ tạo một lượt giao nhận');

    const replay = await repo.decideContribution({
      contributionId: winner.globalId,
      organizerId: DiamondId,
      decisionKey: `race-${winner.globalId}`,
      decisions: [
        {
          contributionItemId: lineOf(winner, rice.globalId),
          acceptedQuantity: 60,
        },
      ],
    });
    const [deliveries] = await q(
      `SELECT count(*)::int AS n FROM campaign_deliveries WHERE contribution_id = $1`,
      [winner.globalId],
    );
    check(
      'retry trả replayed=true, vẫn đúng MỘT lượt giao nhận',
      replay.replayed && deliveries.n === 1,
      `replayed=${replay.replayed}, ${deliveries.n} lượt`,
    );
    check(
      'database chặn lượt giao thứ hai kể cả khi mã sai',
      (await errorName(
        q(
          `INSERT INTO campaign_deliveries
             (campaign_id, contribution_id, contributor_id, organizer_id)
           SELECT campaign_id, contribution_id, contributor_id, organizer_id
           FROM campaign_deliveries WHERE contribution_id = $1`,
          [winner.globalId],
        ),
      )) === 'QueryFailedError',
    );

    // ── 3. Chấp nhận một phần ────────────────────────────────────────────────
    console.log(
      '\n3. Chấp nhận một phần sinh đúng số lượng, phần còn lại có lịch sử',
    );

    const partial = await repo.decideContribution({
      contributionId: loser.globalId,
      organizerId: DiamondId,
      decisionKey: `partial-${loser.globalId}`,
      decisions: [
        {
          contributionItemId: lineOf(loser, rice.globalId),
          acceptedQuantity: 40,
          rejectionReason: 'TARGET_REACHED',
        },
      ],
    });
    check(
      'đề nghị PARTIALLY_ACCEPTED, lượt giao mang đúng 40',
      partial.contribution.status === 'PARTIALLY_ACCEPTED' &&
        partial.delivery?.items[0]?.acceptedQuantity === 40,
      `${partial.contribution.status} / ${partial.delivery?.items[0]?.acceptedQuantity}`,
    );
    check(
      'dòng đề nghị giữ cả số đề nghị (60), số nhận (40) và lý do',
      partial.contribution.items[0].offeredQuantity === 60 &&
        partial.contribution.items[0].acceptedQuantity === 40 &&
        partial.contribution.items[0].rejectionReason === 'TARGET_REACHED',
    );

    // ── 2. Từ chối một người không ảnh hưởng người khác ──────────────────────
    console.log('\n2. Từ chối một người không đụng đề nghị của người khác');

    const c = await contribute(GiverC, [
      { needItemId: noodles.globalId, offeredQuantity: 5 },
    ]);
    const d = await contribute(GiverA, [
      { needItemId: noodles.globalId, offeredQuantity: 3 },
    ]);
    await repo.decideContribution({
      contributionId: c.globalId,
      organizerId: DiamondId,
      decisionKey: `reject-${c.globalId}`,
      decisions: [
        {
          contributionItemId: lineOf(c, noodles.globalId),
          acceptedQuantity: 0,
          rejectionReason: 'QUALITY_NOT_ACCEPTABLE',
        },
      ],
    });
    const dAfter = await repo.findContributionByGlobalId(d.globalId);
    check(
      'đề nghị bị từ chối là REJECTED, không sinh lượt giao nhận',
      (await repo.findContributionByGlobalId(c.globalId))?.deliveryId === null,
    );
    check(
      'đề nghị người KHÁC trên cùng nhu cầu vẫn chờ, nguyên vẹn',
      dAfter?.status === 'PENDING_REVIEW' &&
        dAfter.items[0].acceptedQuantity === null,
      `${dAfter?.status}`,
    );

    // ── 4. Huỷ trả lại capacity ──────────────────────────────────────────────
    console.log('\n4. Huỷ lượt giao trả capacity, không xoá đề nghị/audit');

    const winnerDelivery = replay.delivery!;
    await repo.cancelDelivery({
      deliveryId: winnerDelivery.globalId,
      actorUserId: winner === a ? GiverA : GiverB,
      reason: 'Không sắp xếp được',
    });
    const afterCancel = await needOf(rice.globalId);
    const winnerAfter = await repo.findContributionByGlobalId(winner.globalId);
    check(
      'trả 60 về nhu cầu: accepted từ 100 về 40',
      afterCancel.acceptedQuantity === 40,
      `accepted=${afterCancel.acceptedQuantity}`,
    );
    check(
      'đề nghị giữ nguyên ACCEPTED và trỏ tới lượt giao đã CANCELLED',
      winnerAfter?.status === 'ACCEPTED' &&
        winnerAfter.deliveryStatus === 'CANCELLED',
      `${winnerAfter?.status} / ${winnerAfter?.deliveryStatus}`,
    );

    // ── 8. Tiến độ từ giao nhận thật ─────────────────────────────────────────
    console.log('\n8. Tiến độ tính từ giao nhận thật, không từ số client gửi');

    // Bật rule TRONG database nháp để đo tiêu chí 12 bằng sổ điểm thật. Trên môi
    // trường thật rule vẫn TẮT chờ Bên A chốt mức.
    await q(`UPDATE point_rules SET is_enabled = true WHERE code = $1`, [
      RuleCode,
    ]);
    const completed = await repo.completeDelivery({
      deliveryId: partial.delivery!.globalId,
      organizerId: DiamondId,
      received: [{ needItemId: rice.globalId, receivedQuantity: 30 }],
    });
    const afterComplete = await needOf(rice.globalId);
    check(
      'nhận thực 30 trên 40 đã chấp nhận: accepted 0, received 30',
      afterComplete.acceptedQuantity === 0 &&
        afterComplete.receivedQuantity === 30,
      JSON.stringify({
        accepted: afterComplete.acceptedQuantity,
        received: afterComplete.receivedQuantity,
      }),
    );
    check(
      'phần còn thiếu là 70 — 10 hụt trở về nhu cầu',
      afterComplete.remainingQuantity === 70,
      `remaining=${afterComplete.remainingQuantity}`,
    );
    check(
      'lượt giao ghi số thực nhận, không ghi số đã chấp nhận',
      completed.items[0].receivedQuantity === 30,
    );

    // ── 12. Một bút toán cho mỗi đề nghị ────────────────────────────────────
    console.log('\n12. Một đề nghị chỉ sinh MỘT bút toán điểm');

    const loserGiver = loser === a ? GiverA : GiverB;
    const [entries] = await q(
      `SELECT count(*)::int AS n FROM point_ledger
       WHERE user_id = $1 AND idempotency_key = $2`,
      [loserGiver, `${RuleCode}:${loser.globalId}`],
    );
    check(
      'đúng MỘT bút toán, khoá theo đề nghị',
      entries.n === 1,
      `${entries.n} bút toán`,
    );
    check(
      'hoàn tất lần hai bị chặn, nên không có đường cộng lần hai',
      (await errorName(
        repo.completeDelivery({
          deliveryId: partial.delivery!.globalId,
          organizerId: DiamondId,
          received: [{ needItemId: rice.globalId, receivedQuantity: 30 }],
        }),
      )) === 'CharityDeliveryInvalidStateException',
    );
    // Rule TẮT là trạng thái thật trên môi trường: lượt hoàn tất vẫn phải thành công.
    await q(`UPDATE point_rules SET is_enabled = false WHERE code = $1`, [
      RuleCode,
    ]);
    const e = await contribute(GiverC, [
      { needItemId: rice.globalId, offeredQuantity: 5 },
    ]);
    const eDecided = await repo.decideContribution({
      contributionId: e.globalId,
      organizerId: DiamondId,
      decisionKey: `e-${e.globalId}`,
      decisions: [
        { contributionItemId: lineOf(e, rice.globalId), acceptedQuantity: 5 },
      ],
    });
    const eDone = await repo.completeDelivery({
      deliveryId: eDecided.delivery!.globalId,
      organizerId: DiamondId,
      received: [{ needItemId: rice.globalId, receivedQuantity: 5 }],
    });
    const [eEntries] = await q(
      `SELECT count(*)::int AS n FROM point_ledger WHERE idempotency_key = $1`,
      [`${RuleCode}:${e.globalId}`],
    );
    check(
      'rule TẮT: lượt hoàn tất vẫn COMPLETED, và không có bút toán',
      eDone.status === 'COMPLETED' && eEntries.n === 0,
      `${eDone.status} / ${eEntries.n} bút toán`,
    );

    // ── 9. Không cộng chéo đơn vị ────────────────────────────────────────────
    console.log('\n9. Không có phép cộng số lượng giữa hai dòng khác đơn vị');

    const view = await needsView.handle({
      idOrSlug: diamond.globalId,
      viewerUserId: null,
    });
    // kg: (0 + 35) / 100 = 35%; thùng: 0 / 10 = 0%. Trung bình TỶ LỆ = 18 (17.5 làm
    // tròn). Cộng số lượng sẽ ra 35 / 110 = 32% — con số không có nghĩa.
    check(
      'tiến độ chung là trung bình TỶ LỆ (18%), không phải tổng số lượng (32%)',
      view.overallProgressPercent === 18,
      `${view.overallProgressPercent}%`,
    );
    check(
      'mỗi dòng giữ đơn vị của nó',
      view.needs
        .map((need) => need.unit)
        .sort()
        .join(',') === 'kg,thùng',
    );

    // ── 10. Ngoài app ────────────────────────────────────────────────────────
    console.log('\n10. Đóng góp ngoài app có audit, không cộng điểm cho ai');

    const ledgerBefore = await q(`SELECT count(*)::int AS n FROM point_ledger`);
    const external = await repo.recordExternalContribution({
      campaignId: diamond.globalId,
      recordedBy: DiamondId,
      needItemId: noodles.globalId,
      quantity: 4,
      sourceLabel: 'Cô Lan bán tạp hoá',
      receivedAt: new Date(Date.now() - Hour),
      evidenceNote: null,
    });
    check(
      'ghi nhận cộng vào received của dòng nhu cầu',
      (await needOf(noodles.globalId)).receivedQuantity === 4,
    );
    const adjusted = await repo.amendExternalContribution({
      externalId: external.globalId,
      actorUserId: DiamondId,
      action: 'ADJUST',
      reason: 'Đếm lại thì 6 thùng',
      quantity: 6,
    });
    const [old] = await q(
      `SELECT status, void_reason FROM campaign_external_contributions
       WHERE global_id = $1`,
      [external.globalId],
    );
    check(
      'điều chỉnh: bản cũ VOIDED kèm lý do, bản mới trỏ replacesId về bản cũ',
      old.status === 'VOIDED' &&
        old.void_reason === 'Đếm lại thì 6 thùng' &&
        adjusted.replacesId === external.globalId &&
        adjusted.quantity === 6,
    );
    check(
      'projection theo bản CUỐI: received = 6, không phải 4 + 6',
      (await needOf(noodles.globalId)).receivedQuantity === 6,
      `received=${(await needOf(noodles.globalId)).receivedQuantity}`,
    );
    check(
      'database từ chối sửa số lượng TẠI CHỖ',
      (await errorName(
        q(
          `UPDATE campaign_external_contributions SET quantity = 99
           WHERE global_id = $1`,
          [adjusted.globalId],
        ),
      )) === 'QueryFailedError',
    );
    check(
      'database từ chối XOÁ bản ghi',
      (await errorName(
        q(`DELETE FROM campaign_external_contributions WHERE global_id = $1`, [
          adjusted.globalId,
        ]),
      )) === 'QueryFailedError',
    );
    check(
      'thao tác lại trên bản ĐÃ HUỶ bị chặn',
      (await errorName(
        repo.amendExternalContribution({
          externalId: external.globalId,
          actorUserId: DiamondId,
          action: 'VOID',
          reason: 'x',
        }),
      )) === 'CharityExternalContributionVoidedException',
    );
    const ledgerAfter = await q(`SELECT count(*)::int AS n FROM point_ledger`);
    check(
      'không có bút toán điểm nào sinh ra từ ngoài app',
      ledgerBefore[0].n === ledgerAfter[0].n,
      `${ledgerBefore[0].n} → ${ledgerAfter[0].n}`,
    );
    check(
      'bảng không có cột người tặng — không có đường gắn điểm',
      (
        await q(
          `SELECT count(*)::int AS n FROM information_schema.columns
           WHERE table_name = 'campaign_external_contributions'
             AND column_name IN ('contributor_id', 'user_id')`,
        )
      )[0].n === 0,
    );

    // ── 6. Riêng tư ──────────────────────────────────────────────────────────
    console.log('\n6. Người ngoài không đọc được liên hệ');

    const secret = `SDT-${randomUUID().slice(0, 8)}`;
    const withContact = await contribute(
      GiverB,
      [{ needItemId: noodles.globalId, offeredQuantity: 1 }],
      secret,
    );
    const publicView = JSON.stringify(
      await needsView.handle({
        idOrSlug: diamond.globalId,
        viewerUserId: null,
      }),
    );
    check(
      'đường công khai GET /campaigns/:id/needs KHÔNG chứa contactNote',
      !publicView.includes(secret),
    );
    check(
      'contactNote chỉ ở bản ghi đề nghị — đường có token',
      (await repo.findContributionByGlobalId(withContact.globalId))
        ?.contactNote === secret,
    );

    // ── 5. Đóng chiến dịch ───────────────────────────────────────────────────
    console.log(
      '\n5. Đóng chiến dịch chặn đề nghị mới, giữ lượt giao đang chạy',
    );

    const f = await contribute(GiverC, [
      { needItemId: rice.globalId, offeredQuantity: 10 },
    ]);
    const fDecided = await repo.decideContribution({
      contributionId: f.globalId,
      organizerId: DiamondId,
      decisionKey: `f-${f.globalId}`,
      decisions: [
        { contributionItemId: lineOf(f, rice.globalId), acceptedQuantity: 10 },
      ],
    });
    const closed = await repo.closeCampaign({
      campaignId: diamond.globalId,
      actorUserId: DiamondId,
    });
    const [closedRow] = await q(
      `SELECT approval_status, is_active, end_time <= now() AS ended
       FROM campaigns WHERE global_id = $1`,
      [diamond.globalId],
    );
    check(
      'đóng = (APPROVED, is_active=false, end_time đã qua) — không ghi CLOSED',
      closedRow.approval_status === 'APPROVED' &&
        closedRow.is_active === false &&
        closedRow.ended === true,
      JSON.stringify(closedRow),
    );
    check(
      'hai đề nghị đang chờ bị từ chối với CAMPAIGN_CLOSED',
      closed.rejectedContributions === 2 &&
        (await repo.findContributionByGlobalId(d.globalId))?.items[0]
          .rejectionReason === 'CAMPAIGN_CLOSED',
      `${closed.rejectedContributions} đề nghị`,
    );
    check(
      'lượt giao đang chạy KHÔNG bị huỷ',
      closed.openDeliveries === 1 &&
        (await repo.findDeliveryByGlobalId(fDecided.delivery!.globalId))
          ?.status === 'ACCEPTED',
    );
    check(
      'đề nghị MỚI bị chặn',
      (await errorName(
        contribute(Outsider, [
          { needItemId: rice.globalId, offeredQuantity: 1 },
        ]),
      )) === 'CharityNotAcceptingContributionsException',
    );
    const lateDone = await repo.completeDelivery({
      deliveryId: fDecided.delivery!.globalId,
      organizerId: DiamondId,
      received: [{ needItemId: rice.globalId, receivedQuantity: 10 }],
    });
    check(
      'lượt giao đang chạy vẫn HOÀN TẤT được sau khi đóng',
      lateDone.status === 'COMPLETED',
    );
    check(
      'đóng lần hai bị chặn',
      (await errorName(
        repo.closeCampaign({
          campaignId: diamond.globalId,
          actorUserId: DiamondId,
        }),
      )) === 'CharityCampaignNotClosableException',
    );

    const notStarted = await create.handle({
      ...baseInput({
        startTime: new Date(Date.now() + 24 * Hour).toISOString(),
        endTime: new Date(Date.now() + 48 * Hour).toISOString(),
      }),
      actorUserId: DiamondId,
      asAdmin: false,
    });
    check(
      'đóng một chiến dịch CHƯA bắt đầu không vi phạm CHK_campaigns_time_order',
      (await errorName(
        repo.closeCampaign({
          campaignId: notStarted.globalId,
          actorUserId: DiamondId,
        }),
      )) === null,
    );

    // ── Ngoài §11: hai việc làm sau lát E ───────────────────────────────────
    console.log('\n13. Chiến dịch CHO PHÉP vượt mục tiêu (§5)');

    const generous = await create.handle({
      ...baseInput({
        allowOverTarget: true,
        needs: [{ itemName: 'Chăn', unit: 'cái', targetQuantity: 10 }],
      }),
      actorUserId: DiamondId,
      asAdmin: false,
    });
    check('cờ được ghi khi tạo', generous.allowOverTarget === true);
    const [blanket] = await repo.listNeeds(generous.globalId);
    const g = await submit.handle({
      campaignId: generous.globalId,
      contributorId: GiverA,
      items: [{ needItemId: blanket.globalId, offeredQuantity: 25 }],
    });
    const gDecided = await repo.decideContribution({
      contributionId: g.globalId,
      organizerId: DiamondId,
      decisionKey: `g-${g.globalId}`,
      decisions: [
        {
          contributionItemId: g.items[0].globalId,
          acceptedQuantity: 25,
        },
      ],
    });
    const [blanketAfter] = await repo.listNeeds(generous.globalId);
    check(
      'nhận 25 trên mục tiêu 10 thì ĐƯỢC, và phần còn thiếu kẹp ở 0',
      gDecided.contribution.status === 'ACCEPTED' &&
        blanketAfter.acceptedQuantity === 25 &&
        blanketAfter.remainingQuantity === 0,
      `accepted=${blanketAfter.acceptedQuantity} remaining=${blanketAfter.remainingQuantity}`,
    );

    console.log('\n14. Gia hạn có audit (§8)');

    const [before] = await q(
      `SELECT end_time FROM campaigns WHERE global_id = $1`,
      [generous.globalId],
    );
    const later = new Date(new Date(before.end_time).getTime() + 7 * 24 * Hour);
    const extended = await repo.extendCampaign({
      campaignId: generous.globalId,
      actorUserId: DiamondId,
      newEndTime: later,
      reason: 'Còn thiếu chăn',
    });
    const [audit] = await q(
      `SELECT previous_end_time, new_end_time, changed_by, reason
       FROM campaign_schedule_changes WHERE campaign_id = $1`,
      [generous.globalId],
    );
    check(
      'gia hạn dời end_time và ghi một hàng audit đủ mốc cũ/mới/ai/vì sao',
      new Date(extended.newEndTime).getTime() === later.getTime() &&
        new Date(audit.previous_end_time).getTime() ===
          new Date(before.end_time).getTime() &&
        audit.changed_by === DiamondId &&
        audit.reason === 'Còn thiếu chăn',
    );
    check(
      'RÚT NGẮN không đi đường gia hạn',
      (await errorName(
        repo.extendCampaign({
          campaignId: generous.globalId,
          actorUserId: DiamondId,
          newEndTime: new Date(before.end_time),
          reason: 'x',
        }),
      )) === 'CharityCampaignNotExtendableException',
    );
    check(
      'chiến dịch ĐÃ ĐÓNG không gia hạn được',
      (await errorName(
        repo.extendCampaign({
          campaignId: diamond.globalId,
          actorUserId: DiamondId,
          newEndTime: new Date(Date.now() + 60 * 24 * Hour),
          reason: 'x',
        }),
      )) === 'CharityCampaignNotExtendableException',
    );
    check(
      'audit gia hạn không sửa được',
      (await errorName(
        q(`UPDATE campaign_schedule_changes SET reason = 'khac'`),
      )) === 'QueryFailedError',
    );

    console.log(
      '\n15. Coordinator: điều phối được, thu quyền có hiệu lực NGAY (§2)',
    );

    await repo.grantCoordinator({
      campaignId: generous.globalId,
      userId: GoldId,
      grantedBy: DiamondId,
    });
    await repo.grantCoordinator({
      campaignId: generous.globalId,
      userId: GoldId,
      grantedBy: DiamondId,
    });
    check(
      'giao lại cho người đang có quyền không sinh hàng thứ hai',
      (await repo.listCoordinators(generous.globalId)).length === 1,
    );

    const h = await submit.handle({
      campaignId: generous.globalId,
      contributorId: GiverB,
      items: [{ needItemId: blanket.globalId, offeredQuantity: 2 }],
    });
    const hDecided = await repo.decideContribution({
      contributionId: h.globalId,
      organizerId: GoldId,
      decisionKey: `h-${h.globalId}`,
      decisions: [
        { contributionItemId: h.items[0].globalId, acceptedQuantity: 2 },
      ],
    });
    check(
      'coordinator XÉT được, và lượt giao đứng tên người đã xét',
      hDecided.delivery?.organizerId === GoldId,
      String(hDecided.delivery?.organizerId),
    );
    check(
      'NGƯỜI TỔ CHỨC hoàn tất được lượt giao do coordinator xét',
      (
        await repo.completeDelivery({
          deliveryId: hDecided.delivery!.globalId,
          organizerId: DiamondId,
          received: [{ needItemId: blanket.globalId, receivedQuantity: 2 }],
        })
      ).status === 'COMPLETED',
    );

    const i = await submit.handle({
      campaignId: generous.globalId,
      contributorId: GiverC,
      items: [{ needItemId: blanket.globalId, offeredQuantity: 1 }],
    });
    await repo.revokeCoordinator({
      campaignId: generous.globalId,
      userId: GoldId,
      revokedBy: DiamondId,
    });
    check(
      'thu quyền xong thì lượt xét KẾ TIẾP của người đó bị chặn',
      (await errorName(
        repo.decideContribution({
          contributionId: i.globalId,
          organizerId: GoldId,
          decisionKey: `i-${i.globalId}`,
          decisions: [
            { contributionItemId: i.items[0].globalId, acceptedQuantity: 1 },
          ],
        }),
      )) === 'CharityNotOrganizerException',
    );
    check(
      'và quyền điều phối (kể cả quyền đọc) cũng hết',
      (await repo.isCampaignManager(generous.globalId, GoldId)) === false,
    );

    await repo.grantCoordinator({
      campaignId: generous.globalId,
      userId: GoldId,
      grantedBy: DiamondId,
    });
    const [history] = await q(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE revoked_at IS NULL)::int AS active
       FROM campaign_coordinators WHERE campaign_id = $1 AND user_id = $2`,
      [generous.globalId, GoldId],
    );
    check(
      'giao lại sau khi thu là một hàng MỚI — lịch sử giữ cả hai lần',
      history.total === 2 && history.active === 1,
      JSON.stringify(history),
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
    `\n${
      failures.length === 0
        ? 'Đóng góp từ thiện: mười hai tiêu chí §11 và các việc làm sau đều có phép đo trên Postgres thật'
        : `${failures.length} phép kiểm thất bại`
    }`,
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
