/**
 * Kiểm các con số vòng đời điểm trên Postgres THẬT.
 *
 * Bốn thứ unit test mock không thấy được:
 *
 * 1. Migration seed đúng giá trị, và `ON CONFLICT DO NOTHING` không nuốt mất
 *    bản ghi lẽ ra phải có.
 * 2. Ràng buộc `CHK_rank_tiers_maintenance_penalty` thật sự chặn số âm.
 * 3. `publishMaintenancePolicy` ghi được cột mới — câu UPDATE thiếu một cột là
 *    lỗi im lặng, test mock chỉ kiểm tham số truyền vào chứ không kiểm SQL.
 * 4. Bậc có chỉ tiêu duy trì thì phải có mức phạt, nếu không cả cơ chế duy trì
 *    chỉ là trang trí.
 * 5. Dòng `point_cap_decisions = REJECTED` có SỐNG SÓT qua ngoại lệ đã sinh ra
 *    nó hay không — mock `query` không bao giờ thấy được một lần rollback.
 * 6. Trần ngày cắt theo `Asia/Ho_Chi_Minh`: chỉ Postgres tính được ranh giới đó.
 * 7. Truy vấn tìm phần thưởng còn treo nhận đúng những lượt cần nhận, và KHÔNG
 *    nhận những lượt đã trả.
 */
import {
  normalizePointRedemptionConfig,
  normalizeReviewGraceConfig,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { ReferralRepository } from '../src/infrastructure/repository/referral.repository';
import { TransactionReviewRepository } from '../src/infrastructure/repository/transaction-review.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_point_economy_check';
const ActorId = '99999999-9999-4999-8999-9999999e0001';

/**
 * Phần thưởng MỐC — thứ nuôi việc lên hạng, nên phải nằm trên lưới 56.
 *
 * Các rule tương tác vi mô (`POST_REACTED` 1đ, `POST_COMMENTED` 2đ,
 * `REPORT_UPHELD` 5đ) cố ý nằm NGOÀI lưới: chúng là tiền lẻ khuyến khích hoạt
 * động, không phải bậc thang thứ hạng. Bắt chúng theo bội số 28 sẽ biến một
 * lượt thả cảm xúc thành nửa lần xác minh số điện thoại.
 */
const MilestoneRules = [
  'GIFT_COMPLETED_GIVER',
  'GIFT_COMPLETED_RECEIVER',
  'REFERRAL_QUALIFIED',
  'ONBOARDING_COMPLETED',
  'PHONE_VERIFIED_FIRST_TIME',
];

const ExpectedPenalties = [
  ['VIEWER', 0],
  ['MEMBER', 0],
  ['SILVER', 224],
  ['GOLD', 336],
  ['DIAMOND', 448],
] as const;

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
    console.log('0. CHỈ MỘT mã rule cho phần thưởng người tặng');
    // Hai mã nghĩa là hai khoá chống trùng, nên một lượt trao được trả thưởng
    // hai lần: một lần phẳng lúc hoàn tất, một lần nữa theo % lúc đánh giá. Đã
    // xảy ra thật — xem migration 1793400000000.
    const giverRules = await dataSource.query<{ code: string }[]>(
      `SELECT code FROM point_rules
       WHERE code LIKE 'GIFT_COMPLETED%' AND code <> 'GIFT_COMPLETED_RECEIVER'`,
    );
    check(
      'đúng một mã thưởng người tặng',
      giverRules.length === 1,
      giverRules.map((rule) => rule.code).join(', '),
    );
    check(
      'và mã đó là GIFT_COMPLETED_GIVER',
      giverRules[0]?.code === 'GIFT_COMPLETED_GIVER',
      giverRules[0]?.code,
    );
    check(
      'mã GIFT_COMPLETED trùng vai đã bị gỡ',
      !giverRules.some((rule) => rule.code === 'GIFT_COMPLETED'),
    );

    console.log('\n1. Rule điểm cho lượt trao hoàn tất');
    const [giftRule] = await dataSource.query<
      { points: string; daily_cap: string | null; is_enabled: boolean }[]
    >(
      `SELECT points, daily_cap, is_enabled FROM point_rules WHERE code = 'GIFT_COMPLETED_GIVER'`,
    );
    check('GIFT_COMPLETED_GIVER tồn tại', Boolean(giftRule));
    check(
      'đáng 56 điểm — bằng một lượt giới thiệu hợp lệ',
      Number(giftRule?.points) === 56,
      `points=${giftRule?.points}`,
    );
    check(
      'có cap ngày, không phải cỗ máy in điểm',
      Number(giftRule?.daily_cap) > 0,
      `daily_cap=${giftRule?.daily_cap}`,
    );
    check('bật sẵn', giftRule?.is_enabled === true);

    // Rule là bảng copy-on-write: đọc phải lấy phiên bản MỚI NHẤT cho mỗi mã.
    // Đọc nhầm phiên bản cũ là thấy trạng thái đã bị thay thế từ lâu.
    console.log('\n1b. Rule điểm tương tác đã được bật (26/09)');
    const interactionRules = await dataSource.query<
      {
        code: string;
        points: string;
        daily_cap: string | null;
        is_enabled: boolean;
        affects_lifetime: boolean;
      }[]
    >(`
      SELECT DISTINCT ON (code)
        code, points, daily_cap, is_enabled, affects_lifetime
      FROM point_rules
      WHERE code IN ('POST_COMMENTED', 'POST_REACTED', 'REPORT_UPHELD')
      ORDER BY code ASC, version DESC
    `);
    const byCode = new Map(interactionRules.map((rule) => [rule.code, rule]));

    for (const [code, points, cap] of [
      ['POST_COMMENTED', 2, 10],
      ['POST_REACTED', 1, 20],
    ] as [string, number, number][]) {
      const rule = byCode.get(code);
      check(
        `${code} đã BẬT`,
        rule?.is_enabled === true,
        `is_enabled=${rule?.is_enabled}`,
      );
      check(
        `${code} giữ nguyên ${points}đ và trần ${cap} lượt/ngày`,
        Number(rule?.points) === points && Number(rule?.daily_cap) === cap,
        `points=${rule?.points} cap=${rule?.daily_cap}`,
      );
      // `lifetime` là sàn của Rank. Cho bình luận đẩy hạng thì gõ 300 dòng
      // "hay quá ạ" là lên Bạc, trong khi tặng một món đồ thật được 56 điểm.
      check(
        `${code} KHÔNG đẩy hạng`,
        rule?.affects_lifetime === false,
        `affects_lifetime=${rule?.affects_lifetime}`,
      );
    }

    check(
      'REPORT_UPHELD đã BẬT — chốt 29/09',
      byCode.get('REPORT_UPHELD')?.is_enabled === true,
      `is_enabled=${byCode.get('REPORT_UPHELD')?.is_enabled}`,
    );
    check(
      // Báo xấu là hành động tạo VIỆC cho người khác: mỗi lượt là một mục trong
      // hàng đợi Admin. Bỏ trần thì cách cày điểm rẻ nhất là rải báo xấu vu vơ,
      // và cái giá rơi vào thời gian của Admin chứ không phải vào người cày.
      'và GIỮ trần 5 lượt/ngày — bật thưởng mà bỏ trần là mở đường cày báo xấu',
      Number(byCode.get('REPORT_UPHELD')?.daily_cap) === 5,
      `daily_cap=${String(byCode.get('REPORT_UPHELD')?.daily_cap)}`,
    );

    console.log('\n2. Phần thưởng mốc nằm trên lưới 56');
    const rules = await dataSource.query<{ code: string; points: string }[]>(
      `SELECT code, points FROM point_rules WHERE code = ANY($1)`,
      [MilestoneRules],
    );
    check(
      'đủ cả bốn phần thưởng mốc',
      rules.length === MilestoneRules.length,
      `tìm thấy ${rules.length}`,
    );
    const tiers = await dataSource.query<
      { rank: string; threshold_points: string }[]
    >(
      `SELECT rank, threshold_points FROM rank_tiers WHERE threshold_points > 0`,
    );
    const offGrid = [
      ...rules.map((rule) => [rule.code, Number(rule.points)] as const),
      ...tiers.map(
        (tier) => [tier.rank, Number(tier.threshold_points)] as const,
      ),
    ].filter(([, value]) => value % 28 !== 0);
    check(
      'phần thưởng mốc và ngưỡng rank đều là bội số của 28 (= 56/2)',
      offGrid.length === 0,
      offGrid.map(([code, value]) => `${code}=${value}`).join(', '),
    );

    console.log('\n3. Cấu hình động đã seed và chuẩn hoá đúng');
    const configs = await dataSource.query<
      { config_key: string; value_json: unknown }[]
    >(
      `SELECT config_key, value_json FROM system_configs
       WHERE config_key IN ('point.redemption', 'review.grace')`,
    );
    const redemption = configs.find(
      (row) => row.config_key === 'point.redemption',
    );
    const grace = configs.find((row) => row.config_key === 'review.grace');
    check('point.redemption đã seed', Boolean(redemption));
    check('review.grace đã seed', Boolean(grace));

    const rate = normalizePointRedemptionConfig(redemption?.value_json);
    check(
      'tỷ lệ quy đổi 2.000 VNĐ/điểm',
      rate.vndPerPoint === 2000,
      `vndPerPoint=${rate.vndPerPoint}`,
    );
    check(
      'món 1 triệu cần 500 điểm — khoảng 9 lượt trao ở mức 100%',
      Math.round(1_000_000 / rate.vndPerPoint) === 500,
    );

    const graceConfig = normalizeReviewGraceConfig(grace?.value_json);
    check(
      'chờ 7 ngày rồi mới áp mức mặc định',
      graceConfig.graceDays === 7,
      `graceDays=${graceConfig.graceDays}`,
    );
    const [accuracyRow] = await dataSource.query<{ value_json: unknown }[]>(
      `SELECT value_json FROM system_configs WHERE config_key = 'accuracy.giver'`,
    );
    const threshold = Number(
      (accuracyRow?.value_json as Record<string, unknown>)
        ?.reviewThresholdPercent,
    );
    check(
      'mức mặc định NẰM TRÊN ngưỡng gắn cờ — không đánh giá không kéo ai vào diện xem xét',
      graceConfig.defaultAccuracyPercent >= threshold,
      `${graceConfig.defaultAccuracyPercent}% vs ngưỡng ${threshold}%`,
    );

    console.log('\n4. Mức phạt trượt nhiệm vụ theo từng bậc');
    const penalties = await dataSource.query<
      {
        rank: string;
        maintenance_gifts: string;
        maintenance_referrals: string;
        maintenance_penalty_points: string;
      }[]
    >(
      `SELECT rank, maintenance_gifts, maintenance_referrals, maintenance_penalty_points
       FROM rank_tiers`,
    );
    const byRank = new Map(penalties.map((row) => [row.rank, row]));
    for (const [rank, expected] of ExpectedPenalties) {
      const actual = Number(byRank.get(rank)?.maintenance_penalty_points);
      check(
        `${rank} phạt ${expected}`,
        actual === expected,
        `thực tế ${actual}`,
      );
    }

    const mismatched = penalties.filter((row) => {
      const quota =
        Number(row.maintenance_gifts) + Number(row.maintenance_referrals);
      return quota > 0 !== Number(row.maintenance_penalty_points) > 0;
    });
    check(
      'có chỉ tiêu thì có phạt, không chỉ tiêu thì không phạt',
      mismatched.length === 0,
      mismatched.map((row) => row.rank).join(', '),
    );

    check(
      'phạt đúng bằng số điểm đáng lẽ kiếm được nếu làm đủ nhiệm vụ',
      penalties.every((row) => {
        const quota =
          Number(row.maintenance_gifts) + Number(row.maintenance_referrals);
        return Number(row.maintenance_penalty_points) === quota * 56;
      }),
    );

    console.log('\n5. Ràng buộc chặn giá trị vô nghĩa');
    let rejectedNegative = false;
    try {
      await dataSource.query(
        `UPDATE rank_tiers SET maintenance_penalty_points = -1 WHERE rank = 'SILVER'`,
      );
    } catch {
      rejectedNegative = true;
    }
    check('database từ chối mức phạt âm', rejectedNegative);

    console.log('\n6. Admin sửa được mức phạt lúc chạy');
    const repository = new AdminConfigRepository(dataSource.manager);
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'kiem-tra-phat', 'kiem-tra-phat@chantam.test', 'x', 'DIAMOND', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [ActorId],
    );

    const reason = 'Kiểm tra mức phạt sửa được lúc chạy';
    const published = await repository.publishMaintenancePolicy({
      actorUserId: ActorId,
      changeReason: reason,
      tiers: ExpectedPenalties.map(([rank, penalty]) => ({
        rank: rank as never,
        maintenanceGifts: penalty === 0 ? 0 : penalty / 56 / 2,
        maintenanceReferrals: penalty === 0 ? 0 : penalty / 56 / 2,
        // Hạ riêng Bạc để thấy giá trị ghi được chứ không phải trùng seed.
        maintenancePenaltyPoints: rank === 'SILVER' ? 112 : penalty,
      })),
    });
    const silver = published.find((tier) => tier.rank === 'SILVER');
    check(
      'giá trị mới quay ra trong response',
      silver?.maintenancePenaltyPoints === 112,
      `nhận ${silver?.maintenancePenaltyPoints}`,
    );

    const [stored] = await dataSource.query<
      { maintenance_penalty_points: string }[]
    >(
      `SELECT maintenance_penalty_points FROM rank_tiers WHERE rank = 'SILVER'`,
    );
    check(
      'và ĐÃ GHI xuống database — câu UPDATE không bỏ sót cột',
      Number(stored?.maintenance_penalty_points) === 112,
      `trong DB là ${stored?.maintenance_penalty_points}`,
    );

    const [audit] = await dataSource.query<{ count: string; reason: string }[]>(
      `SELECT count(*) AS count, max(reason) AS reason FROM admin_audit_logs
       WHERE resource_type = 'RANK_MAINTENANCE_POLICY'
         AND action = 'PUBLISH_MAINTENANCE_POLICY'`,
    );
    check('có ghi audit', Number(audit?.count) > 0);
    check(
      'audit giữ lại LÝ DO đổi, không chỉ giữ giá trị',
      audit?.reason === reason,
      `reason=${audit?.reason}`,
    );
    console.log('\n7. Dòng ghi nhận "đã chặn vì trần ngày" sống sót qua rollback');
    // Đây là lỗi mà mock không thể thấy: dòng REJECTED nằm TRONG transaction, nên
    // chính ngoại lệ chặn nó cũng cuốn nó đi. Trước 29/09 bảng này chưa từng giữ
    // được một dòng REJECTED nào cho lối gọi qua `appendByRule`.
    const ledger = new PointLedgerRepository(dataSource.manager);
    const CappedUser = '99999999-9999-4999-8999-9999999e0002';
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'kiem-tra-cap', 'kiem-tra-cap@chantam.test', 'x', 'MEMBER', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [CappedUser],
    );
    // Một rule trần = 1 để chạm ngay ở lượt thứ hai.
    await dataSource.query(
      `INSERT INTO point_rules (code, points, is_enabled, affects_lifetime, daily_cap, version)
       VALUES ('KIEM_TRA_TRAN', 5, true, false, 1, 1)`,
    );

    const first = await ledger.appendByRule({
      userId: CappedUser,
      ruleCode: 'KIEM_TRA_TRAN',
      referenceType: 'KIEM_TRA',
      referenceId: 'lan-1',
      idempotencyKey: 'KIEM_TRA_TRAN:lan-1',
      actor: 'SYSTEM',
      source: 'KIEM_TRA',
    });
    check('lượt đầu cộng được', first.applied && first.delta === 5);

    let capped = false;
    try {
      await ledger.appendByRule({
        userId: CappedUser,
        ruleCode: 'KIEM_TRA_TRAN',
        referenceType: 'KIEM_TRA',
        referenceId: 'lan-2',
        idempotencyKey: 'KIEM_TRA_TRAN:lan-2',
        actor: 'SYSTEM',
        source: 'KIEM_TRA',
      });
    } catch {
      capped = true;
    }
    check('lượt thứ hai bị trần ngày chặn', capped);

    const decisions = await dataSource.query<
      { decision: string; idempotency_key: string; policy_date: string }[]
    >(
      // `::text` ngay trong SQL: driver trả cột `date` thành một Date của JS, và
      // so sánh nó với chuỗi ngày sẽ luôn lệch vì bị định dạng lại theo múi giờ
      // của tiến trình Node — đúng cái nhầm mà phép kiểm này đang đi tìm.
      `SELECT decision, idempotency_key, policy_date::text AS policy_date
       FROM point_cap_decisions
       WHERE user_id = $1 ORDER BY id`,
      [CappedUser],
    );
    check(
      'có ĐÚNG hai dòng: một APPLIED, một REJECTED',
      decisions.length === 2 &&
        decisions[0].decision === 'APPLIED' &&
        decisions[1].decision === 'REJECTED',
      `nhận ${JSON.stringify(decisions.map((row) => row.decision))}`,
    );
    check(
      'dòng REJECTED giữ đúng khoá của lượt bị chặn',
      decisions[1]?.idempotency_key === 'KIEM_TRA_TRAN:lan-2',
      `nhận ${decisions[1]?.idempotency_key}`,
    );

    // Trần ngày phải KHÔNG bị bút toán của "hôm qua theo giờ Việt Nam" tính vào.
    const [{ vn_date }] = await dataSource.query<{ vn_date: string }[]>(
      `SELECT (timezone('Asia/Ho_Chi_Minh', now()))::date::text AS vn_date`,
    );
    check(
      'policy_date ghi theo ngày giờ Việt Nam',
      decisions[1]?.policy_date === vn_date,
      `policy_date=${decisions[1]?.policy_date} vs VN ${vn_date}`,
    );

    // Phép kiểm phân biệt được UTC với giờ Việt Nam.
    //
    // Mốc dùng là **nửa đêm giờ VN của hôm nay + 1 phút**. Instant đó luôn nằm
    // trong ngày VN hôm nay, và luôn nằm trong ngày UTC HÔM QUA — vì nửa đêm giờ
    // VN hôm nay là 17:00 UTC hôm qua. Nên:
    //
    // - Cắt theo giờ VN: bút toán này ĐƯỢC đếm → lượt sau bị chặn.
    // - Cắt theo UTC: KHÔNG được đếm → lượt sau đi qua.
    //
    // Ghi bằng INSERT chứ không UPDATE: trigger append-only chặn mọi UPDATE, và
    // đó chính là thứ nó phải chặn.
    const SecondUser = '99999999-9999-4999-8999-9999999e0006';
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'kiem-tra-mui-gio', 'kiem-tra-mui-gio@chantam.test', 'x', 'MEMBER', 'ACTIVE')`,
      [SecondUser],
    );
    await dataSource.query(
      `INSERT INTO point_ledger
         (user_id, rule_code, rule_version, delta, balance_after, raw_balance_after,
          lifetime_after, reference_type, reference_id, idempotency_key, actor, source,
          created_at)
       VALUES ($1, 'KIEM_TRA_TRAN', 1, 5, 5, 5, 0, 'KIEM_TRA', 'dau-ngay-vn',
               'KIEM_TRA_TRAN:dau-ngay-vn', 'SYSTEM', 'KIEM_TRA',
               date_trunc('day', timezone('Asia/Ho_Chi_Minh', now()))
                 AT TIME ZONE 'Asia/Ho_Chi_Minh' + INTERVAL '1 minute')`,
      [SecondUser],
    );

    let blockedByVietnamDay = false;
    try {
      await ledger.appendByRule({
        userId: SecondUser,
        ruleCode: 'KIEM_TRA_TRAN',
        referenceType: 'KIEM_TRA',
        referenceId: 'sau-dau-ngay',
        idempotencyKey: 'KIEM_TRA_TRAN:sau-dau-ngay',
        actor: 'SYSTEM',
        source: 'KIEM_TRA',
      });
    } catch {
      blockedByVietnamDay = true;
    }
    check(
      'trần ngày ĐẾM bút toán đầu ngày giờ VN — tức cắt theo VN, không theo UTC',
      blockedByVietnamDay,
      blockedByVietnamDay ? '' : 'lượt sau vẫn đi qua → đang cắt theo UTC',
    );

    console.log('\n8. Truy vấn tìm phần thưởng còn treo');
    // `repository` là AdminConfigRepository đã dựng ở nhóm 6.
    const reviews = new TransactionReviewRepository(
      dataSource.manager,
      repository,
    );
    const Giver = '99999999-9999-4999-8999-9999999e0003';
    const Receiver = '99999999-9999-4999-8999-9999999e0004';
    const PostId = '99999999-9999-4999-8999-9999999e0010';
    const DealRated = '99999999-9999-4999-8999-9999999e0020';
    const DealPaid = '99999999-9999-4999-8999-9999999e0021';

    for (const [id, name, rank] of [
      [Giver, 'kiem-tra-tang', 'MEMBER'],
      [Receiver, 'kiem-tra-nhan', 'MEMBER'],
    ] as const)
      await dataSource.query(
        `INSERT INTO users (global_id, username, email, password_hash, rank, status)
         VALUES ($1, $2::text, $2::text || '@chantam.test', 'x', $3, 'ACTIVE')
         ON CONFLICT DO NOTHING`,
        [id, name, rank],
      );

    const CategoryId = '99999999-9999-4999-8999-9999999e0011';
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm điểm', 'kiem-diem', true)`,
      [CategoryId],
    );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Món kiểm tra',
               'Mô tả đủ dài cho bài kiểm tra vòng đời điểm',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'ARCHIVED', 1, 0, '{}'::jsonb, 0)`,
      [PostId, Giver, CategoryId],
    );

    for (const deal of [DealRated, DealPaid])
      await dataSource.query(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, quantity, status,
            accepted_at, completed_at)
         VALUES ($1, $2, $3, $4, 1, 'COMPLETED', now(), now())`,
        [deal, PostId, Giver, Receiver],
      );

    // Lượt 1: người nhận ĐÃ chấm 40%, nhưng chưa có bút toán — đúng dạng bị trần
    // ngày chặn. Trước 29/09 dạng này rơi khỏi mọi danh sách vĩnh viễn.
    await dataSource.query(
      `INSERT INTO transaction_reviews
         (global_id, transaction_id, reviewer_id, reviewee_id, reviewer_role,
          rating, accuracy_percent)
       VALUES (gen_random_uuid(), $1, $2, $3, 'RECEIVER', 4, 40)`,
      [DealRated, Receiver, Giver],
    );
    // Lượt 2: đã trả thưởng người tặng rồi — không được xuất hiện lại.
    await dataSource.query(
      `INSERT INTO point_ledger
         (user_id, rule_code, rule_version, delta, balance_after, raw_balance_after,
          lifetime_after, reference_type, reference_id, idempotency_key, actor, source)
       VALUES ($1, 'GIFT_COMPLETED_GIVER', 1, 56, 56, 56, 56,
               'GIFT_TRANSACTION', $2::text, 'GIFT_COMPLETED_GIVER:' || $2::text, 'SYSTEM', 'KIEM_TRA')`,
      [Giver, DealPaid],
    );

    const unsettledGivers = await reviews.findUnsettledGiverRewards({
      graceDays: 7,
      limit: 50,
    });
    const rated = unsettledGivers.find((row) => row.transactionId === DealRated);
    check(
      'lượt ĐÃ đánh giá mà chưa trả thưởng vẫn nằm trong danh sách',
      rated !== undefined,
    );
    check(
      'và mang theo đúng mức người nhận chấm, không phải null',
      rated?.accuracyPercent === 40,
      `nhận ${String(rated?.accuracyPercent)}`,
    );
    check(
      'lượt đã trả thưởng KHÔNG xuất hiện lại',
      unsettledGivers.every((row) => row.transactionId !== DealPaid),
    );

    const unsettledReceivers = await reviews.findUnsettledReceiverRewards({
      limit: 50,
    });
    check(
      'cả hai lượt còn treo thưởng phía người NHẬN',
      [DealRated, DealPaid].every((deal) =>
        unsettledReceivers.some((row) => row.transactionId === deal),
      ),
      `nhận ${unsettledReceivers.length} lượt`,
    );

    await dataSource.query(
      `INSERT INTO point_ledger
         (user_id, rule_code, rule_version, delta, balance_after, raw_balance_after,
          lifetime_after, reference_type, reference_id, idempotency_key, actor, source)
       VALUES ($1, 'GIFT_COMPLETED_RECEIVER', 1, 28, 28, 28, 0,
               'GIFT_TRANSACTION', $2::text, 'GIFT_COMPLETED_RECEIVER:' || $2::text, 'SYSTEM', 'KIEM_TRA')`,
      [Receiver, DealPaid],
    );
    const receiversAfter = await reviews.findUnsettledReceiverRewards({
      limit: 50,
    });
    check(
      'trả rồi thì biến khỏi danh sách phía người nhận',
      receiversAfter.every((row) => row.transactionId !== DealPaid),
    );

    console.log('\n9. Đối soát mốc một-lần tìm đúng người');
    const onboardedMissing = await ledger.findOnboardedUsersMissingReward(50);
    check(
      'người hạng khác VIEWER mà thiếu bút toán onboarding thì bị tìm ra',
      onboardedMissing.includes(Giver) && onboardedMissing.includes(Receiver),
      `nhận ${onboardedMissing.length} người`,
    );

    const ViewerUser = '99999999-9999-4999-8999-9999999e0005';
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'kiem-tra-viewer', 'kiem-tra-viewer@chantam.test', 'x', 'VIEWER', 'ACTIVE')`,
      [ViewerUser],
    );
    check(
      'người còn VIEWER thì KHÔNG bị tìm ra — họ chưa hoàn tất onboarding',
      !(await ledger.findOnboardedUsersMissingReward(50)).includes(ViewerUser),
    );

    const referrals = new ReferralRepository(dataSource.manager, ledger);
    await dataSource.query(
      `INSERT INTO referrals (referrer_id, referee_id, code)
       VALUES ($1, $2, 'KIEMTRA1')`,
      [Giver, Receiver],
    );
    const pendingReferees = await referrals.findPendingQualifications(50);
    check(
      'lượt giới thiệu treo mà người được giới thiệu đã thoát VIEWER thì tìm ra',
      pendingReferees.includes(Receiver),
      `nhận ${JSON.stringify(pendingReferees)}`,
    );

    await dataSource.query(
      `INSERT INTO referrals (referrer_id, referee_id, code)
       VALUES ($1, $2, 'KIEMTRA2')`,
      [Giver, ViewerUser],
    );
    check(
      'nhưng người được giới thiệu còn VIEWER thì KHÔNG — chưa đủ điều kiện',
      !(await referrals.findPendingQualifications(50)).includes(ViewerUser),
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Vòng đời điểm: mọi con số là cấu hình động, không hằng trong code'
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
