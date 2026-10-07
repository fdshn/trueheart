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
import { EnforcedGroupPermissions } from '@/application/contracts/admin-config';
import {
  DiscoveryDefaultRadiusConfigKey,
  DiscoveryMaxRadiusConfigKey,
  DiscoveryMinRadiusConfigKey,
} from '@/domain/consts/discovery';
import {
  AffiliateActiveMemberWindowConfigKey,
  CandidateSelectionConfigKey,
  EmptyGroupPermissionSetMarker,
  GroupDefaultRadiusConfigKey,
  GroupMaxRadiusConfigKey,
  GroupMinRadiusConfigKey,
  RankMaintenancePeriodConfigKey,
  UserRanks,
  groupRadiusConfigKeyForRank,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  AbusiveModerationCorpus,
  AllocationPolicyConfigKey,
  ChatRetentionConfigKey,
  GiftValueBonusMaxValueConfigKey,
  GiverAccuracyConfigKey,
  InnocentModerationCorpus,
  ModerationTermsConfigKey,
  NotificationRetentionConfigKey,
  PointRedemptionConfigKey,
  ReferralReviewMinClusterSizeConfigKey,
  ReferralReviewMinDeviceClustersConfigKey,
  ReferralReviewMinQualifiedConfigKey,
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
  // Trần giá trị quy ra điểm thưởng (CHỐT-14, 07/10). Đây KHÔNG phải con số chính
  // sách mà là van an toàn: `value_bonus` đi qua `appendAdjustment`, đường đó
  // KHÔNG kiểm trần ngày nào, nên giá tự khai 1 tỉ đồng ra 500.000 điểm — 279 lần
  // ngưỡng Kim Cương. Vắng dòng thì `DefaultGiftValueBonusMaxValueVnd` vẫn chặn,
  // nhưng Admin không thấy cái núm để hạ xuống khi phát hiện bị lạm dụng, nên đây
  // đúng là khoá thuộc nhóm 1 chứ không phải nhóm nợ.
  GiftValueBonusMaxValueConfigKey,
  ReportAbuseConfigKey,
  ReviewGraceConfigKey,
  ReviewRatingConfigKey,
  GroupDefaultRadiusConfigKey,
  GroupMinRadiusConfigKey,
  GroupMaxRadiusConfigKey,
  // Khoá này khai trong `core`, không phải core-lib — nên nó lọt khỏi lượt soát đầu
  // của tôi, và lưới ở nhóm 3 bắt được. Đúng việc nó phải làm.
  DiscoveryMaxRadiusConfigKey,
  // Bán kính riêng theo bậc (chốt 30/09). VIEWER cố ý KHÔNG có: họ chưa qua
  // onboarding nên `assertOnboarded` chặn từ trước, và seed một khoá không ai đọc
  // là đúng thứ nhóm 3 dưới đây bắt.
  RankMaintenancePeriodConfigKey,
  AffiliateActiveMemberWindowConfigKey,
  DiscoveryMinRadiusConfigKey,
  DiscoveryDefaultRadiusConfigKey,
  // Ngưỡng diện xem xét cho dấu vết đăng ký trùng (01/10). Seed với hai vế lọc ở 0
  // tức TẮT — có chủ đích, vì dấu vết mới ghi từ 30/09 nên chưa có dữ liệu để chọn
  // ngưỡng. Vẫn phải seed để Admin thấy cái núm, đúng điều nhóm 1 dưới đòi.
  ReferralReviewMinQualifiedConfigKey,
  ReferralReviewMinDeviceClustersConfigKey,
  ReferralReviewMinClusterSizeConfigKey,
  ...[
    UserRanks.MEMBER,
    UserRanks.SILVER,
    UserRanks.GOLD,
    UserRanks.DIAMOND,
  ].map((rank) => groupRadiusConfigKeyForRank(rank)),
];

/**
 * Khoá CỐ Ý không seed, kèm lý do.
 *
 * `selection.candidate_priority`: `GET /admin/candidate-selection` trả kèm
 * `isConfigured`, tính bằng "có dòng cấu hình hay không". Seed giá trị mặc định vào
 * sẽ làm cờ đó thành `true` và nói với Admin rằng đã có người đặt thứ tự này —
 * trong khi chưa ai đặt. Ở đây sự VẮNG MẶT chính là thông tin.
 */
const DeliberatelyUnseeded: readonly string[] = [
  CandidateSelectionConfigKey,
  // `allocation.policy` (02/10): mặc định của `normalizeAllocationPolicy` trùng khít
  // hành vi có TRƯỚC khi khoá này ra đời, nên vắng dòng nghĩa là "chạy y như cũ".
  // Seed một dòng mặc định sẽ làm `isConfigured` nói sai: nó sẽ báo đã-cấu-hình cho
  // một bản không ai publish, và Admin mất cách phân biệt "chưa ai đụng" với "đã
  // chọn đúng các giá trị mặc định".
  AllocationPolicyConfigKey,
];

/**
 * Khoá đã XOÁ có chủ ý, kèm lý do.
 *
 * Khác `DeliberatelyUnseeded` ở chỗ: những khoá đó chưa từng có dòng, còn những
 * khoá này ĐÃ CÓ rồi bị bỏ. Khai riêng để lần sau ai thấy chúng trong một migration
 * cũ thì biết là cố ý, không phải sót — và để phép kiểm đỏ nếu chúng quay lại.
 */
const DeliberatelyRemoved: readonly { key: string; reason: string }[] = [
  {
    key: 'point.referral_daily_cap',
    reason:
      'bản thô hơn của point_rules.daily_cap (REFERRAL_QUALIFIED); nối vào là hai con số cho một trần',
  },
  {
    key: 'point.transaction_daily_cap',
    reason:
      'point_rules.daily_cap tách GIVER 10 và RECEIVER 5; một khoá chung không diễn đạt được',
  },
];

/**
 * Khoá ĐÃ seed mà code CHƯA đọc, kèm lý do.
 *
 * **RỖNG tính tới 30/09.** Sáu khoá từng nằm đây đã xử hết, và hai cách xử khác
 * nhau vì hai tình trạng khác nhau:
 *
 * - **Nối vào code** (bốn khoá): `discovery.min_radius_meters` và
 *   `discovery.default_radius_meters` nay được `GET /discovery/config` và
 *   `get-nearby-posts` đọc — khoá mặc định còn bịt một lỗ, vì trước đó client gửi
 *   toạ độ mà bỏ trống bán kính sẽ quét cả nước. `rank.maintenance_period_months`
 *   thay `interval '3 months'` viết cứng ở hai câu SQL.
 *   `affiliate.active_member_window_days` được `GET /groups/:id/affiliate` đọc —
 *   có người đọc trước cả khi bộ máy chia thưởng ra đời.
 * - **XOÁ** (hai khoá): `point.referral_daily_cap` và
 *   `point.transaction_daily_cap` là bản THÔ hơn của `point_rules.daily_cap`, thứ
 *   đã chạy và mịn hơn theo từng mã quy tắc. Nối chúng vào là tạo hai con số cho
 *   một trần và làm mất độ mịn — xem `1796400000000`.
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
const KnownUnreadKeys: readonly { key: string; reason: string }[] = [];

/**
 * Quyền nhóm mà code THẬT SỰ kiểm, cùng chỗ kiểm.
 *
 * `group_role_permissions` là cùng một họ với `system_configs`: hàng seed mà
 * không ai đọc. Và ở đây nó tệ hơn — một khoá cấu hình không ai đọc chỉ làm ô
 * Admin vô nghĩa, còn một QUYỀN không ai đọc làm cả một VAI vô nghĩa.
 *
 * Đúng chuyện đó đã xảy ra: `SUBTEAM_ADMIN` có đúng hai quyền, cả hai không ai
 * đọc, nên tới 30/09 phong vai đó cho ai cũng không đổi một thứ gì.
 */
const ReadGroupPermissions: readonly string[] = EnforcedGroupPermissions;

/**
 * Quyền đã seed mà chưa ai kiểm, kèm lý do.
 *
 * **RỖNG tính tới 30/09** — mười trên mười quyền nhóm đều có người kiểm.
 *
 * Giữ danh sách lại chứ không xoá hàm: thêm một quyền mới cho một endpoint chưa
 * viết là việc hợp lý, và khi đó nó phải có chỗ để khai kèm LÝ DO. Danh sách này
 * không phải chỗ cất quyền cho phép kiểm xanh — nó là danh sách những chỗ chưa
 * được chứng minh, và một quyền chưa ai kiểm cũng chưa ai BIẾT là đúng (bộ seed
 * từng bỏ sót `group.overview.view` của SUBTEAM_ADMIN đúng ba tháng theo cách đó).
 */
const KnownUnreadGroupPermissions: readonly {
  permission: string;
  reason: string;
}[] = [];

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

    console.log(
      '\n3. Không khoá nào seed mà không ai đọc — hoặc phải khai lý do',
    );
    const declared = new Set<string>([
      ...RequiredKeys,
      ...KnownUnreadKeys.map((entry) => entry.key),
    ]);
    const undeclared = [...present].filter((key) => !declared.has(key));
    const resurrected = DeliberatelyRemoved.filter((entry) =>
      present.has(entry.key),
    );
    check(
      'khoá đã xoá có chủ ý KHÔNG quay lại',
      resurrected.length === 0,
      resurrected.map((entry) => `${entry.key} — ${entry.reason}`).join(' | '),
    );
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

    // Corpus chạy trên danh sách ĐANG NẰM trong database, không phải trên một
    // danh sách truyền vào. Spec ở core-lib canh bản seed; phép kiểm này canh bản
    // THẬT — kể cả sau một lần sửa qua `POST /admin/system-configs`.
    //
    // Cùng một corpus cho cả hai, xuất từ `core-lib`: hai bản sao của bốn mươi
    // câu sẽ trôi khỏi nhau, và khi trôi thì cái yếu hơn thắng.
    const falsePositives = InnocentModerationCorpus.filter(
      (sentence) => screenText(sentence, terms).verdict !== 'ALLOW',
    );
    check(
      'không câu vô hại nào bị bắt nhầm — 0 dương tính giả',
      falsePositives.length === 0,
      falsePositives
        .map(
          (sentence) =>
            `"${sentence}" bị ${screenText(sentence, terms).verdict} bởi [${screenText(sentence, terms).matched.join(', ')}]`,
        )
        .join(' | '),
    );

    const deadTerms = terms.filter(
      (term) =>
        !AbusiveModerationCorpus.some(
          (sentence) => screenText(sentence, [term]).verdict !== 'ALLOW',
        ),
    );
    check(
      'không mục nào CHẾT — mục không bắt được gì trông y như mục đang canh gì đó',
      deadTerms.length === 0,
      deadTerms.map((term) => term.term).join(', '),
    );

    const missed = AbusiveModerationCorpus.filter(
      (sentence) => screenText(sentence, terms).verdict === 'ALLOW',
    );
    check(
      'không câu xấu nào lọt lưới',
      missed.length === 0,
      `${missed.length} câu: ${missed.slice(0, 3).join(' | ')}`,
    );
    console.log('\n5. Quyền nhóm: không quyền nào seed mà không ai kiểm');
    // Chỉ bộ ĐANG HIỆU LỰC, và bỏ dòng mốc của bộ rỗng. Đọc cả lịch sử thì một
    // quyền đã thu hồi vẫn trông như đang được cấp.
    const grantRows = await dataSource.query<{ permission: string }[]>(
      `
        SELECT DISTINCT grant_row.permission
        FROM group_role_permissions grant_row
        WHERE grant_row.version = (
          SELECT MAX(live.version) FROM group_role_permissions live
          WHERE live.role = grant_row.role
        )
          AND grant_row.permission <> $1
      `,
      [EmptyGroupPermissionSetMarker],
    );
    const seededGrants = grantRows.map((row) => row.permission);
    const declaredGrants = new Set<string>([
      ...ReadGroupPermissions,
      ...KnownUnreadGroupPermissions.map((entry) => entry.permission),
    ]);

    check(
      'group_role_permissions có dòng — thiếu là mọi vai nhóm mất hết quyền',
      seededGrants.length > 0,
      `${seededGrants.length} quyền`,
    );

    const undeclaredGrants = seededGrants.filter(
      (permission) => !declaredGrants.has(permission),
    );
    check(
      'mọi quyền đã seed đều được khai ở một trong hai danh sách',
      undeclaredGrants.length === 0,
      undeclaredGrants.join(', '),
    );

    const grantsInBoth = KnownUnreadGroupPermissions.filter((entry) =>
      ReadGroupPermissions.includes(entry.permission),
    );
    check(
      'không quyền nào nằm ở CẢ HAI danh sách — nối vào rồi thì xoá khỏi nợ',
      grantsInBoth.length === 0,
      grantsInBoth.map((entry) => entry.permission).join(', '),
    );

    // Quyền code kiểm mà KHÔNG có dòng nào là lỗ ngược lại: use case đòi một
    // quyền không ai được cấp, nên endpoint đó 403 với tất cả mọi người.
    const missingGrants = ReadGroupPermissions.filter(
      (permission) => !seededGrants.includes(permission),
    );
    check(
      'mọi quyền code kiểm đều đã được seed cho một vai nào đó',
      missingGrants.length === 0,
      missingGrants.length === 0
        ? ''
        : `${missingGrants.join(', ')} — endpoint dùng quyền này sẽ 403 với mọi người`,
    );

    // Vai nào cũng phải có ít nhất một quyền CÓ TÁC DỤNG. Một vai gán được mà
    // không đổi gì là thứ tệ nhất trong ba: người ta tin là đã phân quyền.
    const roleRows = await dataSource.query<
      { role: string; permission: string }[]
    >(`
      SELECT grant_row.role, grant_row.permission
      FROM group_role_permissions grant_row
      WHERE grant_row.version = (
        SELECT MAX(live.version) FROM group_role_permissions live
        WHERE live.role = grant_row.role
      )
    `);
    for (const role of ['OWNER', 'SUBTEAM_ADMIN']) {
      const effective = roleRows
        .filter((row) => row.role === role)
        .filter((row) => ReadGroupPermissions.includes(row.permission));
      check(
        `vai ${role} có ít nhất một quyền code thật sự kiểm`,
        effective.length > 0,
        effective.length > 0
          ? `${effective.length} quyền có tác dụng`
          : 'gán vai này không đổi một thứ gì',
      );
    }

    console.log(
      `  …${KnownUnreadGroupPermissions.length} quyền nhóm đang là NỢ: seed mà chưa ai kiểm`,
    );
    for (const entry of KnownUnreadGroupPermissions)
      console.log(`     • ${entry.permission} — ${entry.reason}`);
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
