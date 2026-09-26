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
      'REPORT_UPHELD vẫn TẮT — Bên A chưa chốt thưởng cho người báo xấu',
      byCode.get('REPORT_UPHELD')?.is_enabled === false,
      `is_enabled=${byCode.get('REPORT_UPHELD')?.is_enabled}`,
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
