/**
 * Đăng ký ủng hộ tiền cho chiến dịch từ thiện trên Postgres THẬT (CR 25/11/2026,
 * docs/plans/2026-11-25-charity-money-pledges.md).
 *
 * - Ràng buộc của bảng mới (số tiền, trạng thái ↔ mốc, BIN, mã chuyển khoản duy nhất).
 * - Khai qua use case với repository thật: mặc định hiện tên theo tài khoản, VietQR theo BIN.
 * - Báo đã chuyển / ẩn / bỏ ẩn: điều kiện nằm trong UPDATE; sau công bố tổng kết thì LOCKED.
 * - Tổng công khai, danh sách công khai, `members` CONTRIBUTOR, `intakeTotals`: chỉ COMPLETED
 *   chưa ẩn; INTENDED và lời khai bị ẩn không tính.
 * - Điểm khi dự án kết thúc: 50% điểm vật phẩm, thưởng chiến dịch, không cộng INTENDED/bị ẩn,
 *   gọi lại không cộng đôi, job vá dự án thiếu award; bảng tin điểm theo ẩn tên.
 *
 *   npm run test:charity-money-pledge
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CompleteCharityMoneyPledgeUseCase,
  DeclareCharityMoneyPledgeUseCase,
  ListMyCharityMoneyPledgesUseCase,
} from '../src/application/implementations/charity-project/charity-money-pledge.use-cases';
import { CharityPointsService } from '../src/application/implementations/charity-project/charity-points.service';
import { GetPointFeedUseCase } from '../src/application/implementations/point/get-point-feed.use-case';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { CharityMoneyPledgeRepository } from '../src/infrastructure/repository/charity-money-pledge.repository';
import { CharityPointsRepository } from '../src/infrastructure/repository/charity-points.repository';
import { CharityProjectRepository } from '../src/infrastructure/repository/charity-project.repository';
import { CharitySummaryRepository } from '../src/infrastructure/repository/charity-summary.repository';
import { PointFeedRepository } from '../src/infrastructure/repository/point-feed.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_money_pledge_check';
const id = (tail: string) => `7f100000-0000-4000-8000-0000000000${tail}`;
const Owner = id('01');
const Coordinator = id('02');
const Donor = id('03');
const Shy = id('04');
const Viewer = id('05');
const Live = id('10');
const NoMoney = id('11');

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function rejects(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
    return 'không ném';
  } catch (error) {
    return (error as Error).constructor.name;
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
    const projects = new CharityProjectRepository(dataSource.manager);
    const summaries = new CharitySummaryRepository(dataSource.manager);
    const pledges = new CharityMoneyPledgeRepository(dataSource.manager);
    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const pointsRepo = new CharityPointsRepository(dataSource.manager, ledger);
    const points = new CharityPointsService(pointsRepo, adminConfig, pledges);
    const noThrottle = {
      assertWithinLimit: async () => undefined,
      registerHit: async () => undefined,
    };
    const declare = new DeclareCharityMoneyPledgeUseCase(
      campaigns,
      projects,
      pledges,
      noThrottle,
    );
    const complete = new CompleteCharityMoneyPledgeUseCase(pledges);

    for (const [userId, username, showInLists] of [
      [Owner, 'cmp_owner', false],
      [Coordinator, 'cmp_coord', false],
      [Donor, 'cmp_donor', true],
      [Shy, 'cmp_shy', false],
      [Viewer, 'cmp_viewer', false],
    ] as const)
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status,
                            show_in_public_supporter_lists)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', $3)`,
        [userId, username, showInLists],
      );
    for (const [campaignId, slug, types] of [
      [Live, 'cmp-live', ['MATERIAL', 'MONEY']],
      [NoMoney, 'cmp-no-money', ['MATERIAL']],
    ] as const)
      await sql(
        `INSERT INTO campaigns
           (global_id, title, slug, description, banner_url, badge_name, start_time, end_time,
            created_by, approval_status, approved_at, approved_by, submitted_at, operation_stage,
            accepted_contribution_types, point_bonus_percent)
         VALUES ($1, 'Dự án ủng hộ tiền', $2, 'Mô tả đủ dài cho dự án kiểm', 'https://cdn.test/a.jpg',
                 'Ấm', now() - interval '10 days', now() + interval '20 days', $3, 'APPROVED',
                 now(), $3, now(), 'EXECUTION', $4::text[], 50)`,
        [campaignId, slug, Owner, types],
      );
    await sql(
      `INSERT INTO campaign_coordinators (campaign_id, user_id, granted_by)
       VALUES ($1, $2, $3)`,
      [Live, Coordinator, Owner],
    );

    // ── 1. Ràng buộc ─────────────────────────────────────────────────────
    console.log('1. Ràng buộc của bảng');
    const added = await projects.addBankAccount({
      campaignId: Live,
      actorId: Owner,
      account: {
        label: null,
        bankName: 'Vietcombank',
        bankBin: '970436',
        accountNo: '9999000101',
        accountName: 'CLB AM AP',
      },
      replacesAccountId: null,
      replaceReason: null,
      limit: 2,
    });
    check(
      'thêm tài khoản nhận kèm BIN, đọc lại có bankBin',
      added.status === 'CREATED' &&
        (await projects.listBankAccounts(Live))[0]?.bankBin === '970436',
    );
    check(
      'BIN sai dạng bị CHECK chặn',
      (await rejects(() =>
        sql(
          `INSERT INTO campaign_bank_accounts (campaign_id, bank_name, account_no, account_name, bank_bin)
           VALUES ($1, 'X', '12345678', 'Y', '97A436')`,
          [Live],
        ),
      )) === 'QueryFailedError',
    );
    const accountId =
      added.status === 'CREATED' ? added.account.accountId : 'missing';
    const rawInsert = (amount: number, status: string, completed: boolean) =>
      sql(
        `INSERT INTO campaign_money_pledges
           (campaign_id, user_id, pledged_amount, status, completed_at, bank_account_id, transfer_content)
         VALUES ($1, $2, $3, $4, ${completed ? 'now()' : 'NULL'}, $5, 'CT RAW' || $3::text)`,
        [Live, Donor, amount, status, accountId],
      );
    check(
      'số tiền < 1.000 bị CHECK chặn',
      (await rejects(() => rawInsert(999, 'INTENDED', false))) ===
        'QueryFailedError',
    );
    check(
      'COMPLETED thiếu completed_at bị CHECK chặn',
      (await rejects(() => rawInsert(5_000, 'COMPLETED', false))) ===
        'QueryFailedError',
    );
    const duplicate = await pledges.create({
      campaignId: Live,
      fundingNeedId: null,
      userId: Donor,
      pledgedAmount: 5_000,
      showNamePublicly: null,
      note: null,
      bankAccountId: accountId,
      transferContent: 'CT DUP234',
    });
    const again = await pledges.create({
      campaignId: Live,
      fundingNeedId: null,
      userId: Shy,
      pledgedAmount: 5_000,
      showNamePublicly: null,
      note: null,
      bankAccountId: accountId,
      transferContent: 'CT DUP234',
    });
    check(
      'mã chuyển khoản trùng → create trả null (nơi gọi sinh lại), không ném',
      duplicate !== null && again === null,
    );
    await sql(`DELETE FROM campaign_money_pledges`);

    // ── 2. Khai qua use case ─────────────────────────────────────────────
    console.log('2. Khai đăng ký ủng hộ');
    const [need] = await sql(
      `INSERT INTO campaign_funding_needs (campaign_id, title, target_amount, bank_account_id)
       VALUES ($1, 'Mua chăn', 10000000, $2) RETURNING global_id`,
      [Live, accountId],
    );
    const first = await declare.handle({
      userId: Donor,
      campaignId: Live,
      pledge: { pledgedAmount: 500_000, fundingNeedId: need.global_id },
    });
    check(
      'mặc định hiện tên theo show_in_public_supporter_lists (Donor = bật)',
      first.pledge.showNamePublicly === true,
    );
    check(
      'transfer: VietQR theo BIN, nội dung CT <mã>',
      first.transfer.vietQrUrl?.includes('970436-9999000101') === true &&
        /^CT [2-9A-Z]{6}$/.test(first.transfer.transferContent),
      JSON.stringify(first.transfer),
    );
    const shy = await declare.handle({
      userId: Shy,
      campaignId: Live,
      pledge: { pledgedAmount: 200_000 },
    });
    check('Shy mặc định ẩn tên', shy.pledge.showNamePublicly === false);
    const intended = await declare.handle({
      userId: Viewer,
      campaignId: Live,
      pledge: { pledgedAmount: 9_000_000, showNamePublicly: true },
    });
    const joke = await declare.handle({
      userId: Viewer,
      campaignId: Live,
      pledge: { pledgedAmount: 10_000_000_000, showNamePublicly: true },
    });
    check(
      'chủ dự án / điều phối viên tự khai → SELF',
      (await rejects(() =>
        declare.handle({
          userId: Owner,
          campaignId: Live,
          pledge: { pledgedAmount: 10_000 },
        }),
      )) === 'CharityMoneyPledgeSelfException' &&
        (await rejects(() =>
          declare.handle({
            userId: Coordinator,
            campaignId: Live,
            pledge: { pledgedAmount: 10_000 },
          }),
        )) === 'CharityMoneyPledgeSelfException',
    );
    check(
      'dự án không nhận tiền → CONTRIBUTION_TYPE_DISABLED',
      (await rejects(() =>
        declare.handle({
          userId: Donor,
          campaignId: NoMoney,
          pledge: { pledgedAmount: 10_000 },
        }),
      )) === 'CharityContributionTypeDisabledException',
    );

    // ── 3. Báo đã chuyển, ẩn ─────────────────────────────────────────────
    console.log('3. Báo đã chuyển, ẩn, bỏ ẩn');
    const strangerComplete = await pledges.markCompleted({
      pledgeId: first.pledge.pledgeId,
      userId: Viewer,
    });
    check(
      'người khác báo hộ → NOT_FOUND',
      strangerComplete.status === 'NOT_FOUND',
    );
    const done = await complete.handle({
      userId: Donor,
      pledgeId: first.pledge.pledgeId,
    });
    check(
      'người khai báo đã chuyển → COMPLETED, có completedAt',
      done.status === 'COMPLETED' && done.completedAt !== null,
    );
    check(
      'báo lần hai → ALREADY_COMPLETED',
      (await rejects(() =>
        complete.handle({ userId: Donor, pledgeId: first.pledge.pledgeId }),
      )) === 'CharityMoneyPledgeAlreadyCompletedException',
    );
    await complete.handle({ userId: Shy, pledgeId: shy.pledge.pledgeId });
    await complete.handle({ userId: Viewer, pledgeId: joke.pledge.pledgeId });
    const hidden = await pledges.setHidden({
      pledgeId: joke.pledge.pledgeId,
      hidden: true,
      actorId: Owner,
      reason: 'Số tiền ảo',
    });
    const hiddenTwice = await pledges.setHidden({
      pledgeId: joke.pledge.pledgeId,
      hidden: true,
      actorId: Owner,
      reason: null,
    });
    check(
      'ẩn → hidden_at/by/reason; ẩn lần hai → CONFLICT',
      hidden.status === 'UPDATED' &&
        hidden.pledge.hiddenReason === 'Số tiền ảo' &&
        hidden.pledge.hiddenBy === Owner &&
        hiddenTwice.status === 'CONFLICT',
    );
    const unhidden = await pledges.setHidden({
      pledgeId: intended.pledge.pledgeId,
      hidden: false,
      actorId: Owner,
      reason: null,
    });
    check('bỏ ẩn lời khai chưa ẩn → CONFLICT', unhidden.status === 'CONFLICT');

    // ── 4. Số công khai ──────────────────────────────────────────────────
    console.log('4. Tổng, danh sách, thành viên');
    const totals = await pledges.totals(Live);
    check(
      'tổng = COMPLETED chưa ẩn (500k + 200k); INTENDED 9tr và lời khai bị ẩn không tính',
      totals.pledgedAmount === 700_000 &&
        totals.pledgeCount === 2 &&
        totals.byFundingNeed.length === 1 &&
        totals.byFundingNeed[0].pledgedAmount === 500_000,
      JSON.stringify(totals),
    );
    const intake = await summaries.intakeTotals(Live);
    check(
      'intakeTotals.money.pledgedAmount = 700k, totalAmount KHÔNG cộng lời khai',
      intake.money?.pledgedAmount === 700_000 &&
        intake.money?.totalAmount === 0,
      JSON.stringify(intake.money),
    );
    const publicPage = await pledges.listForCampaign({
      campaignId: Live,
      fundingNeedId: null,
      status: null,
      includeHidden: false,
      cursor: null,
      limit: 10,
    });
    const managePage = await pledges.listForCampaign({
      campaignId: Live,
      fundingNeedId: null,
      status: null,
      includeHidden: true,
      cursor: null,
      limit: 10,
    });
    check(
      'công khai: 3 dòng (không có lời khai bị ẩn); ban tổ chức: 4 dòng',
      publicPage.rows.length === 3 && managePage.rows.length === 4,
      `${publicPage.rows.length}/${managePage.rows.length}`,
    );
    const completedOnly = await pledges.listForCampaign({
      campaignId: Live,
      fundingNeedId: null,
      status: 'COMPLETED',
      includeHidden: false,
      cursor: null,
      limit: 10,
    });
    check('lọc COMPLETED: 2 dòng', completedOnly.rows.length === 2);
    const firstPage = await pledges.listForCampaign({
      campaignId: Live,
      fundingNeedId: null,
      status: null,
      includeHidden: true,
      cursor: null,
      limit: 2,
    });
    const last = firstPage.rows[1];
    const secondPage = await pledges.listForCampaign({
      campaignId: Live,
      fundingNeedId: null,
      status: null,
      includeHidden: true,
      cursor: { declaredAt: last.declaredAt, id: last.cursorId },
      limit: 10,
    });
    const seen = [...firstPage.rows, ...secondPage.rows].map(
      (row) => row.pledgeId,
    );
    check(
      'phân trang theo con trỏ: đủ 4, không trùng, mới nhất trước',
      seen.length === 4 &&
        new Set(seen).size === 4 &&
        firstPage.rows[0].pledgeId === joke.pledge.pledgeId,
      seen.join(','),
    );
    const mine = await pledges.listMine({
      userId: Viewer,
      campaignId: null,
      cursor: null,
      limit: 10,
    });
    check(
      'của tôi: thấy cả lời khai bị ẩn kèm lý do, có tài khoản để dựng transfer',
      mine.rows.length === 2 &&
        mine.rows.some((row) => row.hiddenReason === 'Số tiền ảo') &&
        mine.rows.every((row) => row.account?.bankBin === '970436'),
    );
    const members = await summaries.listPublicMembers({
      campaignId: Live,
      type: 'CONTRIBUTOR',
      cursor: null,
      limit: 10,
    });
    check(
      'members CONTRIBUTOR: Donor hiện với MONEY; Shy chỉ đếm ẩn danh; Viewer (INTENDED + bị ẩn) không tính',
      members.rows.length === 1 &&
        members.rows[0].user.globalId === Donor &&
        members.rows[0].contributionTypes?.includes('MONEY') === true &&
        members.anonymousCount === 1,
      JSON.stringify({
        rows: members.rows.map((row) => [
          row.user.username,
          row.contributionTypes,
        ]),
        anonymous: members.anonymousCount,
      }),
    );

    // Review: Shy ẩn tên ở lời khai nhưng có một đóng góp hiện vật CHO hiện tên (sau lời khai).
    // Danh sách thành viên không được để lộ MONEY hay mốc của lời khai ẩn danh — ghép với danh
    // sách ủng hộ tiền là ra người + số tiền.
    const [contribution] = (await sql(
      `INSERT INTO campaign_contributions
         (campaign_id, contributor_id, status, decided_at, decided_by, show_name_publicly)
       VALUES ($1, $2, 'ACCEPTED', now(), $3, true)
       RETURNING date_trunc('milliseconds', created_at) AS created_at`,
      [Live, Shy, Owner],
    )) as { created_at: Date }[];
    const mixed = await summaries.listPublicMembers({
      campaignId: Live,
      type: 'CONTRIBUTOR',
      cursor: null,
      limit: 10,
    });
    const shyMember = mixed.rows.find((member) => member.user.globalId === Shy);
    check(
      'người hiện tên ở hiện vật nhưng ẩn tên ở lời khai: chỉ MATERIAL, joinedAt = mốc hiện vật',
      shyMember !== undefined &&
        JSON.stringify(shyMember.contributionTypes) === '["MATERIAL"]' &&
        shyMember.joinedAt.getTime() === contribution.created_at.getTime() &&
        shyMember.joinedAt.getTime() !== shy.pledge.declaredAt.getTime(),
      JSON.stringify(shyMember),
    );
    await sql(`DELETE FROM campaign_contributions WHERE contributor_id = $1`, [
      Shy,
    ]);

    // ── 5. Kết thúc dự án → điểm ─────────────────────────────────────────
    console.log('5. Điểm khi dự án kết thúc');
    await sql(
      `UPDATE point_rules SET is_enabled = true WHERE code IN ('CHARITY_MONEY_PLEDGE', 'CHARITY_ITEM_VALUE')`,
    );
    await sql(
      `UPDATE point_rules SET points = 1 WHERE code = 'CHARITY_ITEM_VALUE'`,
    );
    await sql(
      `INSERT INTO campaign_summaries (campaign_id, summary, published_at)
       VALUES ($1, 'Đã trao xong', now())`,
      [Live],
    );
    check(
      'sau công bố tổng kết: báo đã chuyển → LOCKED',
      (
        await pledges.markCompleted({
          pledgeId: intended.pledge.pledgeId,
          userId: Viewer,
        })
      ).status === 'LOCKED',
    );
    check(
      'sau công bố tổng kết: bỏ ẩn → LOCKED',
      (
        await pledges.setHidden({
          pledgeId: joke.pledge.pledgeId,
          hidden: false,
          actorId: Owner,
          reason: null,
        })
      ).status === 'LOCKED',
    );
    check(
      'job thấy dự án đã kết thúc còn thiếu award',
      (await pledges.listCampaignsWithUnawardedPledges(30, 10)).includes(Live),
    );
    await points.awardMoneyPledges(Live);
    const ledgerRows = (await sql(
      `SELECT user_id, rule_code, delta::int AS delta FROM point_ledger
        WHERE rule_code IN ('CHARITY_MONEY_PLEDGE', 'CHARITY_CAMPAIGN_BONUS')
        ORDER BY user_id, rule_code`,
    )) as { user_id: string; rule_code: string; delta: number }[];
    const sumFor = (userId: string, rule: string) =>
      ledgerRows
        .filter((row) => row.user_id === userId && row.rule_code === rule)
        .reduce((sum, row) => sum + row.delta, 0);
    check(
      'Donor 500k → 25 điểm gốc + 12 thưởng (50%); Shy 200k → 10 + 5',
      sumFor(Donor, 'CHARITY_MONEY_PLEDGE') === 25 &&
        sumFor(Donor, 'CHARITY_CAMPAIGN_BONUS') === 12 &&
        sumFor(Shy, 'CHARITY_MONEY_PLEDGE') === 10 &&
        sumFor(Shy, 'CHARITY_CAMPAIGN_BONUS') === 5,
      JSON.stringify(ledgerRows),
    );
    check(
      'Viewer (INTENDED + bị ẩn) không có điểm',
      sumFor(Viewer, 'CHARITY_MONEY_PLEDGE') === 0,
    );
    await sql(
      `UPDATE system_configs SET value_json = '100'::jsonb
        WHERE config_key = 'charity.money_pledge.points_percent'`,
    );
    await points.awardMoneyPledges(Live);
    await points.settlePending(50);
    const [{ rows: ledgerCount }] = (await sql(
      `SELECT count(*)::int AS rows FROM point_ledger WHERE rule_code = 'CHARITY_MONEY_PLEDGE'`,
    )) as { rows: number }[];
    check(
      'gọi lại + job: không cộng đôi, đổi tỷ lệ sau khi kết thúc không tính lại',
      ledgerCount === 2 && sumFor(Donor, 'CHARITY_MONEY_PLEDGE') === 25,
      String(ledgerCount),
    );
    check(
      'job không còn thấy dự án thiếu award',
      !(await pledges.listCampaignsWithUnawardedPledges(30, 10)).includes(Live),
    );

    // ── 6. Bảng tin điểm ─────────────────────────────────────────────────
    console.log('6. Bảng tin điểm');
    const feed = new GetPointFeedUseCase(
      new PointFeedRepository(dataSource.manager),
      { read: async () => null, write: async () => undefined },
      noThrottle,
      adminConfig,
      ledger,
    );
    const entries = (
      await feed.handle({
        viewerId: Viewer,
        userId: null,
        afterId: null,
        limit: 50,
      })
    ).entries;
    const donorEntry = entries.find((entry) => entry.user.userId === Donor);
    const shyEntry = entries.find((entry) => entry.user.userId === Shy);
    check(
      'Donor (hiện tên) có ngữ cảnh chiến dịch, tiêu đề rule mới; Shy (ẩn tên) không kèm chiến dịch',
      donorEntry?.context?.type === 'CHARITY_CAMPAIGN' &&
        donorEntry.ruleTitle === 'Ủng hộ tiền cho dự án từ thiện' &&
        (shyEntry === undefined || shyEntry.context === null),
      JSON.stringify({ donorEntry, shyEntry }),
    );

    // ── 7. Tài khoản nhận bị đóng ────────────────────────────────────────
    console.log('7. Tài khoản nhận bị đóng');
    await projects.closeBankAccount({
      campaignId: Live,
      accountId,
      actorId: Owner,
      reason: 'Đổi tài khoản',
    });
    const afterClose = await new ListMyCharityMoneyPledgesUseCase(
      pledges,
    ).handle({ userId: Donor, campaignId: Live, cursor: null, limit: 10 });
    check(
      '/me: tài khoản lúc khai đã đóng → accountClosed, không dựng QR',
      afterClose.pledges[0]?.transfer?.accountClosed === true &&
        afterClose.pledges[0]?.transfer?.vietQrUrl === null,
      JSON.stringify(afterClose.pledges[0]?.transfer),
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
  console.log('\nĐăng ký ủng hộ tiền: mọi phép kiểm đạt');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
