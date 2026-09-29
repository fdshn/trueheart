/**
 * Mọi khoá cấu hình code ĐỌC đều phải có dòng trong `system_configs`.
 *
 * ## Vì sao cần một phép kiểm riêng cho việc này
 *
 * Mọi `normalize*` đều lùi về mặc định khi thiếu dòng, nên một khoá chưa seed KHÔNG
 * làm gì đổ. Nó chỉ lặng lẽ làm hai chuyện: Admin mở trang cấu hình ra không thấy ô
 * nào để sửa, và tính năng "cấu hình động" thành ra phải deploy mới đổi được.
 *
 * Ngày 29/09 soát ra **năm** khoá như vậy, và một trong số đó tệ hơn hẳn:
 * `moderation.blocked_terms` không có dòng nào nên `normalizeBlockedTerms(null)` trả
 * `[]`, và `screenText(body, [])` trả `ALLOW` cho MỌI nội dung. Cả nhánh kiểm duyệt
 * bình luận nằm im — `ContentBlockedTermsException` chưa bao giờ được ném,
 * `PENDING_REVIEW` chưa bao giờ sinh ra, hàng đợi Admin và badge đếm số chờ duyệt
 * chưa bao giờ có gì để hiện.
 *
 * Không phép kiểm nào bắt được vì tất cả đều TRUYỀN danh sách từ vào trực tiếp.
 * Không cái nào hỏi "ngoài production thì danh sách đó có tồn tại không". Đây là
 * chỗ hỏi câu đó.
 *
 * ## Và chiều NGƯỢC LẠI, thêm 30/09
 *
 * Bản đầu của file này chỉ hỏi "khoá code đọc có dòng chưa". Nó bỏ sót hẳn chiều kia:
 * **khoá có dòng mà không ai đọc.** Soát 19-affiliate tìm ra CHÍN khoá như vậy trên
 * mười lăm — Admin mở CMS, sửa được, lưu được, và không gì thay đổi.
 *
 * Đó tệ hơn khoá chưa seed. Chưa seed thì Admin không thấy ô nào; seed mà không đọc
 * thì ô có, bấm Lưu xong, và người ta tin là đã đổi.
 *
 * Nên mỗi khoá trong `system_configs` phải nằm ở đúng một trong hai danh sách dưới:
 * `ReadKeys` (code thật sự đọc) hoặc `KnownUnreadKeys` (chưa đọc, kèm lý do). Seed
 * một khoá mới mà không khai vào đâu là phép kiểm đỏ — buộc người thêm phải trả lời
 * "ai sẽ đọc nó".
 */
import {
  CandidateSelectionConfigKey,
  GroupDefaultRadiusConfigKey,
  GroupMaxRadiusConfigKey,
  GroupMinRadiusConfigKey,
} from '@chantam.vn/chantam.core-lib/consts';
import { DiscoveryMaxRadiusConfigKey } from '@/domain/consts/discovery';
import {
  ChatRetentionConfigKey,
  GiverAccuracyConfigKey,
  ModerationTermsConfigKey,
  NotificationRetentionConfigKey,
  PointRedemptionConfigKey,
  RankPointsSourceConfigKey,
  ReportAbuseConfigKey,
  ReviewGraceConfigKey,
  ReviewRatingConfigKey,
  normalizeBlockedTerms,
  screenText,
} from '@chantam.vn/chantam.core-lib/models';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

/**
 * Nhập TỪNG hằng một thay vì quét mã nguồn bằng regex.
 *
 * Quét regex thì thêm một khoá mới ở một file chưa từng khớp mẫu sẽ lọt. Nhập tường
 * minh thì thêm khoá mà quên thêm vào đây là một việc CÓ CHỦ Ý phải làm — và người
 * thêm khoá sẽ thấy file này khi đi tìm chỗ seed.
 */
const RequiredKeys: readonly string[] = [
  GiverAccuracyConfigKey,
  ChatRetentionConfigKey,
  ModerationTermsConfigKey,
  NotificationRetentionConfigKey,
  PointRedemptionConfigKey,
  RankPointsSourceConfigKey,
  ReportAbuseConfigKey,
  ReviewGraceConfigKey,
  ReviewRatingConfigKey,
  GroupDefaultRadiusConfigKey,
  GroupMinRadiusConfigKey,
  GroupMaxRadiusConfigKey,
  // Khoá này khai trong `core`, không phải core-lib — nên nó lọt khỏi lượt soát đầu
  // của tôi, và lưới ở nhóm 3 bắt được. Đúng việc nó phải làm.
  DiscoveryMaxRadiusConfigKey,
];

/**
 * Khoá CỐ Ý không seed, kèm lý do.
 *
 * `selection.candidate_priority`: `GET /admin/candidate-selection` trả kèm
 * `isConfigured`, tính bằng "có dòng cấu hình hay không". Seed giá trị mặc định vào
 * sẽ làm cờ đó thành `true` và nói với Admin rằng đã có người đặt thứ tự này —
 * trong khi chưa ai đặt. Ở đây sự VẮNG MẶT chính là thông tin.
 */
const DeliberatelyUnseeded: readonly string[] = [CandidateSelectionConfigKey];

/**
 * Khoá ĐÃ seed mà code CHƯA đọc, kèm lý do.
 *
 * Hai loại, và chúng khác nhau về mức đáng lo:
 *
 * - **Seed trước cho tính năng chưa có.** Bình thường: con số đã chốt, chờ code tới
 *   đọc. `affiliate.active_member_window_days` thuộc loại này.
 * - **Bị hằng cứng trong code qua mặt.** Đây là lỗ thật: ô cấu hình tồn tại, Admin
 *   sửa được, và một hằng trong code quyết định thay nó. Ba khoá `discovery.*` và
 *   `rank.maintenance_period_months` thuộc loại này.
 *
 * Danh sách này KHÔNG phải chỗ để cất khoá đi cho phép kiểm xanh. Mỗi dòng ở đây là
 * một món nợ có tên, và loại thứ hai nên được nối vào hoặc bỏ khỏi allowlist của
 * Admin — hiện trạng "sửa được mà vô nghĩa" là lựa chọn tệ nhất trong ba.
 */
const KnownUnreadKeys: readonly { key: string; reason: string }[] = [
  {
    key: 'affiliate.active_member_window_days',
    reason: 'seed trước; bộ máy affiliate chưa có dòng code nào (19 §Chỗ cần soát 1)',
  },
  {
    key: 'discovery.default_radius_meters',
    reason:
      'bị hằng `DefaultSearchRadiusMeters` qua mặt — chỉ `discovery.max_radius_meters` được đọc thật',
  },
  {
    key: 'discovery.min_radius_meters',
    reason: 'bị hằng `MinSearchRadiusMeters` qua mặt',
  },
  {
    key: 'point.referral_daily_cap',
    reason: 'trần thật nằm ở `point_rules.daily_cap` của REFERRAL_QUALIFIED',
  },
  {
    key: 'point.transaction_daily_cap',
    reason: 'trần thật nằm ở `point_rules.daily_cap` của GIFT_COMPLETED_*',
  },
  {
    key: 'rank.maintenance_period_months',
    reason:
      "bị `interval '3 months'` viết cứng trong `rank.repository.ts` qua mặt (hai chỗ)",
  },
];

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URI) throw new Error('Thiếu DATABASE_URI.');

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URI,
  });
  await dataSource.initialize();

  try {
    const rows = await dataSource.query<{ config_key: string }[]>(
      `SELECT DISTINCT config_key FROM system_configs WHERE status = 'PUBLISHED'`,
    );
    const present = new Set(rows.map((row) => row.config_key));

    console.log('1. Mọi khoá code đọc đều có dòng để Admin sửa');
    for (const key of RequiredKeys)
      check(`\`${key}\` đã seed`, present.has(key));

    console.log('\n2. Khoá cố ý KHÔNG seed vẫn đúng như đã quyết');
    for (const key of DeliberatelyUnseeded)
      check(
        `\`${key}\` vắng mặt là có chủ ý — sự vắng mặt là thông tin`,
        !present.has(key),
        present.has(key)
          ? 'nay đã có dòng: kiểm lại `isConfigured` còn nói thật không'
          : '',
      );

    console.log('\n3. Không khoá nào seed mà không ai đọc — hoặc phải khai lý do');
    const declared = new Set<string>([
      ...RequiredKeys,
      ...KnownUnreadKeys.map((entry) => entry.key),
    ]);
    const undeclared = [...present].filter((key) => !declared.has(key));
    check(
      'mọi khoá trong system_configs đều được khai ở một trong hai danh sách',
      undeclared.length === 0,
      undeclared.length === 0
        ? ''
        : `chưa khai: ${undeclared.join(', ')} — thêm vào ReadKeys nếu code đọc, hoặc KnownUnreadKeys kèm lý do`,
    );

    // Một khoá đã nối vào code thì phải RA khỏi danh sách nợ. Thiếu phép kiểm này
    // thì danh sách chỉ dài ra và không ai dọn.
    const stillUnread = KnownUnreadKeys.filter((entry) =>
      (RequiredKeys as readonly string[]).includes(entry.key),
    );
    check(
      'không khoá nào nằm ở CẢ HAI danh sách — nối vào rồi thì phải xoá khỏi nợ',
      stillUnread.length === 0,
      stillUnread.map((entry) => entry.key).join(', '),
    );

    console.log(
      `  …${KnownUnreadKeys.length} khoá đang là NỢ: seed mà chưa ai đọc`,
    );
    for (const entry of KnownUnreadKeys)
      console.log(`     • ${entry.key} — ${entry.reason}`);

    console.log('\n4. Bộ lọc từ ngữ THẬT SỰ bắt được, không chỉ có dòng');
    // Có dòng mà danh sách rỗng thì cũng vô dụng y như không có dòng. Phép kiểm
    // này đọc đúng đường mà use case đọc, rồi cho nó một câu phải chặn.
    const [termRow] = await dataSource.query<{ value_json: unknown }[]>(
      `SELECT value_json FROM system_configs
       WHERE config_key = $1 AND status = 'PUBLISHED'
       ORDER BY version DESC LIMIT 1`,
      [ModerationTermsConfigKey],
    );
    const terms = normalizeBlockedTerms(termRow?.value_json);
    check(
      'danh sách sau chuẩn hoá KHÔNG rỗng',
      terms.length > 0,
      `${terms.length} mục`,
    );
    check(
      'có mục mức BLOCK — nếu toàn REVIEW thì không gì bị chặn hẳn',
      terms.some((term) => term.severity === 'BLOCK'),
    );
    check(
      'có mục mức REVIEW — nếu toàn BLOCK thì hàng đợi Admin không bao giờ có gì',
      terms.some((term) => term.severity === 'REVIEW'),
    );
    check(
      'một câu xúc phạm trực diện bị BLOCK',
      screenText('Đ.Mmmm mày', terms).verdict === 'BLOCK',
      screenText('Đ.Mmmm mày', terms).verdict,
    );
    check(
      'một câu bình thường KHÔNG bị chặn — bộ lọc không bắt nhầm mọi thứ',
      screenText('Món này còn tốt lắm, mình tặng miễn phí', terms).verdict ===
        'ALLOW',
      screenText('Món này còn tốt lắm, mình tặng miễn phí', terms).verdict,
    );
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Cấu hình động: mọi khoá code đọc đều có chỗ cho Admin sửa'
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
