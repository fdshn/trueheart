/**
 * Điểm danh, chuỗi và lượt bù trên Postgres THẬT (F83).
 *
 * Toán ngày và toán chuỗi đã có spec thuần ở `core-lib/src/models/check-in.spec.ts`.
 * File này kiểm những thứ spec đó KHÔNG thể thấy, vì chúng nằm trong SQL và trong
 * hành vi transaction:
 *
 * 1. Policy: version tăng, `expectedVersion` lệch bị từ chối, bật mà thiếu số bị từ chối.
 * 2. Fail-closed: chưa publish hoặc đang tắt thì KHÔNG ghi được gì.
 * 3. Điểm danh lặp trong cùng ngày không cộng điểm lần hai — đo trên `point_ledger`.
 * 4. Mốc thưởng phát đúng một lần mỗi chuỗi, và KHÔNG phát qua lỗ hổng.
 * 5. Bù lấp lỗ: trạng thái về `ACTIVE`, mở được mốc, và KHÔNG trả điểm ngày bỏ lỡ
 *    (có CHECK constraint canh).
 * 6. Lỗ hổng hết hạn: chuỗi cũ `ENDED`, chuỗi mới xét mốc của chính nó, mốc cũ
 *    KHÔNG bị thu hồi.
 * 7. Lượt bù: tích cho CẢ HAI bên, một giao dịch tính một lần mỗi bên, ngưỡng
 *    được GHIM theo nhóm khi Admin đổi policy giữa kỳ.
 * 8. Hai trigger append-only thật sự chặn UPDATE.
 *
 * `record` nhận `today` làm tham số chứ không đọc đồng hồ, nên ở đây dựng được
 * một chuỗi nhiều ngày một cách tiền định — không cần giả lập thời gian.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { CheckInRepository } from '../src/infrastructure/repository/check-in.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_check_in_check';

const AdminId = 'a2000000-0000-4000-8000-00000000a001';
const UserA = 'd2000000-0000-4000-8000-00000000d001';
const UserB = 'd2000000-0000-4000-8000-00000000d002';
const UserC = 'd2000000-0000-4000-8000-00000000d003';
const UserD = 'd2000000-0000-4000-8000-00000000d004';
const CategoryId = 'c2000000-0000-4000-8000-00000000c001';
const PostId = 'b2000000-0000-4000-8000-00000000b001';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function expectThrow(
  label: string,
  run: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì');
  } catch (error) {
    const name = (error as Error).constructor.name;
    check(label, name === expected, name);
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

  const ledger = new PointLedgerRepository(dataSource.manager);
  const checkIns = new CheckInRepository(dataSource.manager, ledger);

  const addUser = async (id: string, username: string) => {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
      [id, username],
    );
  };

  const pointsOf = async (userId: string, ruleCode: string) => {
    const [row] = await dataSource.query<{ total: string; count: string }[]>(
      `SELECT COALESCE(SUM(delta), 0) AS total, COUNT(*) AS count
       FROM point_ledger WHERE user_id = $1 AND rule_code = $2`,
      [userId, ruleCode],
    );
    return { total: Number(row.total), count: Number(row.count) };
  };

  const publish = async (input: {
    expectedVersion: number | null;
    enabled: boolean;
    dailyPoints: number;
    milestones: { streakDays: number; bonusPoints: number }[];
    transactionsPerRepair: number;
    repairWindowDays: number;
  }) =>
    checkIns.publishPolicy({
      actorUserId: AdminId,
      expectedVersion: input.expectedVersion,
      policy: {
        enabled: input.enabled,
        dailyPoints: input.dailyPoints,
        milestones: input.milestones,
        transactionsPerRepair: input.transactionsPerRepair,
        repairWindowDays: input.repairWindowDays,
      },
      effectiveAt: new Date(Date.now() - 60_000),
      reason: 'Kiểm chứng F83',
    });

  try {
    await addUser(AdminId, 'admin-check-in');
    await addUser(UserA, 'nguoi-diem-danh-a');
    await addUser(UserB, 'nguoi-diem-danh-b');
    await addUser(UserC, 'nguoi-diem-danh-c');
    await addUser(UserD, 'nguoi-diem-danh-d');

    // ── 2. Fail-closed TRƯỚC khi có policy ─────────────────────────────────
    console.log('1. Chưa publish policy thì không ghi được gì');
    await expectThrow(
      'chưa có policy thì điểm danh bị từ chối',
      () =>
        checkIns.record({
          userId: UserA,
          today: '2026-10-01',
          date: '2026-10-01',
          kind: 'NORMAL',
        }),
      'CheckInPolicyUnavailableException',
    );

    // ── 1. Policy ───────────────────────────────────────────────────────────
    console.log('\n2. Publish policy: version, xung đột, và chặn bản thiếu số');
    const v1 = await publish({
      expectedVersion: null,
      enabled: false,
      dailyPoints: 0,
      milestones: [],
      transactionsPerRepair: 0,
      repairWindowDays: 0,
    });
    check('bản đầu là version 1', v1.version === 1, `version=${v1.version}`);

    await expectThrow(
      'bật mà thiếu số bị từ chối kèm danh sách thiếu',
      () =>
        publish({
          expectedVersion: 1,
          enabled: true,
          dailyPoints: 0,
          milestones: [],
          transactionsPerRepair: 0,
          repairWindowDays: 0,
        }),
      'ValidationFailedException',
    );

    await expectThrow(
      'expectedVersion lệch bị từ chối, không ghi đè',
      () =>
        publish({
          expectedVersion: 99,
          enabled: true,
          dailyPoints: 2,
          milestones: [],
          transactionsPerRepair: 4,
          repairWindowDays: 7,
        }),
      'ValidationFailedException',
    );

    await expectThrow(
      'policy đang TẮT thì vẫn không ghi được',
      () =>
        checkIns.record({
          userId: UserA,
          today: '2026-10-01',
          date: '2026-10-01',
          kind: 'NORMAL',
        }),
      'CheckInPolicyUnavailableException',
    );

    const v2 = await publish({
      expectedVersion: 1,
      enabled: true,
      dailyPoints: 2,
      milestones: [
        { streakDays: 3, bonusPoints: 10 },
        { streakDays: 5, bonusPoints: 25 },
      ],
      transactionsPerRepair: 2,
      repairWindowDays: 7,
    });
    check(
      'bản hợp lệ lên version 2',
      v2.version === 2,
      `version=${v2.version}`,
    );

    // ── 3 & 4. Chuỗi liền mạch, lặp, và mốc ────────────────────────────────
    console.log('\n3. Chuỗi liền mạch, điểm danh lặp, và mốc thưởng');
    for (const day of ['2026-10-01', '2026-10-02']) {
      await checkIns.record({
        userId: UserA,
        today: day,
        date: day,
        kind: 'NORMAL',
      });
    }

    const replay = await checkIns.record({
      userId: UserA,
      today: '2026-10-02',
      date: '2026-10-02',
      kind: 'NORMAL',
    });
    check(
      'điểm danh lại cùng ngày trả applied=false và 0 điểm',
      replay.applied === false && replay.dailyPointsAwarded === 0,
      `applied=${replay.applied} points=${replay.dailyPointsAwarded}`,
    );

    const afterTwo = await pointsOf(UserA, 'CHECK_IN_DAILY');
    check(
      'hai ngày là HAI bút toán, lượt lặp không sinh thêm',
      afterTwo.count === 2 && afterTwo.total === 4,
      `count=${afterTwo.count} total=${afterTwo.total}`,
    );

    const dayThree = await checkIns.record({
      userId: UserA,
      today: '2026-10-03',
      date: '2026-10-03',
      kind: 'NORMAL',
    });
    check(
      'ngày 3 đạt mốc: cộng thêm 10 ngoài 2 điểm ngày',
      dayThree.currentStreak === 3 &&
        dayThree.dailyPointsAwarded === 2 &&
        dayThree.milestonePointsAwarded === 10,
      `streak=${dayThree.currentStreak} daily=${dayThree.dailyPointsAwarded} milestone=${dayThree.milestonePointsAwarded}`,
    );

    // ── Lỗ hổng trong cửa sổ ───────────────────────────────────────────────
    console.log('\n4. Bỏ một ngày: AT_RISK, và KHÔNG phát mốc qua lỗ hổng');
    // Bỏ 04, điểm danh 05 → lỗ hổng là 04, còn trong cửa sổ 7 ngày.
    const afterGap = await checkIns.record({
      userId: UserA,
      today: '2026-10-05',
      date: '2026-10-05',
      kind: 'NORMAL',
    });
    check(
      'chuỗi chuyển AT_RISK và currentStreak đếm lại từ đoạn mới',
      afterGap.runStatus === 'AT_RISK' && afterGap.currentStreak === 1,
      `status=${afterGap.runStatus} streak=${afterGap.currentStreak}`,
    );
    check(
      'recoverableStreak giữ cả khoảng, và lỗ hổng là đúng ngày 04',
      afterGap.recoverableStreak === 5 &&
        afterGap.pendingGapDates.length === 1 &&
        afterGap.pendingGapDates[0] === '2026-10-04',
      `recoverable=${afterGap.recoverableStreak} gaps=${afterGap.pendingGapDates.join(',')}`,
    );
    check(
      'KHÔNG phát mốc 5 ngày dù khoảng đã 5 ngày — vì còn lỗ hổng',
      afterGap.milestonePointsAwarded === 0,
      `milestone=${afterGap.milestonePointsAwarded}`,
    );

    // ── Bù khi chưa có lượt ────────────────────────────────────────────────
    await expectThrow(
      'bù khi chưa có lượt nào bị từ chối',
      () =>
        checkIns.record({
          userId: UserA,
          today: '2026-10-05',
          date: '2026-10-04',
          kind: 'REPAIR',
        }),
      'CheckInRepairCreditInsufficientException',
    );

    // ── 7. Tích lượt bù từ giao dịch hoàn tất ──────────────────────────────
    console.log('\n5. Lượt bù tích từ giao dịch hoàn tất, CẢ HAI bên');
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, sort_order, is_active)
       VALUES ($1, 'Đồ điện tử', 'do-dien-tu', 1, true)`,
      [CategoryId],
    );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm điểm danh',
               'Mô tả đủ dài cho bài kiểm điểm danh và lượt bù',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 10, 10, '{}'::jsonb, 0)`,
      [PostId, UserB, CategoryId],
    );

    let txSeq = 0;
    const completeTransaction = async (giverId: string, receiverId: string) => {
      txSeq += 1;
      const id = `f3000000-0000-4000-8000-00000000f0${String(txSeq).padStart(2, '0')}`;
      await dataSource.query(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at, completed_at)
         VALUES ($1, $2, $3, $4, 1, 'COMPLETED', now(), now())`,
        [id, PostId, giverId, receiverId],
      );
      await dataSource.manager.transaction(async (manager) => {
        await checkIns.accrueFromCompletedTransaction(manager, {
          transactionId: id,
          giverId,
          receiverId,
        });
      });
      return id;
    };

    const firstTx = await completeTransaction(UserB, UserA);
    const progressRows = await dataSource.query<
      { user_id: string; role: string }[]
    >(
      `SELECT user_id, role FROM repair_transaction_progress WHERE transaction_id = $1 ORDER BY role`,
      [firstTx],
    );
    check(
      'một giao dịch tích cho CẢ người tặng và người nhận',
      progressRows.length === 2 &&
        progressRows.some((r) => r.user_id === UserB && r.role === 'GIVER') &&
        progressRows.some((r) => r.user_id === UserA && r.role === 'RECEIVER'),
      `rows=${progressRows.length}`,
    );

    // Gọi lại cho CÙNG giao dịch: khoá duy nhất phải chặn, không tích thêm.
    await dataSource.manager.transaction(async (manager) => {
      await checkIns.accrueFromCompletedTransaction(manager, {
        transactionId: firstTx,
        giverId: UserB,
        receiverId: UserA,
      });
    });
    const [{ count: progressCount }] = await dataSource.query<
      { count: string }[]
    >(
      `SELECT COUNT(*) AS count FROM repair_transaction_progress WHERE transaction_id = $1`,
      [firstTx],
    );
    check(
      'hoàn tất gọi lại KHÔNG tích thêm lần nữa',
      Number(progressCount) === 2,
      `count=${progressCount}`,
    );

    // Giao dịch thứ hai đủ ngưỡng 2 → phát một lượt cho mỗi bên.
    await completeTransaction(UserB, UserA);
    const stateA = await checkIns.readState(UserA, '2026-10-05');
    check(
      'đủ ngưỡng thì phát đúng MỘT lượt bù',
      stateA.repairCredits === 1,
      `credits=${stateA.repairCredits}`,
    );
    const [cohortRow] = await dataSource.query<
      { status: string; current_count: number }[]
    >(
      `SELECT status, current_count FROM repair_credit_cohorts
       WHERE user_id = $1 ORDER BY id ASC LIMIT 1`,
      [UserA],
    );
    check(
      'nhóm đã đóng khi về đích',
      cohortRow.status === 'CLOSED' && Number(cohortRow.current_count) === 2,
      `${cohortRow.status}/${cohortRow.current_count}`,
    );

    // ── 5. Bù lấp lỗ hổng ──────────────────────────────────────────────────
    console.log('\n6. Bù lấp lỗ: về ACTIVE, mở mốc, KHÔNG trả điểm ngày bỏ lỡ');
    const beforeRepair = await pointsOf(UserA, 'CHECK_IN_DAILY');
    const repaired = await checkIns.record({
      userId: UserA,
      today: '2026-10-05',
      date: '2026-10-04',
      kind: 'REPAIR',
    });
    check(
      'chuỗi về ACTIVE, không còn lỗ hổng',
      repaired.runStatus === 'ACTIVE' && repaired.pendingGapDates.length === 0,
      `status=${repaired.runStatus} gaps=${repaired.pendingGapDates.length}`,
    );
    check(
      'chuỗi nối lại thành 5 ngày',
      repaired.currentStreak === 5,
      `streak=${repaired.currentStreak}`,
    );
    check(
      'mốc 5 ngày nay MỚI được phát, đúng một lần',
      repaired.milestonePointsAwarded === 25,
      `milestone=${repaired.milestonePointsAwarded}`,
    );
    check(
      'ngày bù KHÔNG nhận điểm cơ bản',
      repaired.dailyPointsAwarded === 0,
      `daily=${repaired.dailyPointsAwarded}`,
    );
    const afterRepair = await pointsOf(UserA, 'CHECK_IN_DAILY');
    check(
      'và sổ điểm cũng không có bút toán điểm ngày nào thêm',
      afterRepair.count === beforeRepair.count,
      `${beforeRepair.count} -> ${afterRepair.count}`,
    );
    check(
      'lượt bù đã bị trừ',
      repaired.repairCreditsRemaining === 0,
      `remaining=${repaired.repairCreditsRemaining}`,
    );

    const milestoneRows = await dataSource.query<{ milestone_days: number }[]>(
      `SELECT milestone_days FROM check_in_milestone_awards
       WHERE user_id = $1 ORDER BY milestone_days`,
      [UserA],
    );
    check(
      'tổng cộng đúng hai mốc đã phát: 3 và 5',
      milestoneRows.length === 2 &&
        Number(milestoneRows[0].milestone_days) === 3 &&
        Number(milestoneRows[1].milestone_days) === 5,
      milestoneRows.map((r) => r.milestone_days).join(','),
    );

    await expectThrow(
      'bù một ngày ĐÃ có dấu bị từ chối',
      () =>
        checkIns.record({
          userId: UserA,
          today: '2026-10-05',
          date: '2026-10-04',
          kind: 'REPAIR',
        }),
      'CheckInRepairUnavailableException',
    );

    // ── 6. Lỗ hổng hết hạn ────────────────────────────────────────────────
    console.log('\n7. Lỗ hổng quá cửa sổ: chuỗi cũ ENDED, chuỗi mới bắt đầu');
    // Nhảy tới 20/10: lỗ hổng cũ nhất là 06/10, cách 14 ngày > cửa sổ 7.
    const newRun = await checkIns.record({
      userId: UserA,
      today: '2026-10-20',
      date: '2026-10-20',
      kind: 'NORMAL',
    });
    check(
      'chuỗi mới bắt đầu lại từ 1 và ở ACTIVE',
      newRun.currentStreak === 1 && newRun.runStatus === 'ACTIVE',
      `streak=${newRun.currentStreak} status=${newRun.runStatus}`,
    );
    const runRows = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM check_in_runs WHERE user_id = $1 ORDER BY id ASC`,
      [UserA],
    );
    check(
      'chuỗi cũ đã chốt ENDED, và chỉ có MỘT chuỗi chưa đóng',
      runRows.length === 2 &&
        runRows[0].status === 'ENDED' &&
        runRows[1].status !== 'ENDED',
      runRows.map((r) => r.status).join(','),
    );
    const milestonesStill = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM check_in_milestone_awards WHERE user_id = $1`,
      [UserA],
    );
    check(
      'mốc đã phát KHÔNG bị thu hồi khi chuỗi đứt',
      Number(milestonesStill[0].count) === 2,
      `count=${milestonesStill[0].count}`,
    );

    await expectThrow(
      'bù một ngày ngoài cửa sổ bị từ chối',
      () =>
        checkIns.record({
          userId: UserA,
          today: '2026-10-20',
          date: '2026-10-06',
          kind: 'REPAIR',
        }),
      'CheckInRepairDateInvalidException',
    );

    // ── 7b. Ngưỡng được GHIM theo nhóm ─────────────────────────────────────
    console.log('\n8. Đổi ngưỡng giữa kỳ KHÔNG quy đổi lại tiến độ đã tích');
    // UserC tích 1 giao dịch ở ngưỡng 2, rồi Admin đổi ngưỡng lên 5.
    await completeTransaction(UserC, UserD);
    const [cohortC] = await dataSource.query<
      { required_transactions: number; policy_version: number }[]
    >(
      `SELECT required_transactions, policy_version FROM repair_credit_cohorts
       WHERE user_id = $1 AND status = 'OPEN'`,
      [UserC],
    );
    check(
      'nhóm ghim ngưỡng 2 và version 2 lúc giao dịch đầu đến',
      Number(cohortC.required_transactions) === 2 &&
        Number(cohortC.policy_version) === 2,
      `required=${cohortC.required_transactions} version=${cohortC.policy_version}`,
    );

    await publish({
      expectedVersion: 2,
      enabled: true,
      dailyPoints: 2,
      milestones: [{ streakDays: 3, bonusPoints: 10 }],
      transactionsPerRepair: 5,
      repairWindowDays: 7,
    });

    // Giao dịch thứ hai vẫn hoàn thành nhóm CŨ theo ngưỡng 2, không phải 5.
    await completeTransaction(UserC, UserD);
    const stateC = await checkIns.readState(UserC, '2026-10-20');
    check(
      'giao dịch thứ hai vẫn về đích theo ngưỡng ĐÃ GHIM, phát lượt',
      stateC.repairCredits === 1,
      `credits=${stateC.repairCredits}`,
    );

    // Nhóm kế tiếp mới theo policy mới.
    await completeTransaction(UserC, UserD);
    const [nextCohort] = await dataSource.query<
      { required_transactions: number; policy_version: number }[]
    >(
      `SELECT required_transactions, policy_version FROM repair_credit_cohorts
       WHERE user_id = $1 AND status = 'OPEN'`,
      [UserC],
    );
    check(
      'nhóm kế tiếp lấy ngưỡng MỚI là 5, version 3',
      Number(nextCohort.required_transactions) === 5 &&
        Number(nextCohort.policy_version) === 3,
      `required=${nextCohort.required_transactions} version=${nextCohort.policy_version}`,
    );

    // ── 8. Trigger append-only ─────────────────────────────────────────────
    console.log('\n9. Hai trigger append-only thật sự chặn UPDATE');
    for (const table of ['check_in_entries', 'repair_credit_ledger']) {
      let message = '';
      try {
        await dataSource.query(
          `UPDATE ${table} SET created_at = now() WHERE id = (SELECT MIN(id) FROM ${table})`,
        );
      } catch (error) {
        message = (error as Error).message;
      }
      check(
        `${table} chặn UPDATE`,
        message.includes('append-only'),
        message.slice(0, 60) || 'không ném',
      );
    }

    // ── Số dư lượt bù không bao giờ âm ─────────────────────────────────────
    let negativeMessage = '';
    try {
      await dataSource.query(
        `INSERT INTO repair_credit_ledger
           (user_id, event_type, delta, balance_after, reference_type,
            reference_id, idempotency_key, policy_version)
         VALUES ($1, 'SPEND', -1, -1, 'TEST', 'x', 'test-negative', 3)`,
        [UserA],
      );
    } catch (error) {
      negativeMessage = (error as Error).message;
    }
    check(
      'ràng buộc chặn số dư lượt bù âm',
      negativeMessage.includes('CHK_repair_credit_ledger_balance'),
      negativeMessage.slice(0, 70) || 'không ném',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F83: policy fail-closed và có version, chuỗi đếm đúng qua lỗ hổng, mốc không phát qua lỗ hổng và không bị thu hồi, bù lấp lỗ mà không trả điểm ngày, ngưỡng lượt bù ghim theo nhóm'
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
