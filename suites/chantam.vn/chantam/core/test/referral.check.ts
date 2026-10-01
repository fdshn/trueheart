/**
 * Kiểm phân hệ giới thiệu trên Postgres THẬT (23 §23.2–§23.4).
 *
 * Sáu thứ unit test mock `query` không thấy được, vì tất cả nằm trong SQL hoặc trong
 * thứ tự các câu:
 *
 * 1. Trần 3/ngày: ba lượt đầu được thưởng, lượt sau HOÃN — không mất, không ném.
 * 2. `findPendingQualifications` thấy đúng những lượt bị hoãn đó.
 * 3. Người MỜI bị khoá hoặc xoá thì KHÔNG trả thưởng, và lượt đó cũng không còn
 *    xuất hiện trong danh sách quét — nếu còn thì `point:reconcile` lặp vô hạn.
 * 4. Người mời bị treo TẠM rồi được gỡ thì lượt đó quay lại danh sách quét.
 * 5. Bộ đếm rank KHÔNG tính người được mời đã bị ban hoặc xoá.
 * 6. `getOwnSummary` trả danh sách người đã mời kèm trạng thái và số điểm ĐÃ VÀO SỔ.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { RankRepository } from '../src/infrastructure/repository/rank.repository';
import { ReferralRepository } from '../src/infrastructure/repository/referral.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_referral_check';
const Referrer = 'e0000000-0000-4000-8000-00000000e001';
const OtherReferrer = 'e0000000-0000-4000-8000-00000000e002';
const referee = (n: number) =>
  `e0000000-0000-4000-8000-00000000f0${String(n).padStart(2, '0')}`;

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

  const ledger = new PointLedgerRepository(dataSource.manager);
  const referrals = new ReferralRepository(dataSource.manager, ledger);
  const ranks = new RankRepository(dataSource.manager);

  const addUser = async (
    id: string,
    username: string,
    options: { rank?: string; status?: string; deleted?: boolean } = {},
  ) =>
    dataSource.query(
      `INSERT INTO users
         (global_id, username, password_hash, rank, status, referral_code, deleted_at)
       VALUES ($1, $2, 'x', $3, $4, $5, $6)`,
      [
        id,
        username,
        options.rank ?? 'MEMBER',
        options.status ?? 'ACTIVE',
        username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
        options.deleted === true ? new Date() : null,
      ],
    );

  const link = async (
    referrerId: string,
    refereeId: string,
    fingerprints: { ip?: string; device?: string } = {},
  ) =>
    dataSource.query(
      `INSERT INTO referrals
         (referrer_id, referee_id, code, signup_ip_hash, signup_device_hash)
       VALUES ($1, $2, 'MA-THU', $3, $4)`,
      [referrerId, refereeId, fingerprints.ip ?? null, fingerprints.device ?? null],
    );

  try {
    await addUser(Referrer, 'nguoi-moi');
    await addUser(OtherReferrer, 'nguoi-moi-hai');
    for (let n = 1; n <= 5; n += 1) await addUser(referee(n), `duoc-moi-${n}`);
    for (let n = 1; n <= 5; n += 1) await link(Referrer, referee(n));

    console.log('1. Trần 3 lượt/ngày: thưởng ba, HOÃN phần còn lại');
    const outcomes: boolean[] = [];
    for (let n = 1; n <= 5; n += 1)
      outcomes.push(
        (await referrals.qualifyAndAward({ refereeId: referee(n) })).qualified,
      );
    check(
      'ba lượt đầu được thưởng',
      outcomes.slice(0, 3).every((ok) => ok),
      outcomes.join(','),
    );
    check(
      'lượt thứ tư và năm bị HOÃN, không ném lỗi',
      outcomes.slice(3).every((ok) => !ok),
    );
    const [balance] = await dataSource.query<{ balance: number }[]>(
      `SELECT balance FROM user_point_balances WHERE user_id = $1`,
      [Referrer],
    );
    check('cộng đúng 3 × 56 điểm', balance?.balance === 168, `${balance?.balance}`);
    const [stillPending] = await dataSource.query<{ n: string }[]>(
      `SELECT COUNT(*)::text n FROM referrals
       WHERE referrer_id = $1 AND qualified_at IS NULL`,
      [Referrer],
    );
    check(
      'hai lượt bị hoãn VẪN còn dòng, không mất quan hệ',
      stillPending.n === '2',
      stillPending.n,
    );

    console.log('\n2. findPendingQualifications thấy đúng hai lượt đó');
    check(
      'đúng hai lượt chờ',
      (await referrals.findPendingQualifications(10)).length === 2,
      `${(await referrals.findPendingQualifications(10)).length}`,
    );

    console.log('\n3. Người MỜI bị khoá thì không trả thưởng, và không lặp mãi');
    await addUser(referee(9), 'duoc-moi-9');
    await link(OtherReferrer, referee(9));
    await dataSource.query(
      `UPDATE users SET status = 'BANNED' WHERE global_id = $1`,
      [OtherReferrer],
    );
    const banned = await referrals.qualifyAndAward({ refereeId: referee(9) });
    check('không trả thưởng cho tài khoản đã khoá', banned.qualified === false);
    const [bannedBalance] = await dataSource.query<{ balance: number }[]>(
      `SELECT balance FROM user_point_balances WHERE user_id = $1`,
      [OtherReferrer],
    );
    check(
      'và không có số dư nào sinh ra',
      (bannedBalance?.balance ?? 0) === 0,
      `${bannedBalance?.balance ?? 0}`,
    );
    const pendingWhileBanned = await referrals.findPendingQualifications(10);
    check(
      'lượt đó KHÔNG nằm trong danh sách quét — nếu nằm thì reconcile lặp vô hạn',
      !pendingWhileBanned.includes(referee(9)),
      pendingWhileBanned.length === 2 ? 'chỉ còn hai lượt cũ' : `${pendingWhileBanned.length}`,
    );

    console.log('\n4. Treo TẠM rồi được gỡ thì lượt đó quay lại — hoãn, không mất');
    await dataSource.query(
      `UPDATE users SET status = 'ACTIVE' WHERE global_id = $1`,
      [OtherReferrer],
    );
    check(
      'gỡ khoá thì lượt đó xuất hiện lại',
      (await referrals.findPendingQualifications(10)).includes(referee(9)),
    );
    check(
      'và lần này trả thưởng được',
      (await referrals.qualifyAndAward({ refereeId: referee(9) })).qualified,
    );

    console.log('\n5. Bộ đếm rank KHÔNG tính người được mời đã bị ban/xoá');
    const beforeBan = await ranks.getOwnSummary(Referrer);
    await dataSource.query(
      `UPDATE users SET status = 'BANNED' WHERE global_id = $1`,
      [referee(1)],
    );
    await dataSource.query(`UPDATE users SET deleted_at = now() WHERE global_id = $1`, [
      referee(2),
    ]);
    const afterBan = await ranks.getOwnSummary(Referrer);
    check(
      'trước khi dọn: đếm 3',
      beforeBan.qualifiedReferrals === 3,
      `${beforeBan.qualifiedReferrals}`,
    );
    check(
      'sau khi ban 1 và xoá 1: đếm 1',
      afterBan.qualifiedReferrals === 1,
      `${afterBan.qualifiedReferrals}`,
    );
    const [keptRow] = await dataSource.query<{ n: string }[]>(
      `SELECT COUNT(*)::text n FROM referrals WHERE referrer_id = $1`,
      [Referrer],
    );
    check(
      'nhưng quan hệ giới thiệu VẪN còn nguyên năm dòng',
      keptRow.n === '5',
      keptRow.n,
    );

    console.log('\n6. getOwnSummary trả danh sách người đã mời');
    const summary = await referrals.getOwnSummary(Referrer);
    check('đủ năm người', summary.invitees.length === 5, `${summary.invitees.length}`);
    check(
      'mới nhất trước',
      summary.invitees[0].username === 'duoc-moi-5',
      summary.invitees.map((row) => row.username).join(', '),
    );
    const pendingOnes = summary.invitees.filter((row) => row.status === 'PENDING');
    check(
      'hai lượt bị hoãn hiện đúng trạng thái PENDING',
      pendingOnes.length === 2,
      `${pendingOnes.length}`,
    );
    check(
      'và PENDING thì không có số điểm',
      pendingOnes.every((row) => row.awardedPoints === null),
    );
    const rewarded = summary.invitees.filter((row) => row.status === 'QUALIFIED');
    check(
      'lượt đã tính mang đúng số điểm ĐÃ VÀO SỔ',
      rewarded.every((row) => row.awardedPoints === 56),
      rewarded.map((row) => String(row.awardedPoints)).join(','),
    );
    check(
      'người đã bị ban VẪN hiện trong danh sách — quan hệ là dữ liệu thật',
      summary.invitees.some((row) => row.username === 'duoc-moi-1'),
    );

    console.log('\n7. Đếm cụm dấu vết đăng ký trùng nhau');
    const noMarks = await referrals.readSignupFingerprintSignals(Referrer);
    check(
      'chưa có dấu vết nào thì ra 0 cả ba, không báo đỏ oan cho dữ liệu cũ',
      noMarks.sharedIpClusters === 0 &&
        noMarks.sharedDeviceClusters === 0 &&
        noMarks.largestClusterSize === 0,
    );
    const shared = 'e0000000-0000-4000-8000-00000000e003';
    await addUser(shared, 'nguoi-moi-ba');
    for (const [n, ip, device] of [
      [21, 'bam-ip-A', 'bam-may-1'],
      [22, 'bam-ip-A', 'bam-may-2'],
      [23, 'bam-ip-B', 'bam-may-2'],
    ] as const) {
      await addUser(referee(n), `duoc-moi-${n}`);
      await link(shared, referee(n), { ip, device });
    }
    const marks = await referrals.readSignupFingerprintSignals(shared);
    check(
      'cụm IP và cụm thiết bị đếm TÁCH nhau, không gộp thành một số',
      marks.sharedIpClusters === 1 && marks.sharedDeviceClusters === 1,
      `ip=${marks.sharedIpClusters} may=${marks.sharedDeviceClusters}`,
    );
    check(
      'và biết cụm lớn nhất có bao nhiêu người',
      marks.largestClusterSize === 2,
      `${marks.largestClusterSize}`,
    );

    console.log('\n8. Hàng đợi soát: tắt thì RỖNG, bật thì đúng người');
    const Off = {
      minQualifiedReferrals: 1,
      minDeviceClusters: 0,
      minClusterSize: 0,
    };
    check(
      'cả hai vế 0 thì hàng đợi rỗng — chưa bật, không phải không có ai',
      (
        await referrals.findReferrersForReview({
          config: Off,
          limit: 20,
          offset: 0,
        })
      ).total === 0,
    );

    // `shared` có 1 cụm IP và 1 cụm thiết bị, cụm lớn nhất 2 người. Nhưng chưa lượt nào
    // của họ đủ điều kiện, nên sàn mẫu phải loại họ ra.
    const bySize = await referrals.findReferrersForReview({
      config: { ...Off, minClusterSize: 2 },
      limit: 20,
      offset: 0,
    });
    check(
      'sàn mẫu loại người chưa có lượt nào đủ điều kiện',
      !bySize.entries.some((row) => row.referrerUserId === shared),
      `${bySize.total} người`,
    );

    // Cho một lượt của `shared` đủ điều kiện rồi đo lại.
    await referrals.qualifyAndAward({ refereeId: referee(21) });
    const nowListed = await referrals.findReferrersForReview({
      config: { ...Off, minClusterSize: 2 },
      limit: 20,
      offset: 0,
    });
    const found = nowListed.entries.find(
      (row) => row.referrerUserId === shared,
    );
    check('qua sàn mẫu thì vào hàng đợi', found !== undefined);
    check(
      'và mang theo cả ba tín hiệu tách nhau',
      found?.signals.sharedIpClusters === 1 &&
        found?.signals.sharedDeviceClusters === 1 &&
        found?.signals.largestClusterSize === 2,
      JSON.stringify(found?.signals),
    );
    check(
      'ngưỡng theo cụm THIẾT BỊ cũng bắt được người đó',
      (
        await referrals.findReferrersForReview({
          config: { ...Off, minDeviceClusters: 1 },
          limit: 20,
          offset: 0,
        })
      ).entries.some((row) => row.referrerUserId === shared),
    );
    check(
      'ngưỡng cao hơn thực tế thì không bắt ai',
      (
        await referrals.findReferrersForReview({
          config: { ...Off, minClusterSize: 9 },
          limit: 20,
          offset: 0,
        })
      ).total === 0,
    );

    console.log('\n9. listInviteesForReview trả rewardEntryId để đảo bút toán');
    const forReview = await referrals.listInviteesForReview(Referrer);
    const withEntry = forReview.filter((row) => row.rewardEntryId !== null);
    check(
      'lượt đã trả thưởng có entryId',
      withEntry.length === 3,
      `${withEntry.length}`,
    );
    check(
      'lượt còn treo thì null — không có gì để đảo',
      forReview
        .filter((row) => row.status === 'PENDING')
        .every((row) => row.rewardEntryId === null),
    );
    check(
      'và thấy được ai đã bị dọn',
      forReview.some((row) => row.refereeStatus === 'BANNED') &&
        forReview.some((row) => row.refereeDeleted),
    );


    console.log('\n10. Thu hồi thưởng: đường đảo bút toán làm đúng ba việc');
    // Đây là khẳng định cả thiết kế dựa vào: khi xác minh là tài khoản ảo thì đường
    // thu hồi ĐÃ CÓ và đã làm đúng ca khó — điểm đã bị tiêu.
    const [entryRow] = await dataSource.query<{ id: string }[]>(
      `SELECT reward_entry_id::text AS id FROM referrals
       WHERE referrer_id = $1 AND reward_entry_id IS NOT NULL
       ORDER BY id ASC LIMIT 1`,
      [Referrer],
    );

    // Tiêu gần hết điểm trước khi thu hồi, để lượt đảo PHẢI đẩy xuống dưới 0.
    const [before] = await dataSource.query<
      { balance: number; lifetime: number }[]
    >(`SELECT balance, lifetime FROM user_point_balances WHERE user_id = $1`, [
      Referrer,
    ]);
    await ledger.appendAdjustment({
      userId: Referrer,
      ruleCode: 'ADMIN_ADJUSTMENT',
      delta: -(Number(before.balance) - 20),
      referenceType: 'MANUAL',
      referenceId: Referrer,
      idempotencyKey: `PROBE_SPEND:${Referrer}`,
      actor: 'SYSTEM',
      source: 'MANUAL',
      reason: 'Tiêu điểm để dựng ca "đã tiêu rồi mới thu hồi"',
    });

    const outcome = await ledger.reverseEntry({
      entryId: Number(entryRow.id),
      actorUserId: Referrer,
      reason: 'Tài khoản ảo — thu hồi thưởng giới thiệu',
    });
    check('đảo được bút toán thưởng', outcome.status === 'REVERSED', outcome.status);

    const [after] = await dataSource.query<
      { balance: number; raw_balance: number; lifetime: number }[]
    >(
      `SELECT balance, raw_balance, lifetime FROM user_point_balances
       WHERE user_id = $1`,
      [Referrer],
    );
    check(
      'nợ ghi ở raw_balance và được phép ÂM',
      Number(after.raw_balance) < 0,
      `raw_balance=${after.raw_balance}`,
    );
    check(
      'còn balance kỹ về 0 nên CHK_user_point_balances_balance không vỡ',
      Number(after.balance) === 0,
      `balance=${after.balance}`,
    );
    check(
      'và lifetime BỊ TRỪ — hạng không giữ được sàn do điểm farm thổi lên',
      Number(after.lifetime) === Number(before.lifetime) - 56,
      `${before.lifetime} -> ${after.lifetime}`,
    );
    check(
      'đảo lần thứ hai bị từ chối, không trừ hai lần',
      (
        await ledger.reverseEntry({
          entryId: Number(entryRow.id),
          actorUserId: Referrer,
          reason: 'Bấm lại lần nữa',
        })
      ).status !== 'REVERSED',
    );

  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Giới thiệu: hoãn chứ không mất, không trả cho tài khoản đã khoá, và bộ đếm rank không tính tài khoản ảo'
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
