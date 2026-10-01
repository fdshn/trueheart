/**
 * Các mã giới thiệu ứng viên cho một `global_id`, theo thứ tự ưu tiên.
 *
 * ## Vì sao là một DANH SÁCH chứ không một mã
 *
 * Bản cũ lấy đúng 12 ký tự đầu của uuid — 48 bit — rồi ghi thẳng vào cột có
 * `UQ_users_referral_code`. Hai uuid chung tiền tố 12 ký tự thì lượt đăng ký thứ hai
 * **ném 500 thô** và người dùng không có cách nào lách: `UserId.create(username)` là hàm
 * thuần, nên cùng username luôn ra cùng uuid và cùng mã — họ bị chặn đăng ký vĩnh viễn.
 *
 * Đo được 01/10: ba tài khoản demo có uuid
 * `10000000-0000-4000-8000-00000000000{1,2,3}` — cả ba ra `100000000000`, và `seed:demo`
 * chết ở dòng thứ hai với `duplicate key`. Dữ liệu thật thì uuid phân bố đều hơn nên
 * xác suất nhỏ, nhưng kiểu hỏng thì không nhỏ: 500 ở đúng bước đăng ký.
 *
 * ## Ứng viên đầu tiên GIỮ NGUYÊN công thức cũ
 *
 * Mã giới thiệu là BẤT BIẾN và đã phát ra ngoài. Đổi công thức ứng viên đầu là làm mọi
 * link mời đã gửi trỏ vào hư không, nên các ứng viên sau chỉ được dùng khi ứng viên
 * trước đã có người lấy.
 */
export function referralCodeCandidates(globalId: string): string[] {
  const hex = globalId.replaceAll('-', '').toUpperCase();

  // Sáu cửa sổ 12 ký tự trong 32 ký tự hex.
  //
  // `0` đứng đầu để giữ đúng mã cũ. `20` đứng thứ hai — tức đUÔI của uuid — vì đó là
  // chỗ biến thiên thật sự nằm khi các uuid có cấu trúc. Đo được 01/10: với ba uuid demo
  // `...-00000000000{1,2,3}` thì cả offset 0 VÀ offset 12 đều ra cùng một chuỗi — bản
  // đầu của danh sách này đặt `12` thứ hai nên lượt lùi đầu tiên vô ích.
  const offsets = [0, 20, 12, 4, 8, 16];

  return [
    ...new Set(
      offsets
        .map((offset) => hex.slice(offset, offset + 12))
        .filter((code) => code.length === 12),
    ),
  ];
}

/** Ứng viên đầu tiên — đúng công thức đã dùng từ đầu. */
export function makeReferralCode(globalId: string): string {
  return referralCodeCandidates(globalId)[0];
}

/**
 * Ba khoá ngưỡng cho diện Admin xem xét, mỗi khoá MỘT SỐ NGUYÊN.
 *
 * ## Vì sao ba khoá chứ không một khoá JSON
 *
 * Đường ghi cấu hình của Admin (`POST /admin/system-configs`) hiện chỉ nhận
 * `valueType: INTEGER`. Một khoá hình JSON thì seed được, đọc được, mà **không ai sửa
 * được qua API** — chỉ còn đường SQL tay, đúng thứ "cấu hình động" sinh ra để tránh.
 * Đo được 01/10: bản đầu của phần này dùng một khoá JSON và lượt bật ngưỡng trả
 * *"valueType hiện chỉ hỗ trợ INTEGER"*.
 *
 * Ba khoá cũng đúng lối `group.radius_meters.*` đã dùng: một giá trị một dòng, sửa độc
 * lập được, và audit log nói rõ ai đổi con số nào.
 */
export const ReferralReviewMinQualifiedConfigKey =
  'referral.review_min_qualified';
export const ReferralReviewMinDeviceClustersConfigKey =
  'referral.review_min_device_clusters';
export const ReferralReviewMinClusterSizeConfigKey =
  'referral.review_min_cluster_size';

export interface IReferralAbuseConfig {
  /**
   * Số lượt giới thiệu đã đủ điều kiện tối thiểu trước khi các tín hiệu có nghĩa.
   *
   * Người mời đúng hai người, cả hai đăng ký trên cùng cái điện thoại của họ, là
   * một cụm trùng — và gần như luôn là vợ chồng hoặc hai người bạn, không phải một
   * trại tài khoản. Cùng lý lẽ với `minReports` của `report.abuse`.
   */
  readonly minQualifiedReferrals: number;

  /**
   * Số cụm THIẾT BỊ trùng từ mức này trở lên thì đưa vào diện xem xét. `0` = TẮT.
   *
   * Chỉ thiết bị, không có vế IP, và đó là chủ ý: ở Việt Nam mạng di động dùng
   * CGNAT nên hàng nghìn người không liên quan gì nhau chia một địa chỉ IPv4, cộng
   * thêm wifi gia đình, quán cà phê, tiệm net, ký túc xá. IP trùng là chuyện
   * THƯỜNG, nên một ngưỡng theo IP sẽ nổ với người dùng thật nhiều hơn với kẻ gian.
   * Số cụm IP vẫn được TRẢ RA để Admin đọc, chỉ không dùng để lọc.
   */
  readonly minDeviceClusters: number;

  /**
   * Cụm lớn nhất từ bao nhiêu người thì đưa vào diện xem xét. `0` = TẮT.
   *
   * Tách khỏi SỐ cụm vì hai hình dạng rất khác nhau mà số cụm không phân biệt được:
   * "ba cụm, mỗi cụm hai người" và "một cụm mười một người" — cái thứ hai đáng xem
   * hơn nhiều nhưng lại có số cụm NHỎ hơn.
   */
  readonly minClusterSize: number;
}

/**
 * Mặc định **TẮT** cả hai ngưỡng, và đó là một quyết định có chủ ý, không phải chỗ
 * bỏ dở.
 *
 * Hai cột `referrals.signup_ip_hash` / `signup_device_hash` chỉ bắt đầu được ghi từ
 * 30/09, nên trước đó mọi dòng đều rỗng và **chưa ai biết "bình thường" trông như thế
 * nào**. Một ngưỡng chọn hôm nay là phỏng đoán mặc áo chính sách, và nó sẽ sai theo
 * hướng tệ nhất: hoặc không bao giờ nổ, hoặc nổ với mọi người.
 *
 * Khoá vẫn được seed vào `system_configs` để Admin **thấy cái núm** — khác hẳn với
 * không seed, nơi họ mở trang cấu hình ra và không có gì để sửa (xem
 * `test:config-inventory`). Khi đã có vài tuần dữ liệu thật thì chọn theo phân vị,
 * không chọn theo cảm giác.
 */
export const DefaultReferralAbuseConfig: IReferralAbuseConfig = {
  minQualifiedReferrals: 5,
  minDeviceClusters: 0,
  minClusterSize: 0,
};

export function normalizeReferralAbuseConfig(raw: {
  minQualifiedReferrals: unknown;
  minDeviceClusters: unknown;
  minClusterSize: unknown;
}): IReferralAbuseConfig {
  const minQualified = Number(raw.minQualifiedReferrals);
  const deviceClusters = Number(raw.minDeviceClusters);
  const clusterSize = Number(raw.minClusterSize);

  return {
    // Ít nhất 1: 0 nghĩa là xét cả người chưa mời được ai. Thiếu dòng hoặc giá trị
    // rác thì lùi về mặc định của RIÊNG vế đó, không làm mất hai vế còn lại.
    minQualifiedReferrals: Number.isFinite(minQualified)
      ? Math.max(1, Math.trunc(minQualified))
      : DefaultReferralAbuseConfig.minQualifiedReferrals,
    // 0 được phép và nghĩa là TẮT vế đó — xem `DefaultReferralAbuseConfig`.
    minDeviceClusters: Number.isFinite(deviceClusters)
      ? Math.max(0, Math.trunc(deviceClusters))
      : DefaultReferralAbuseConfig.minDeviceClusters,
    // Một cụm theo định nghĩa có từ 2 người, nên 1 vô nghĩa: kạp lên 2.
    minClusterSize: Number.isFinite(clusterSize)
      ? Math.trunc(clusterSize) <= 0
        ? 0
        : Math.max(2, Math.trunc(clusterSize))
      : DefaultReferralAbuseConfig.minClusterSize,
  };
}

/** Cả hai vế đều tắt thì hàng đợi rỗng, không phải "mọi người đều đáng xem". */
export function referralAbuseReviewEnabled(
  config: IReferralAbuseConfig,
): boolean {
  return config.minDeviceClusters > 0 || config.minClusterSize > 0;
}
