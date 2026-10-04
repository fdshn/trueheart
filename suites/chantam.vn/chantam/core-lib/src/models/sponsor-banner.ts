/**
 * Banner Tài Trợ / Quảng Cáo — phần THUẦN (SRS UC-ADM-06, UC-POST-04, F65 phân hệ 3).
 *
 * UC-ADM-06: *"Quản lý đối tác, hình ảnh, vị trí, CTA/deep link, thời gian chạy, trạng thái
 * duyệt và thống kê cơ bản."*
 *
 * UC-POST-04: *"Giới thiệu/Quảng cáo trong Phase 1 **chỉ do Admin tạo/đăng từ CMS**; user
 * không có chức năng tự đăng quảng cáo."* Nên không có endpoint nào cho người dùng tạo
 * banner, và đó là chủ ý của đặc tả chứ không phải phần còn thiếu.
 *
 * ## `placement` là ALLOWLIST, không phải chuỗi tự do
 *
 * "Vị trí" nghe như một ô nhập chữ, nhưng mỗi vị trí phải có một chỗ trên app thật dựng nó.
 * Để Admin gõ tay nghĩa là họ gõ `trang-chu` trong khi app đọc `HOME_HERO`, banner không
 * hiện ở đâu, và **không có thông báo lỗi nào** — Admin thấy bản ghi đã lưu, đối tác đã
 * trả tiền, và không ai biết nó chưa từng xuất hiện. Cùng lý lẽ với `HomeSectionTypes`.
 *
 * ## Hai con số đếm NÀY thì được lưu, khác `posts.reaction_count`
 *
 * Suốt dự án tôi đã gỡ nhiều cột đếm lưu sẵn vì chúng là **bản sao** của một bảng khác, và
 * bản sao thì trôi. `impression_count` và `click_count` không phải bản sao của gì cả: không
 * có bảng sự kiện nào để đếm lại từ đó, và dựng một bảng ghi từng lượt hiển thị là thêm một
 * hàng cho mỗi lần cuộn Home của mỗi người.
 *
 * Nên ở đây cột đếm LÀ nguồn sự thật, và cộng bằng `count = count + 1` ngay trong database
 * chứ không đọc-rồi-ghi. Còn `ctr` thì KHÔNG lưu — nó suy ra được từ hai số kia, và lưu nó
 * là tạo đúng loại bản sao sẽ trôi.
 *
 * ## "Lượt phục vụ", không phải "lượt mắt thấy"
 *
 * `impression_count` tăng khi backend TRẢ banner về client. Client prefetch hay người dùng
 * cuộn qua mà không nhìn thì vẫn tính. Ghi ra để không ai đọc con số này thành số người đã
 * xem — muốn con số đó thì phải có tín hiệu viewport từ client, mà đặc tả chỉ đòi "thống kê
 * cơ bản".
 */

/**
 * Vị trí banner. Xem docblock đầu file cho lý do đây là allowlist.
 *
 * Giữ ít và đúng những chỗ app hiện có:
 * - `HOME_HERO` — dải banner đầu Home, cùng chỗ `HERO_BANNER_SLIDER` của F63.
 * - `HOME_INLINE` — chen giữa các khối Home.
 * - `POST_LIST` — trong danh sách bài.
 * - `MERIT_PAGE` — trang Công đức / Hồi hướng.
 */
export const BannerPlacements = [
  'HOME_HERO',
  'HOME_INLINE',
  'POST_LIST',
  'MERIT_PAGE',
] as const;

export type BannerPlacement = (typeof BannerPlacements)[number];

export const BannerPlacementLabels: Readonly<Record<BannerPlacement, string>> =
  {
    HOME_HERO: 'Dải đầu trang chủ',
    HOME_INLINE: 'Chen giữa trang chủ',
    POST_LIST: 'Trong danh sách bài',
    MERIT_PAGE: 'Trang Công đức',
  };

/** Cùng ba trạng thái của hồ sơ Từ thiện — một lối duyệt cho mọi nội dung chờ duyệt. */
export const BannerApprovalStatuses = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
] as const;

export type BannerApprovalStatus = (typeof BannerApprovalStatuses)[number];

export const MaxBannerPartnerNameLength = 200;
export const MaxBannerTitleLength = 200;
export const MaxBannerUrlLength = 2_000;

/**
 * Lược đồ được phép cho `targetUrl` (CTA / deep link).
 *
 * `https://` cho web, và `chantam://` cho deep link trong app. KHÔNG nhận `http://` (trình
 * duyệt chặn nội dung lẫn), và tuyệt đối không nhận `javascript:` — một banner do đối tác
 * gửi ảnh và link là đúng nơi để thử chèn mã, và `javascript:` chỉ cần một WebView cấu hình
 * lỏng là chạy.
 */
const AllowedTargetSchemes = ['https://', 'chantam://'] as const;

export function isBannerImageUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('https://') &&
    value.length <= MaxBannerUrlLength
  );
}

export function isBannerTargetUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MaxBannerUrlLength)
    return false;
  // So khớp ĐẦU chuỗi, không `includes`: `javascript:alert('https://x')` có chứa `https://`.
  return AllowedTargetSchemes.some((scheme) => value.startsWith(scheme));
}

/**
 * Tỷ lệ bấm, tính theo phần nghìn chứ không phần trăm làm tròn.
 *
 * CTR thực tế của banner thường dưới 1%. Làm tròn về số nguyên phần trăm biến mọi banner
 * thành "0%", và Admin mất hẳn cách so banner nào hiệu quả hơn. Trả hai chữ số thập phân.
 *
 * `null` khi chưa có lượt hiển thị nào — `0` ở đó đọc ra "không ai bấm", trong khi sự thật
 * là chưa ai thấy.
 */
export function bannerClickThroughRate(input: {
  readonly impressionCount: number;
  readonly clickCount: number;
}): number | null {
  if (!Number.isFinite(input.impressionCount) || input.impressionCount <= 0)
    return null;
  return (
    Math.round((input.clickCount / input.impressionCount) * 100 * 100) / 100
  );
}

/**
 * Banner có đang trong khung thời gian chạy hay không.
 *
 * Nửa mở `[startsAt, endsAt)` — cùng quy ước với `EXCLUDE ... tstzrange(..., '[)')` của
 * `home_campaign_configs`, để hai banner xếp liền nhau không chồng nhau một tích tắc.
 */
export function isBannerWithinWindow(input: {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly now: Date;
}): boolean {
  const now = input.now.getTime();
  return now >= input.startsAt.getTime() && now < input.endsAt.getTime();
}

/** Những chỗ khiến một banner KHÔNG tạo được. */
export function bannerGaps(input: {
  readonly partnerName: string;
  readonly title: string;
  readonly placement: unknown;
  readonly imageUrl: unknown;
  readonly targetUrl: unknown;
  readonly startsAt: Date;
  readonly endsAt: Date;
}): string[] {
  const gaps: string[] = [];

  if (input.partnerName.trim().length === 0)
    gaps.push(
      'partnerName không được rỗng — không biết banner của ai thì không đối soát được',
    );
  if (input.partnerName.length > MaxBannerPartnerNameLength)
    gaps.push(`partnerName không vượt ${MaxBannerPartnerNameLength} ký tự`);
  if (input.title.trim().length === 0) gaps.push('title không được rỗng');
  if (input.title.length > MaxBannerTitleLength)
    gaps.push(`title không vượt ${MaxBannerTitleLength} ký tự`);

  if (!BannerPlacements.includes(input.placement as BannerPlacement))
    gaps.push(`placement phải là một trong: ${BannerPlacements.join(', ')}`);

  if (!isBannerImageUrl(input.imageUrl))
    gaps.push('imageUrl phải là một đường dẫn https');
  if (!isBannerTargetUrl(input.targetUrl))
    gaps.push(
      `targetUrl phải bắt đầu bằng ${AllowedTargetSchemes.join(' hoặc ')}`,
    );

  const starts = input.startsAt.getTime();
  const ends = input.endsAt.getTime();
  if (!Number.isFinite(starts))
    gaps.push('startsAt không phải thời điểm hợp lệ');
  if (!Number.isFinite(ends)) gaps.push('endsAt không phải thời điểm hợp lệ');
  if (Number.isFinite(starts) && Number.isFinite(ends) && ends <= starts)
    gaps.push('endsAt phải sau startsAt');

  return gaps;
}
