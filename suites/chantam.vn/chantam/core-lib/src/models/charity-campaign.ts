/**
 * Hoạt động Từ thiện — phần THUẦN (SRS §6.2.13 `campaigns`, BR-CHARITY-01..03,
 * UI-CHARITY-01, F65 phân hệ 1).
 *
 * ## `current_items_count` KHÔNG tự tăng, và đó là quyết định của đặc tả
 *
 * BR-CHARITY-02 nói rõ: hệ thống **không** tự đối soát số phần quà hay tiến độ thực địa.
 * Con số là lời khai của người tổ chức, mang tính tham khảo.
 *
 * Bản kế hoạch đầu của tôi định gắn một hook tăng `current_items_count` mỗi lần có giao
 * dịch hoàn tất trong khuôn khổ hoạt động. Sai, và sai theo cách tốn kém: một hoạt động
 * trao 500 suất cơm nấu tại chỗ không sinh ra 500 `gift_transactions` nào, nên con số tự
 * động sẽ hiện 0/500 giữa lúc hoạt động đã xong — tức là hệ thống tự tạo ra một con số
 * sai rồi trình bày nó như số đo. Thà để trống và ghi rõ ai khai.
 *
 * Hệ quả thấy được: không có hàm nào trong file này tính tiến độ từ dữ liệu giao dịch.
 * `charityProgressPercent` chỉ chia hai con số do người nhập.
 *
 * ## Vì sao quyền tạo là CAPABILITY, không phải phép so hạng
 *
 * BR-CHARITY-01 cho "TV Kim Cương" tạo hoạt động. Viết `if (rank === 'DIAMOND')` là đóng
 * đinh một lựa chọn CHÍNH SÁCH vào mã nguồn: Bên A hạ xuống Vàng là một lượt deploy.
 * Dùng `capability_policies` / `capability_rank_values` như `CREATE_GROUP` và
 * `DISCOVERY_RADIUS` thì nó thành một dòng trong Rank Config, đổi được qua API sẵn có.
 *
 * ## Mã capability DÙNG LẠI `SUBMIT_CHARITY_PROPOSAL`, không đặt mã mới
 *
 * Bản đầu của tôi đặt một mã mới `CREATE_CHARITY_CAMPAIGN` kèm một migration seed nó cho
 * năm bậc hạng. Sai, và tôi chỉ phát hiện khi đọc `docs/diagram/31-open-items.md` dòng E2:
 * `SUBMIT_CHARITY_PROPOSAL` **đã được seed từ migration `1790100000000`**, với đúng giá trị
 * cần — chỉ `DIAMOND` được `allowed`, `limit_value` là `NULL` — và được khai `GATE` trong
 * `CapabilityKindByCode`. Nó nằm đó từ đầu, chờ đúng phân hệ này.
 *
 * Thêm mã thứ hai là tạo hai dòng cho cùng một quyết định trên màn Rank Config, để Bên A
 * tắt một dòng rồi tưởng đã khoá, trong khi dòng kia vẫn mở. Và `SUBMIT_CHARITY_PROPOSAL`
 * sẽ mãi mãi là "khai mà chưa ai đọc".
 */

import { slugifyBlogTitle } from './blog';
import { MaxReviewCommentLength } from './transaction-review';

/**
 * Trạng thái duyệt của một hoạt động.
 *
 * Admin tạo thì vào thẳng `APPROVED`; TV Kim Cương tạo thì `PENDING_APPROVAL` và chỉ công
 * khai sau khi Admin duyệt (BR-CHARITY-01). `REJECTED` giữ lại chứ không xoá — người tạo
 * cần biết vì sao hồ sơ của mình không lên, và Admin cần thấy mình đã xử lý nó.
 */
export const CharityApprovalStatuses = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
] as const;

export type CharityApprovalStatus = (typeof CharityApprovalStatuses)[number];

export const CharityApprovalStatusLabels: Readonly<
  Record<CharityApprovalStatus, string>
> = {
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

/**
 * Trạng thái một lượt đăng ký tham gia.
 *
 * Hai giá trị, một hàng mỗi (hoạt động, người) — huỷ là ĐỔI trạng thái, không phải thêm
 * hàng. Lối "thêm hàng lịch sử" là đúng cái bẫy `group_memberships` đã đặt ra: ở đó mọi
 * câu đếm người đều phải nhớ `AND status = 'ACTIVE'`, và chỗ nào quên thì gửi thông báo
 * của nhóm cho người đã rời. Một hàng một người thì không có chỗ nào để quên.
 */
export const CharityParticipationStatuses = [
  'REGISTERED',
  'CANCELLED',
] as const;

export type CharityParticipationStatus =
  (typeof CharityParticipationStatuses)[number];

/** Vai của người viết đánh giá (BR-CHARITY-03 — đánh giá hai chiều). */
export const CharityReviewRoles = ['ORGANIZER', 'PARTICIPANT'] as const;

export type CharityReviewRole = (typeof CharityReviewRoles)[number];

/**
 * Mã capability trong Rank Config — đã seed từ migration `1790100000000`, không phải mã
 * mới. Xem docblock đầu file cho lý do không đặt thêm mã.
 */
export const CreateCharityCampaignCapability = 'SUBMIT_CHARITY_PROPOSAL';

export const MaxCharityTitleLength = 200;
export const MaxCharitySlugLength = 200;
export const MaxCharityBadgeNameLength = 50;
/**
 * Trần mô tả.
 *
 * Cột là `TEXT` nên database không chặn gì. Trần ở đây để một lượt dán 5MB không thành
 * một hàng mà `GET /campaigns` phải trả trong danh sách.
 */
export const MaxCharityDescriptionLength = 20_000;
/** Trần số phần quà mục tiêu — cột `INT`, và một con số 10 chữ số là lỗi gõ. */
export const MaxCharityTargetItems = 1_000_000;

export const CharityReviewRatingMin = 1;
export const CharityReviewRatingMax = 5;
/** Dùng chung trần với đánh giá sau giao dịch — cùng loại ô nhập, cùng cột `text`. */
export const MaxCharityReviewCommentLength = MaxReviewCommentLength;

/**
 * Sinh slug từ tiêu đề hoạt động.
 *
 * Cùng một thuật toán với Blog, và CỐ Ý dùng lại hàm của Blog thay vì chép: chỗ khó của
 * nó là `đ` phải đổi trước `normalize('NFD')` (xem `slugifyBlogTitle`), và một bản chép
 * thứ hai là một chỗ nữa để quên điều đó. Khác duy nhất là trần độ dài — cột `campaigns.slug`
 * là `varchar(200)` theo §6.2.13, hẹp hơn `blogs.slug`.
 */
export function slugifyCharityTitle(title: string): string {
  return slugifyBlogTitle(title).slice(0, MaxCharitySlugLength);
}

/** `slug` gõ tay: chuẩn hoá y hệt, để không có hai cách viết cho một đường. */
export function normalizeCharitySlug(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return slugifyCharityTitle(raw);
}

export function isCharityUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('https://') &&
    value.length <= 2_000
  );
}

/**
 * Những chỗ khiến một hoạt động KHÔNG tạo được.
 *
 * Khác `blogGaps`: ở đây **không** có khái niệm bản nháp. §6.2.13 để `banner_url`,
 * `badge_name`, `description`, `start_time`, `end_time` đều `NOT NULL`, nên một hoạt động
 * tồn tại là một hoạt động đủ thông tin — và lượt kiểm duy nhất là lúc tạo.
 */
export function charityCampaignGaps(input: {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly bannerUrl: unknown;
  readonly badgeName: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly targetItemsCount: number;
}): string[] {
  const gaps: string[] = [];

  if (input.title.trim().length < 3) gaps.push('title phải có ít nhất 3 ký tự');
  if (input.slug.length === 0)
    gaps.push(
      'slug rỗng sau khi chuẩn hoá — tiêu đề cần ít nhất một chữ hoặc số Latin, ' +
        'hoặc gửi slug riêng',
    );
  if (input.description.trim().length < 10)
    gaps.push('description phải có ít nhất 10 ký tự');
  if (!isCharityUrl(input.bannerUrl))
    gaps.push('bannerUrl phải là một đường dẫn https');
  if (input.badgeName.trim().length === 0)
    gaps.push(
      'badgeName không được rỗng — nó là huy hiệu người tham gia nhận được',
    );
  if (input.badgeName.length > MaxCharityBadgeNameLength)
    gaps.push(`badgeName không vượt ${MaxCharityBadgeNameLength} ký tự`);

  const start = input.startTime.getTime();
  const end = input.endTime.getTime();

  if (!Number.isFinite(start))
    gaps.push('startTime không phải thời điểm hợp lệ');
  if (!Number.isFinite(end)) gaps.push('endTime không phải thời điểm hợp lệ');
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start)
    gaps.push('endTime phải sau startTime');

  if (
    !Number.isInteger(input.targetItemsCount) ||
    input.targetItemsCount < 0 ||
    input.targetItemsCount > MaxCharityTargetItems
  )
    gaps.push(
      `targetItemsCount phải là số nguyên từ 0 tới ${MaxCharityTargetItems}`,
    );

  return gaps;
}

/**
 * Được huỷ đăng ký khi hoạt động CHƯA bắt đầu (BR-CHARITY-03).
 *
 * So với `start_time`, không phải `end_time`: người tổ chức chốt số suất theo danh sách
 * đăng ký trước giờ khai mạc, nên một lượt huỷ giữa buổi không trả lại được gì.
 */
export function canCancelCharityParticipation(input: {
  readonly startTime: Date;
  readonly now: Date;
}): boolean {
  return input.now.getTime() < input.startTime.getTime();
}

/** Chỉ đánh giá được SAU khi hoạt động kết thúc (BR-CHARITY-03). */
export function canReviewCharityCampaign(input: {
  readonly endTime: Date;
  readonly now: Date;
}): boolean {
  return input.now.getTime() >= input.endTime.getTime();
}

/**
 * Vai của người đang viết đánh giá, hoặc `null` khi họ không liên quan tới hoạt động.
 *
 * `null` chứ không phải một vai mặc định: một người ngoài cuộc viết đánh giá được là cho
 * phép chấm điểm một hoạt động mình không dự.
 */
export function charityReviewRoleOf(input: {
  readonly organizerId: string | null;
  readonly participantIds: readonly string[];
  readonly actorId: string;
}): CharityReviewRole | null {
  if (input.organizerId === input.actorId) return 'ORGANIZER';
  if (input.participantIds.includes(input.actorId)) return 'PARTICIPANT';
  return null;
}

export function isCharityReviewRating(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= CharityReviewRatingMin &&
    (value as number) <= CharityReviewRatingMax
  );
}

/**
 * Tiến độ theo phần trăm, hoặc `null` khi không có mục tiêu.
 *
 * `null` chứ không phải 0: `target_items_count = 0` nghĩa là người tổ chức KHÔNG đặt mục
 * tiêu số lượng (§6.2.13 cho nó `DEFAULT 0`), và hiện "0%" cho một hoạt động như vậy là
 * nói sai. Không kẹp trần 100 — khai vượt mục tiêu là chuyện tốt và đáng hiện đúng.
 */
export function charityProgressPercent(input: {
  readonly currentItemsCount: number;
  readonly targetItemsCount: number;
}): number | null {
  if (!Number.isFinite(input.targetItemsCount) || input.targetItemsCount <= 0)
    return null;
  return Math.round((input.currentItemsCount / input.targetItemsCount) * 100);
}
