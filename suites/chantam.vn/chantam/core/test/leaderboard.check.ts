/**
 * Bảng thành tích tháng trên Postgres THẬT (thiết kế 24/10/2026).
 *
 * Unit test mock repository nên không thấy câu SQL: ranh giới tháng giờ Việt Nam, "ngày bù
 * không tính", "đóng góp không thực nhận gì không tính", phá hoà, và — quan trọng nhất —
 * danh tính người ẩn danh không ra khỏi câu SQL. Chỉ database trả lời được.
 *
 *   npm run test:leaderboard
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { CreateLeaderboardExclusionUseCase } from '../src/application/implementations/leaderboard/admin-leaderboard.use-cases';
import { CloseLeaderboardMonthUseCase } from '../src/application/implementations/leaderboard/close-leaderboard-month.use-case';
import { DispatchNotificationUseCase } from '../src/application/implementations/notification/dispatch-notification.use-case';
import { GetOwnProfileUseCase } from '../src/application/implementations/profile/get-own-profile.use-case';
import { GetPublicProfileUseCase } from '../src/application/implementations/profile/get-public-profile.use-case';
import {
  ILeaderboardRow,
  IUserBadge,
} from '../src/domain/ports/repository/leaderboard.repository';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { LeaderboardRepository } from '../src/infrastructure/repository/leaderboard.repository';
import { NotificationRepository } from '../src/infrastructure/repository/notification.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_leaderboard_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const October = '2026-10-01';
const November = '2026-11-01';

const id = (n: number) =>
  `7a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Giver1 = id(1);
const Giver2 = id(2);
const Giver3 = id(3);
const Receiver = id(4);
const Anon = id(5);
const Locked = id(6);
const Excluded = id(7);
const ExcludedThenRestored = id(8);
const Contributor = id(9);
const Organizer = id(10);
const Steady = id(11);
const AlmostSteady = id(12);
const Admin = id(13);

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

const ranking = (rows: readonly ILeaderboardRow[]) =>
  rows
    .map((row) => `${row.rank}:${row.userId.slice(-2)}x${row.count}`)
    .join(' ');

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

    for (const [userId, username] of [
      [Giver1, 'lb_giver1'],
      [Giver2, 'lb_giver2'],
      [Giver3, 'lb_giver3'],
      [Receiver, 'lb_receiver'],
      [Anon, 'lb_anon'],
      [Locked, 'lb_locked'],
      [Excluded, 'lb_excluded'],
      [ExcludedThenRestored, 'lb_restored'],
      [Contributor, 'lb_contributor'],
      [Organizer, 'lb_organizer'],
      [Steady, 'lb_steady'],
      [AlmostSteady, 'lb_almost'],
      [Admin, 'lb_admin'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status, full_name)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', $3)`,
        [userId, username, `Tên thật ${username}`],
      );

    // Mỗi lượt trao một bài riêng — không vướng luật hàng đợi của một bài.
    let postSeq = 0;
    const deal = async (
      giverId: string,
      receiverId: string,
      status: 'COMPLETED' | 'DELIVERING' | 'CANCELLED',
      completedAt: string,
      postType: 'OFFER' | 'WANTED' = 'OFFER',
    ) => {
      postSeq += 1;
      const postId = `7b000000-0000-4000-8000-${String(postSeq).padStart(12, '0')}`;
      await sql(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count)
         VALUES ($1, $2, $3, $4, 'Bài kiểm bảng thành tích', 'Mô tả đủ dài cho bài kiểm bảng',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'COMPLETED', 1, 0, '{}'::jsonb, 0)`,
        [
          postId,
          postType,
          postType === 'OFFER' ? giverId : receiverId,
          CategoryId,
        ],
      );
      // `$5` là bản TEXT của trạng thái — dùng lại `$4` (cột enum) trong phép so chuỗi là 42P08.
      await sql(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, quantity, status,
            accepted_at, handed_over_at, completed_at, closed_at, close_reason, closed_by)
         VALUES (gen_random_uuid(), $1, $2, $3, 1, $4, $6::timestamptz - interval '1 day',
                 CASE WHEN $5::text IN ('DELIVERING', 'COMPLETED') THEN $6::timestamptz END,
                 CASE WHEN $5::text = 'COMPLETED' THEN $6::timestamptz END,
                 CASE WHEN $5::text = 'CANCELLED' THEN $6::timestamptz END,
                 CASE WHEN $5::text = 'CANCELLED' THEN 'Kiểm bảng' END,
                 CASE WHEN $5::text = 'CANCELLED' THEN $2::uuid END)`,
        [postId, giverId, receiverId, status, status, completedAt],
      );
      return postId;
    };

    // Người cho, tháng 10.
    await deal(Giver1, Receiver, 'COMPLETED', '2026-10-05T03:00:00Z');
    const lateGiver1Post = await deal(
      Giver1,
      Receiver,
      'COMPLETED',
      '2026-10-20T03:00:00Z',
    );
    await deal(Giver1, Receiver, 'CANCELLED', '2026-10-21T03:00:00Z');
    await deal(Giver1, Receiver, 'DELIVERING', '2026-10-22T03:00:00Z');
    // Bài Muốn Nhận: tác giả là người NHẬN, Giver2 là người tặng.
    await deal(Giver2, Receiver, 'COMPLETED', '2026-10-10T03:00:00Z', 'WANTED');
    await deal(Giver2, Receiver, 'COMPLETED', '2026-10-15T03:00:00Z');
    // Ranh giới: 23:30 ngày 31/10 giờ VN thuộc tháng 10; 00:30 ngày 1/11 thuộc tháng 11.
    await deal(Giver3, Receiver, 'COMPLETED', '2026-10-31T16:30:00Z');
    await deal(Giver3, Receiver, 'COMPLETED', '2026-10-31T17:30:00Z');
    await deal(Anon, Receiver, 'COMPLETED', '2026-10-02T03:00:00Z');
    await deal(Locked, Receiver, 'COMPLETED', '2026-10-03T03:00:00Z');
    for (const day of ['04', '06', '08'])
      await deal(Excluded, Receiver, 'COMPLETED', `2026-10-${day}T03:00:00Z`);
    await deal(
      ExcludedThenRestored,
      Receiver,
      'COMPLETED',
      '2026-10-25T03:00:00Z',
    );

    // Từ thiện: một hoạt động, hai lượt giao nhận COMPLETED của cùng người — một lượt thực
    // nhận được, một lượt xác nhận là không nhận được gì.
    const [campaign] = await sql(
      `INSERT INTO campaigns
         (title, slug, description, banner_url, badge_name, start_time, end_time,
          created_by, approval_status, approved_at)
       VALUES ('Hoạt động kiểm bảng', 'hoat-dong-kiem-bang', 'Mô tả hoạt động kiểm bảng',
               'https://example.com/banner.png', 'Kiểm', '2026-09-01T00:00:00Z',
               '2026-12-31T00:00:00Z', $1, 'APPROVED', now())
       RETURNING global_id`,
      [Organizer],
    );
    const [need] = await sql(
      `INSERT INTO campaign_need_items (campaign_id, item_name, unit, target_quantity)
       VALUES ($1, 'Gạo', 'kg', 100) RETURNING global_id`,
      [campaign.global_id],
    );
    const delivery = async (received: number, completedAt: string) => {
      const [contribution] = await sql(
        `INSERT INTO campaign_contributions
           (campaign_id, contributor_id, status, decided_at, decided_by)
         VALUES ($1, $2, 'ACCEPTED', $3::timestamptz - interval '1 day', $4)
         RETURNING global_id`,
        [campaign.global_id, Contributor, completedAt, Organizer],
      );
      const [item] = await sql(
        `INSERT INTO campaign_contribution_items
           (contribution_id, need_item_id, offered_quantity, accepted_quantity)
         VALUES ($1, $2, 5, 5) RETURNING global_id`,
        [contribution.global_id, need.global_id],
      );
      const [row] = await sql(
        `INSERT INTO campaign_deliveries
           (campaign_id, contribution_id, contributor_id, organizer_id, status,
            completed_at, completed_by)
         VALUES ($1, $2, $3, $4, 'COMPLETED', $5::timestamptz, $4)
         RETURNING global_id`,
        [
          campaign.global_id,
          contribution.global_id,
          Contributor,
          Organizer,
          completedAt,
        ],
      );
      await sql(
        `INSERT INTO campaign_delivery_items
           (delivery_id, contribution_item_id, need_item_id, accepted_quantity, received_quantity)
         VALUES ($1, $2, $3, 5, $4)`,
        [row.global_id, item.global_id, need.global_id, received],
      );
    };
    await delivery(2, '2026-10-12T03:00:00Z');
    await delivery(0, '2026-10-13T03:00:00Z');

    // Chuyên cần: Steady 10 ngày thật + 2 ngày bù; AlmostSteady 9 ngày.
    const [{ version }] = await sql(
      `SELECT version FROM check_in_policy_revisions ORDER BY version LIMIT 1`,
    );
    const checkIns = async (
      userId: string,
      normalDays: number,
      repairDays: number,
    ) => {
      const [run] = await sql(
        `INSERT INTO check_in_runs (user_id, start_date, latest_covered_date, current_length, status)
         VALUES ($1, '2026-10-01', '2026-10-31', $2, 'ENDED') RETURNING id`,
        [userId, normalDays + repairDays],
      );
      for (let day = 1; day <= normalDays + repairDays; day += 1)
        await sql(
          `INSERT INTO check_in_entries
             (user_id, policy_date, kind, run_id, streak_day, policy_version,
              daily_points_awarded, created_at)
           VALUES ($1, $2::date, $3, $4, $5, $6, 0, $2::date + time '08:00')`,
          [
            userId,
            `2026-10-${String(day).padStart(2, '0')}`,
            day <= normalDays ? 'NORMAL' : 'REPAIR',
            run.id,
            day,
            version,
          ],
        );
    };
    await checkIns(Steady, 10, 2);
    await checkIns(AlmostSteady, 9, 0);

    const repository = new LeaderboardRepository(dataSource.manager);

    console.log('0. Truy vấn đếm theo tháng có index dùng được');
    // Bảng tháng hiện tại tính lại sau mỗi lần cache hết hạn, và `check_in_entries` lớn thêm
    // khoảng một dòng mỗi người mỗi ngày. Không index bắt đầu bằng cột thời gian thì mọi
    // lần tính là quét cả bảng. Tắt seq scan để hỏi đúng câu "planner CÓ dùng được không".
    const explainUses = async (query: string, index: string) => {
      const runner = dataSource.createQueryRunner();
      try {
        await runner.query('SET enable_seqscan = off');
        const plan = (await runner.query(`EXPLAIN ${query}`)) as {
          'QUERY PLAN': string;
        }[];
        return plan
          .map((line) => line['QUERY PLAN'])
          .join(' ')
          .includes(index);
      } finally {
        await runner.query('RESET enable_seqscan');
        await runner.release();
      }
    };
    check(
      'gift_transactions: index theo completed_at cho lượt COMPLETED',
      await explainUses(
        `SELECT giver_id, count(*) FROM gift_transactions
          WHERE status = 'COMPLETED' AND completed_at >= '2026-09-30T17:00Z'
            AND completed_at < '2026-10-31T17:00Z' GROUP BY giver_id`,
        'IDX_gift_transactions_completed_month',
      ),
    );
    check(
      'campaign_deliveries: index theo completed_at cho lượt COMPLETED',
      await explainUses(
        `SELECT contributor_id, count(*) FROM campaign_deliveries
          WHERE status = 'COMPLETED' AND completed_at >= '2026-09-30T17:00Z'
            AND completed_at < '2026-10-31T17:00Z' GROUP BY contributor_id`,
        'IDX_campaign_deliveries_completed_month',
      ),
    );
    check(
      'check_in_entries: index theo policy_date cho ngày NORMAL',
      await explainUses(
        `SELECT user_id, count(*) FROM check_in_entries
          WHERE kind = 'NORMAL' AND policy_date >= '2026-10-01'
            AND policy_date < '2026-11-01' GROUP BY user_id`,
        'IDX_check_in_entries_normal_month',
      ),
    );

    console.log('\n1. Người cho — đếm gì, tháng nào, xếp ra sao');
    await repository.createExclusion({
      month: October,
      board: 'GIVERS' as never,
      userId: Excluded,
      reason: 'Tự trao qua lại với tài khoản phụ',
      actorUserId: Admin,
    });
    const restored = await repository.createExclusion({
      month: October,
      board: null,
      userId: ExcludedThenRestored,
      reason: 'Loại nhầm',
      actorUserId: Admin,
    });
    await repository.removeExclusion({
      exclusionId: restored.exclusionId,
      actorUserId: Admin,
    });
    await repository.setAnonymous(Anon, true);

    const givers = await repository.computeLive({
      month: October,
      board: 'GIVERS' as never,
      minCount: 1,
    });
    const byUser = new Map(givers.map((row) => [row.userId, row]));
    check(
      'chỉ lượt COMPLETED của người tặng, cả bài Muốn Tặng lẫn Muốn Nhận',
      byUser.get(Giver1)?.count === 2 && byUser.get(Giver2)?.count === 2,
      ranking(givers),
    );
    check(
      'phá hoà: cùng 2 lượt, người đạt lượt thứ hai SỚM hơn đứng trên',
      givers[0]?.userId === Giver2 && givers[1]?.userId === Giver1,
      ranking(givers),
    );
    check(
      'ranh giới tháng giờ VN: 23:30 ngày 31/10 thuộc tháng 10, 00:30 ngày 1/11 thì không',
      byUser.get(Giver3)?.count === 1,
      String(byUser.get(Giver3)?.count),
    );
    const november = await repository.computeLive({
      month: November,
      board: 'GIVERS' as never,
      minCount: 1,
    });
    check(
      'lượt lúc 00:30 ngày 1/11 giờ VN nằm ở bảng tháng 11',
      november.length === 1 && november[0].userId === Giver3,
      ranking(november),
    );
    check(
      'người tặng một lượt sớm nhất đứng đầu nhóm một lượt (hạng 3)',
      givers[2]?.userId === Anon,
      ranking(givers),
    );
    check(
      'loại theo bảng thì vắng mặt; lượt loại đã bỏ thì có mặt lại',
      !byUser.has(Excluded) && byUser.has(ExcludedThenRestored),
    );
    check(
      'hạng liền 1..n, không hạng đồng',
      givers.every((row, index) => row.rank === index + 1),
    );
    check('người nhận không lên bảng Người cho', !byUser.has(Receiver));

    console.log('\n2. Ẩn danh — danh tính không ra khỏi SQL');
    check(
      'dòng ẩn danh: identity null, userId vẫn có cho tầng use case',
      byUser.get(Anon)?.isAnonymous === true &&
        byUser.get(Anon)?.identity === null,
    );
    check(
      'dòng thường có danh tính',
      byUser.get(Giver1)?.identity?.username === 'lb_giver1',
    );
    check(
      'toàn bộ kết quả công khai không chứa tên thật hay username của người ẩn danh',
      !JSON.stringify(givers).includes('lb_anon'),
    );
    const revealed = await repository.computeLive({
      month: October,
      board: 'GIVERS' as never,
      minCount: 1,
      revealIdentity: true,
      includeExcluded: true,
    });
    check(
      'Admin (revealIdentity) thấy danh tính thật của người ẩn danh',
      revealed.find((row) => row.userId === Anon)?.identity?.username ===
        'lb_anon',
    );
    check(
      'Admin (includeExcluded) thấy cả người bị loại, có đánh dấu',
      revealed.find((row) => row.userId === Excluded)?.excluded === true,
    );
    check(
      'isAnonymous đọc lại đúng',
      (await repository.isAnonymous(Anon)) &&
        !(await repository.isAnonymous(Giver1)),
    );

    console.log('\n3. Từ thiện và Chuyên cần');
    const charity = await repository.computeLive({
      month: October,
      board: 'CHARITY' as never,
      minCount: 1,
    });
    check(
      'lượt giao nhận không thực nhận được gì KHÔNG tính',
      charity.length === 1 &&
        charity[0].userId === Contributor &&
        charity[0].count === 1,
      ranking(charity),
    );
    const steady = await repository.computeLive({
      month: October,
      board: 'CONSISTENCY' as never,
      minCount: 10,
    });
    check(
      'ngày bù KHÔNG tính; sàn 10 ngày loại người 9 ngày',
      steady.length === 1 &&
        steady[0].userId === Steady &&
        steady[0].count === 10,
      ranking(steady),
    );
    const lowerFloor = await repository.computeLive({
      month: October,
      board: 'CONSISTENCY' as never,
      minCount: 9,
    });
    check('hạ sàn xuống 9 thì người 9 ngày có mặt', lowerFloor.length === 2);

    console.log('\n4. Chốt sổ');
    const expiresAt = new Date('2027-01-31T17:00:00Z');
    const closed = await repository.closeBoard({
      month: October,
      board: 'GIVERS' as never,
      rows: await repository.computeLive({
        month: October,
        board: 'GIVERS' as never,
        minCount: 1,
        revealIdentity: true,
      }),
      awardBadges: { ranks: 3, expiresAt },
    });
    check(
      'chốt lần đầu ghi bản chốt và 3 huy hiệu',
      closed.created && closed.badges.length === 3,
      JSON.stringify(closed.badges.map((badge) => badge.rank)),
    );
    const again = await repository.closeBoard({
      month: October,
      board: 'GIVERS' as never,
      rows: givers,
      awardBadges: { ranks: 3, expiresAt },
    });
    const [{ entries, badges }] = await sql(
      `SELECT (SELECT count(*)::int FROM leaderboard_entries) AS entries,
              (SELECT count(*)::int FROM user_badges) AS badges`,
    );
    check(
      'chốt lần hai không ghi gì',
      !again.created &&
        again.badges.length === 0 &&
        entries === givers.length &&
        badges === 3,
      `entries=${entries} badges=${badges}`,
    );

    const snapshot = await repository.findSnapshot(October, 'GIVERS' as never);
    check('đọc lại được bản chốt', snapshot !== null && snapshot.badgesAwarded);
    check(
      'tháng đã chốt nằm trong danh sách',
      JSON.stringify(await repository.listClosedMonths()) ===
        JSON.stringify([October]),
    );

    // Dữ liệu đổi SAU khi chốt.
    await sql(
      `UPDATE gift_transactions
          SET status = 'CANCELLED', completed_at = NULL, closed_at = now(),
              close_reason = 'Mở lại sau chốt', closed_by = giver_id
        WHERE post_id = $1`,
      [lateGiver1Post],
    );
    await sql(`UPDATE users SET status = 'BANNED' WHERE global_id = $1`, [
      Locked,
    ]);
    await repository.setAnonymous(Giver1, true);

    const page = await repository.listSnapshotEntries({
      snapshotId: snapshot!.id,
      skip: 0,
      take: 50,
    });
    const snapshotByUser = new Map(page.items.map((row) => [row.userId, row]));
    check(
      'bản chốt KHÔNG đổi khi lượt trao bị huỷ sau chốt',
      snapshotByUser.get(Giver1)?.count === 2 && page.total === givers.length,
      ranking(page.items),
    );
    check(
      'cờ ẩn danh của bản chốt là cờ LÚC CHỐT — bật ẩn danh sau đó không ẩn ngược',
      snapshotByUser.get(Giver1)?.isAnonymous === false &&
        snapshotByUser.get(Giver1)?.identity?.username === 'lb_giver1',
    );
    const lockedRow = snapshotByUser.get(Locked);
    check(
      'tài khoản bị khoá sau chốt: giữ hạng, mất danh tính, isInactive',
      lockedRow !== undefined &&
        lockedRow.isInactive &&
        lockedRow.identity === null &&
        lockedRow.rank === byUser.get(Locked)?.rank,
      JSON.stringify(lockedRow),
    );
    check(
      'bản chốt công khai cũng không chứa danh tính người ẩn danh',
      !JSON.stringify(page.items).includes('lb_anon'),
    );
    const ownAnonRow = await repository.findSnapshotEntry(snapshot!.id, Anon);
    check(
      'dòng của CHÍNH người ẩn danh có danh tính của họ',
      ownAnonRow?.identity?.username === 'lb_anon' && ownAnonRow.rank === 3,
    );
    const pageTwo = await repository.listSnapshotEntries({
      snapshotId: snapshot!.id,
      skip: 2,
      take: 2,
    });
    check(
      'phân trang bản chốt theo hạng',
      pageTwo.items.map((row) => row.rank).join(',') === '3,4' &&
        pageTwo.total === givers.length,
    );

    console.log('\n5. Huy hiệu');
    const now = new Date('2026-11-02T00:00:00Z');
    await sql(
      `INSERT INTO user_badges (user_id, board, month, rank, is_anonymous, awarded_at, expires_at)
       VALUES ($1, 'CHARITY', '2026-06-01', 1, false, '2026-07-01', '2026-09-30T17:00:00Z')`,
      [Giver2],
    );
    const anonPublic = await repository.listBadges({
      userId: Anon,
      scope: 'PUBLIC_ACTIVE',
      now,
    });
    const anonOwn = await repository.listBadges({
      userId: Anon,
      scope: 'OWN_ACTIVE',
      now,
    });
    check(
      'huy hiệu giành lúc ẩn danh KHÔNG vào hồ sơ công khai, có ở hồ sơ của chính họ',
      anonPublic.length === 0 &&
        anonOwn.length === 1 &&
        anonOwn[0].isAnonymous &&
        anonOwn[0].rank === 3,
    );
    // Giver1 bật ẩn danh SAU khi chốt — huy hiệu tháng 10 của họ vẫn công khai.
    check(
      'huy hiệu giành lúc CÔNG KHAI vẫn công khai',
      (
        await repository.listBadges({
          userId: Giver1,
          scope: 'PUBLIC_ACTIVE',
          now,
        })
      ).length === 1,
    );
    const giver2Own = await repository.listBadges({
      userId: Giver2,
      scope: 'OWN_ACTIVE',
      now,
    });
    const giver2All = await repository.listBadges({
      userId: Giver2,
      scope: 'ALL',
      now,
    });
    check(
      'huy hiệu hết hạn không hiện, vẫn còn trong lịch sử',
      giver2Own.length === 1 && giver2All.length === 2,
      `own=${giver2Own.length} all=${giver2All.length}`,
    );
    check(
      'huy hiệu tháng 10 hết hạn đúng lúc 00:00 ngày 1/2 giờ VN',
      giver2Own[0].expiresAt.toISOString() === expiresAt.toISOString() &&
        giver2Own[0].month === October,
    );

    const target = giver2Own[0] as IUserBadge;
    const revoked = await repository.revokeBadge({
      badgeId: target.badgeId,
      actorUserId: Admin,
      reason: 'Gian lận lượt trao',
    });
    check(
      'gỡ huy hiệu: ghi lý do, thôi hiện',
      revoked?.revokeReason === 'Gian lận lượt trao' &&
        (
          await repository.listBadges({
            userId: Giver2,
            scope: 'OWN_ACTIVE',
            now,
          })
        ).length === 0,
    );
    check(
      'gỡ lần hai trả null',
      (await repository.revokeBadge({
        badgeId: target.badgeId,
        actorUserId: Admin,
        reason: 'Gỡ lại',
      })) === null,
    );
    check(
      'gỡ huy hiệu KHÔNG đôn hạng trong bản chốt',
      (await repository.findSnapshotEntry(snapshot!.id, Giver2))?.rank === 1,
    );
    const adminBadges = await repository.listBadgesForAdmin({
      month: October,
      skip: 0,
      take: 10,
    });
    check(
      'Admin liệt kê huy hiệu theo tháng',
      adminBadges.total === 3 && adminBadges.items.length === 3,
      String(adminBadges.total),
    );

    console.log('\n6. Lượt loại');
    let duplicateRejected = false;
    try {
      await repository.createExclusion({
        month: October,
        board: 'GIVERS' as never,
        userId: Excluded,
        reason: 'Loại lần hai',
        actorUserId: Admin,
      });
    } catch {
      duplicateRejected = true;
    }
    check('loại trùng bị database chặn', duplicateRejected);
    check(
      'bỏ lượt loại đã bỏ trả null',
      (await repository.removeExclusion({
        exclusionId: restored.exclusionId,
        actorUserId: Admin,
      })) === null,
    );
    const exclusions = await repository.listExclusions({
      month: October,
      skip: 0,
      take: 10,
    });
    check(
      'liệt kê lượt loại của tháng, gồm cả lượt đã bỏ',
      exclusions.total === 2,
      String(exclusions.total),
    );

    console.log(
      '\n7. Chốt sổ cả tháng qua use case — cấu hình và thông báo THẬT',
    );
    // Cấu hình đọc từ `system_configs` mà migration đã seed; thông báo đi qua dispatch thật
    // vào bảng `notifications` để `CHK_notifications_target` nói lời cuối về đích LEADERBOARD.
    const closeMonth = new CloseLeaderboardMonthUseCase(
      repository,
      new AdminConfigRepository(dataSource.manager),
      new DispatchNotificationUseCase(
        new NotificationRepository(dataSource.manager),
        { canSend: async () => false, send: async () => 0 } as never,
        { findEnabled: async () => null } as never,
      ),
    );
    const firstOfNovember = new Date('2026-10-31T17:05:00Z');
    const monthResult = await closeMonth.handle({ now: firstOfNovember });
    const byBoard = new Map(
      monthResult.boards.map((board) => [board.board, board]),
    );
    check(
      'mặc định chốt tháng 10; GIVERS đã chốt ở nhóm 4 nên bỏ qua',
      monthResult.month === '2026-10' &&
        byBoard.get('GIVERS' as never)?.created === false &&
        byBoard.get('CHARITY' as never)?.created === true &&
        byBoard.get('CONSISTENCY' as never)?.created === true,
      JSON.stringify(monthResult.boards),
    );
    check(
      'sàn Chuyên cần đọc từ cấu hình seed (10 ngày): chỉ người đủ 10 ngày lên bản chốt',
      byBoard.get('CONSISTENCY' as never)?.entries === 1,
    );
    const notices = await sql(
      `SELECT user_id, target_type, target_id, body FROM notifications
        WHERE type = 'LEADERBOARD_BADGE_AWARDED' ORDER BY user_id`,
    );
    check(
      'người nhận huy hiệu từ thiện và chuyên cần được báo, đích LEADERBOARD không id',
      notices.length === 2 &&
        notices.every(
          (notice: { target_type: string; target_id: string | null }) =>
            notice.target_type === 'LEADERBOARD' && notice.target_id === null,
        ) &&
        notices.some(
          (notice: { user_id: string; body: string }) =>
            notice.user_id === Steady &&
            notice.body === 'Bạn đứng thứ 1 bảng Chuyên cần tháng 10/2026.',
        ),
      JSON.stringify(notices),
    );
    await closeMonth.handle({ month: '2026-10', now: firstOfNovember });
    const [{ total: noticeTotal }] = await sql(
      `SELECT count(*)::int AS total FROM notifications
        WHERE type = 'LEADERBOARD_BADGE_AWARDED'`,
    );
    check('chạy lại cùng tháng không gửi thêm thông báo', noticeTotal === 2);
    let currentMonthRejected = false;
    try {
      await closeMonth.handle({ month: '2026-11', now: firstOfNovember });
    } catch {
      currentMonthRejected = true;
    }
    check('không chốt được tháng đang chạy', currentMonthRejected);

    console.log('\n8. Hồ sơ — huy hiệu ẩn danh không ra kênh công khai');
    // Use case hồ sơ THẬT trên repository bảng thành tích THẬT; phần còn lại của hồ sơ
    // (bài, điểm, đánh giá) stub vì không liên quan câu hỏi đang kiểm.
    const findUser = async (userId: string) => {
      const [found] = await sql(
        `SELECT global_id AS "globalId", username, full_name AS "fullName",
                avatar_url AS "avatarUrl", rank, status,
                leaderboard_anonymous AS "leaderboardAnonymous"
         FROM users WHERE global_id = $1`,
        [userId],
      );
      return found;
    };
    const reviewStub = {
      getAccuracy: async () => ({ percent: null, samples: 0 }),
      getRating: async () => ({
        asGiver: { average: null, samples: 0 },
        asReceiver: { average: null, samples: 0 },
      }),
    };
    const configStub = { getConfigValue: async () => null };
    const publicProfile = (userId: string) =>
      new GetPublicProfileUseCase(
        { findActiveByUsername: async () => findUser(userId) } as never,
        { countPublishedByAuthor: async () => 0 } as never,
        { getSummary: async () => ({ balance: 0, lifetime: 0 }) } as never,
        { web: { publicBaseUrl: '' } } as never,
        reviewStub as never,
        configStub as never,
        repository,
      ).handle({ username: 'x' });
    const ownProfile = (userId: string) =>
      new GetOwnProfileUseCase(
        {
          findOneBy: async () => findUser(userId),
          query: async () => [],
        } as never,
        { getOwnSummary: async () => null } as never,
        { handle: async () => ({ point: null }) } as never,
        { handle: async () => ({ rank: null }) } as never,
        {
          handle: async () => ({ entitlements: null, groupCreation: null }),
        } as never,
        reviewStub as never,
        configStub as never,
        repository,
      ).handle({ userId });

    // Anon giành hạng 3 bảng Người cho lúc đang ẩn danh. Tắt ẩn danh rồi vẫn không lộ.
    await repository.setAnonymous(Anon, false);
    const anonPublicProfile = await publicProfile(Anon);
    const anonOwnProfile = await ownProfile(Anon);
    check(
      'hồ sơ CÔNG KHAI của người giành huy hiệu lúc ẩn danh: không có huy hiệu, kể cả sau khi tắt ẩn danh',
      anonPublicProfile.profile.badges.length === 0,
      JSON.stringify(anonPublicProfile.profile.badges),
    );
    check(
      'hồ sơ CỦA TÔI vẫn thấy huy hiệu đó, có đánh dấu ẩn danh',
      anonOwnProfile.profile.badges?.length === 1 &&
        anonOwnProfile.profile.badges[0].isAnonymous &&
        anonOwnProfile.profile.badges[0].month === '2026-10',
      JSON.stringify(anonOwnProfile.profile.badges),
    );
    const giver1Public = await publicProfile(Giver1);
    check(
      'huy hiệu giành lúc công khai hiện trên hồ sơ công khai',
      giver1Public.profile.badges.length === 1 &&
        giver1Public.profile.badges[0].board === 'GIVERS' &&
        giver1Public.profile.badges[0].rank === 2,
      JSON.stringify(giver1Public.profile.badges),
    );

    console.log('\n9. Admin loại người qua use case — database và audit THẬT');
    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const exclude = new CreateLeaderboardExclusionUseCase(
      repository,
      adminConfig,
      {
        findOneBy: async () => ({ globalId: Giver3, deletedAt: null }),
      } as never,
    );
    await exclude.handle({
      actorUserId: Admin,
      month: '2026-11',
      board: null,
      userId: Giver3,
      reason: 'Nghi tự trao qua lại',
    });
    const novemberAfter = await repository.computeLive({
      month: November,
      board: 'GIVERS' as never,
      minCount: 1,
    });
    check(
      'loại khỏi mọi bảng của tháng 11 thì biến khỏi bảng trực tiếp',
      novemberAfter.length === 0,
      ranking(novemberAfter),
    );
    const [audit] = await sql(
      `SELECT action, resource_type, reason FROM admin_audit_logs
        WHERE actor_user_id = $1 AND action = 'LEADERBOARD_EXCLUDE'`,
      [Admin],
    );
    check(
      'lượt loại có dòng audit kèm lý do',
      audit?.resource_type === 'LEADERBOARD_EXCLUSION' &&
        audit?.reason === 'Nghi tự trao qua lại',
      JSON.stringify(audit),
    );
    let duplicateCode = '';
    try {
      await exclude.handle({
        actorUserId: Admin,
        month: '2026-11',
        board: null,
        userId: Giver3,
        reason: 'Loại lần hai',
      });
    } catch (error) {
      duplicateCode = (error as Error).constructor.name;
    }
    check(
      'loại trùng qua use case ra LeaderboardExclusionExistsException (409), không 500',
      duplicateCode === 'LeaderboardExclusionExistsException',
      duplicateCode,
    );
    let closedCode = '';
    try {
      await exclude.handle({
        actorUserId: Admin,
        month: '2026-10',
        board: 'GIVERS' as never,
        userId: Giver3,
        reason: 'Loại tháng đã chốt',
      });
    } catch (error) {
      closedCode = (error as Error).constructor.name;
    }
    check(
      'loại ở tháng đã chốt bị từ chối',
      closedCode === 'LeaderboardMonthClosedException',
      closedCode,
    );

    console.log('\n10. Danh tính đọc MỚI cho trang của bảng trực tiếp');
    // Trạng thái lúc này: Giver1 đã bật ẩn danh (nhóm 4), Anon đã tắt (nhóm 8), Locked bị khoá.
    const live = await repository.findLiveIdentities([
      Giver1,
      Anon,
      Locked,
      '7a000000-0000-4000-8000-0000000000ff',
    ]);
    check(
      'người vừa bật ẩn danh: isAnonymous, không danh tính',
      live.get(Giver1)?.isAnonymous === true &&
        live.get(Giver1)?.identity === null,
      JSON.stringify(live.get(Giver1)),
    );
    check(
      'người vừa tắt ẩn danh: có danh tính',
      live.get(Anon)?.isAnonymous === false &&
        live.get(Anon)?.identity?.username === 'lb_anon',
    );
    check(
      'tài khoản bị khoá: không danh tính',
      live.get(Locked)?.identity === null,
    );
    check(
      'id không có trong users thì vắng khỏi kết quả',
      !live.has('7a000000-0000-4000-8000-0000000000ff') && live.size === 3,
    );
    check(
      'danh sách rỗng không chạm database',
      (await repository.findLiveIdentities([])).size === 0,
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
        ? 'Bảng thành tích: đếm đúng ba nguồn theo tháng giờ VN, phá hoà theo đạt sớm, ẩn danh không lộ, chốt sổ một lần và bất biến, huy hiệu đúng hạn và đúng phạm vi hiển thị'
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
