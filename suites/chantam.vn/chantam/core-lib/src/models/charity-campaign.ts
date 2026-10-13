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
/**
 * Hai loại hoạt động từ thiện dùng chung một engine (F65b §1).
 *
 * Dữ liệu trước 12/10 đều là `ORGANIZED_CAMPAIGN`, và đó không phải lựa chọn tuỳ
 * ý: tới lúc đó chỉ Kim Cương tạo được hoạt động, tức mọi hàng đang có đều là
 * hoạt động có tổ chức.
 */
export const CharityCampaignTypes = [
  'INDIVIDUAL_APPEAL',
  'ORGANIZED_CAMPAIGN',
] as const;

export type CharityCampaignType = (typeof CharityCampaignTypes)[number];

/** Quan hệ giữa người kêu gọi và người thụ hưởng. */
export const CharityBeneficiaryRelations = ['SELF', 'OTHER'] as const;

export type CharityBeneficiaryRelation =
  (typeof CharityBeneficiaryRelations)[number];

/**
 * Capability quyết định ai tạo được loại nào (F65b §2).
 *
 * Ba cái, không phải một — và không phép so Rank nào nằm trong controller. Rank
 * là cấu hình động: Bên A đổi baseline qua Rank Config mà không cần deploy, nên
 * một `if (rank === 'DIAMOND')` trong mã là một bản sao sẽ trôi.
 */
export const CharityCapabilityByType: Readonly<
  Record<CharityCampaignType, string>
> = {
  INDIVIDUAL_APPEAL: 'SUBMIT_INDIVIDUAL_APPEAL',
  ORGANIZED_CAMPAIGN: 'SUBMIT_CHARITY_PROPOSAL',
};

/**
 * Quyền public ngay, không chờ Admin duyệt.
 *
 * Tách khỏi quyền TẠO vì hai câu hỏi khác nhau: "được mở kêu gọi không" và "nội
 * dung có cần ai đọc trước khi ra ngoài không". Gộp chúng là buộc mọi người được
 * tạo cũng được public.
 */
export const PublishCharityWithoutReviewCapability =
  'PUBLISH_CHARITY_WITHOUT_REVIEW';

export const CreateCharityCampaignCapability = 'SUBMIT_CHARITY_PROPOSAL';

/** Đơn vị của một dòng nhu cầu — tối đa 30 ký tự, khớp `varchar(30)` của cột. */
export const MaxNeedItemUnitLength = 30;
export const MaxNeedItemNameLength = 200;
/** Trần số lượng mỗi dòng, khớp `CHK_campaign_need_items_target`. */
export const MaxNeedItemQuantity = 1_000_000;
/** Trần số dòng nhu cầu mỗi lượt tạo — giữ một request ở kích cỡ đọc được. */
export const MaxNeedItemsPerCampaign = 50;

export interface ICharityNeedProgressInput {
  readonly targetQuantity: number;
  readonly acceptedQuantity: number;
  readonly receivedQuantity: number;
}

/**
 * Phần còn thiếu của một dòng nhu cầu (F65b §3).
 *
 * `activeQuantity` (đã nhận đề nghị, transaction chưa xong) và `receivedQuantity`
 * (thực nhận) đều TRỪ vào phần còn thiếu; `pendingQuantity` thì KHÔNG — đề nghị
 * chưa được chấp nhận không giữ chỗ. Giữ chỗ ngay lúc gửi đề nghị thì một loạt đề
 * nghị không thực hiện sẽ làm chiến dịch trông như đã đủ và chặn người tặng thật.
 */
export function remainingNeedQuantity(
  input: ICharityNeedProgressInput,
): number {
  return Math.max(
    0,
    input.targetQuantity - input.acceptedQuantity - input.receivedQuantity,
  );
}

/**
 * Một con số tiến độ CHUNG cho cả chiến dịch, chỉ để trình bày (F65b §3).
 *
 * **Không phải số lượng và không phải nguồn sự thật.** Nó là trung bình tỷ lệ hoàn
 * thành của các dòng đang bật, mỗi tỷ lệ kẹp ở 100% trước khi lấy trung bình. Cộng
 * `kg + cái + hộp` thành một tổng là con số không có nghĩa, nên phép trung bình này
 * cố ý đi qua TỶ LỆ chứ không qua số lượng.
 *
 * `null` khi không có dòng nào đang bật — không phải `0`, vì 0% nghĩa là "chưa nhận
 * được gì" còn đây là "chưa khai nhu cầu nào".
 */
export function overallNeedProgressPercent(
  needs: readonly ICharityNeedProgressInput[],
): number | null {
  if (needs.length === 0) return null;

  const total = needs.reduce((sum, need) => {
    if (need.targetQuantity <= 0) return sum;
    const done = need.acceptedQuantity + need.receivedQuantity;
    return sum + Math.min(100, (done / need.targetQuantity) * 100);
  }, 0);

  return Math.round(total / needs.length);
}

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

export const CharityMediaTypes = ['IMAGE', 'VIDEO'] as const;

export type CharityMediaType = (typeof CharityMediaTypes)[number];

/** Trần số ảnh/video của một hoạt động. Ảnh bìa nằm TRONG số này, không tính riêng. */
export const MaxCharityMediaPerCampaign = 5;

/**
 * Phép kiểm HÌNH DẠNG bộ media, chạy TRƯỚC khi hỏi kho lưu trữ.
 *
 * Tách khỏi phép kiểm loại vì hai thứ cần hai lượt khác nhau: hình dạng chỉ cần mảng
 * key client gửi, còn loại (ảnh hay video) chỉ biết sau HeadObject. Kiểm hình dạng
 * trước để một mảng 50 key rác không thành 50 lượt gọi R2.
 */
export function charityMediaShapeGaps(input: {
  readonly keys: readonly string[];
  readonly coverKey: string;
}): string[] {
  const gaps: string[] = [];

  if (input.keys.length < 1 || input.keys.length > MaxCharityMediaPerCampaign)
    gaps.push(`media phải có từ 1 tới ${MaxCharityMediaPerCampaign} phần tử`);
  if (new Set(input.keys).size !== input.keys.length)
    gaps.push('media không được có key trùng nhau');
  if (!input.keys.includes(input.coverKey))
    gaps.push('coverKey phải là một key trong media');

  return gaps;
}

/**
 * Phép kiểm LOẠI, chạy sau khi kho lưu trữ đã xác nhận từng key.
 *
 * Bìa phải là ảnh vì `banner_url` được hiện trong thẻ danh sách và Map Discovery —
 * những chỗ chỉ dựng `<img>`, không dựng trình phát video.
 */
export function charityMediaTypeGaps(input: {
  readonly items: readonly {
    readonly key: string;
    readonly mediaType: CharityMediaType;
  }[];
  readonly coverKey: string;
}): string[] {
  const gaps: string[] = [];

  if (!input.items.some((item) => item.mediaType === 'IMAGE'))
    gaps.push('media phải có ít nhất một ảnh');
  const cover = input.items.find((item) => item.key === input.coverKey);
  if (cover && cover.mediaType !== 'IMAGE')
    gaps.push('ảnh bìa phải là ảnh, không phải video');

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

/**
 * Vòng đời một đề nghị đóng góp (F65b §4).
 *
 * `DRAFT` **không** có: không endpoint nào lưu nháp, và schema không có chỗ phân
 * biệt nháp với chờ duyệt. Khai một trạng thái không đường nào ghi được là mời
 * người sau viết mã cho nó.
 */
export const CharityContributionStatuses = [
  'PENDING_REVIEW',
  'PARTIALLY_ACCEPTED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type CharityContributionStatus =
  (typeof CharityContributionStatuses)[number];

/**
 * Mã lý do từ chối. Bắt buộc khi nhận ít hơn số đề nghị (§4).
 *
 * `CAMPAIGN_CLOSED` không nằm trong danh sách §4 mà đến từ §8: đóng chiến dịch thì
 * từ chối hàng loạt đề nghị đang chờ với lý do này. Để nó cùng chỗ vì nó cũng là
 * một lý do organizer không nhận, chỉ khác là hệ thống điền thay.
 */
export const CharityRejectionReasons = [
  'TARGET_REACHED',
  'NOT_MATCH_REQUIREMENT',
  'DELIVERY_NOT_AGREED',
  'CANNOT_CONTACT',
  'QUALITY_NOT_ACCEPTABLE',
  'CAMPAIGN_CLOSED',
  'OTHER',
] as const;

export type CharityRejectionReason = (typeof CharityRejectionReasons)[number];

export const MaxContributionItems = 20;
export const MaxContributionNoteLength = 1000;
export const MaxContributionContactNoteLength = 500;
export const MaxContributionConditionNoteLength = 500;

/**
 * Contributor còn được sửa hoặc rút đề nghị không (§4).
 *
 * Chỉ khi **chưa có phần nào được chấp nhận**. Sau đó mọi thay đổi phải đi qua huỷ
 * transaction — sửa ngược lịch sử của một đề nghị đã sinh lượt giao nhận là làm
 * hai bên nói khác nhau về cùng một cam kết.
 *
 * Nhận trạng thái chứ không nhận các dòng: trạng thái là nguồn duy nhất, và lát C
 * ghi nó trong cùng transaction với lượt quyết định.
 */
export function canEditContribution(
  status: CharityContributionStatus,
): boolean {
  return status === 'PENDING_REVIEW';
}

export interface ICharityContributionItemDecision {
  readonly offeredQuantity: number;
  /** `null` khi organizer chưa quyết dòng này. */
  readonly acceptedQuantity: number | null;
}

/**
 * Trạng thái của đề nghị, suy từ các dòng sau một lượt quyết định (§4).
 *
 * Hàm thuần, và đó là chủ ý: `PARTIALLY_ACCEPTED` là chỗ dễ sai nhất trong cả phân
 * hệ. Ba nơi cần kết luận này — danh sách organizer, danh sách contributor, phép
 * chặn sửa — nên nếu mỗi nơi tự suy thì chúng sẽ trôi khỏi nhau.
 *
 * Còn dòng chưa quyết thì vẫn là `PENDING_REVIEW`: một đề nghị ba dòng mới xử một
 * dòng chưa phải là một đề nghị đã xử.
 */
export function contributionStatusFrom(
  items: readonly ICharityContributionItemDecision[],
): CharityContributionStatus {
  if (items.length === 0) return 'PENDING_REVIEW';
  if (items.some((item) => item.acceptedQuantity === null))
    return 'PENDING_REVIEW';

  const accepted = items.filter((item) => (item.acceptedQuantity ?? 0) > 0);
  if (accepted.length === 0) return 'REJECTED';

  // Nhận ĐỦ mọi dòng mới là ACCEPTED. Nhận đủ số trên vài dòng mà bỏ hẳn dòng
  // khác vẫn là nhận một phần — người tặng cần thấy đúng điều đó.
  const full = items.every(
    (item) => item.acceptedQuantity === item.offeredQuantity,
  );
  return full ? 'ACCEPTED' : 'PARTIALLY_ACCEPTED';
}

export interface IContributionLineForDecision {
  readonly contributionItemId: string;
  readonly needItemId: string;
  readonly offeredQuantity: number;
}

export interface IContributionLineDecision {
  readonly contributionItemId: string;
  readonly acceptedQuantity: number;
  readonly rejectionReason?: CharityRejectionReason | null;
}

/**
 * Vì sao một lượt quyết định không hợp lệ. `null` khi hợp lệ.
 *
 * Trả lý do chứ không trả `boolean`: người tổ chức đang chọn số lượng cho từng dòng,
 * và "quyết định không hợp lệ" mà không nói dòng nào là một màn hình họ phải tự dò.
 */
export function contributionDecisionProblem(
  lines: readonly IContributionLineForDecision[],
  decisions: readonly IContributionLineDecision[],
): string | null {
  // Quyết MỌI dòng trong một lượt, không quyết dần. Một đề nghị nửa đã quyết sẽ sinh
  // một lượt giao nhận cho phần đã nhận rồi chờ phần kia — và lượt quyết thứ hai
  // không có chỗ nào để đặt lượt giao nhận thứ hai (`UQ_campaign_deliveries_contribution`).
  const byId = new Map(lines.map((line) => [line.contributionItemId, line]));
  const seen = new Set<string>();

  for (const decision of decisions) {
    const line = byId.get(decision.contributionItemId);
    if (!line)
      return `Dòng ${decision.contributionItemId} không thuộc đề nghị này`;
    if (seen.has(decision.contributionItemId))
      return `Dòng ${decision.contributionItemId} được quyết hai lần`;
    seen.add(decision.contributionItemId);

    if (
      !Number.isInteger(decision.acceptedQuantity) ||
      decision.acceptedQuantity < 0 ||
      decision.acceptedQuantity > line.offeredQuantity
    )
      return `Dòng ${decision.contributionItemId}: số nhận phải từ 0 tới ${line.offeredQuantity}`;

    const partial = decision.acceptedQuantity < line.offeredQuantity;
    const reason = decision.rejectionReason ?? null;
    // Nhận ÍT hơn đề nghị thì PHẢI nói vì sao (§4); nhận đủ thì KHÔNG được mang lý
    // do từ chối — database cũng chặn, nhưng chặn ở đây cho ra câu đọc được.
    if (partial && reason === null)
      return `Dòng ${decision.contributionItemId}: nhận ít hơn đề nghị thì phải chọn lý do`;
    if (!partial && reason !== null)
      return `Dòng ${decision.contributionItemId}: nhận đủ thì không có lý do từ chối`;
  }

  if (seen.size !== lines.length)
    return 'Phải quyết đủ mọi dòng của đề nghị trong một lượt';
  return null;
}

export interface INeedCapacity {
  readonly needItemId: string;
  readonly itemName: string;
  readonly targetQuantity: number;
  readonly acceptedQuantity: number;
  readonly receivedQuantity: number;
}

export interface INeedOverflow {
  readonly needItemId: string;
  readonly itemName: string;
  readonly requested: number;
  readonly remaining: number;
}

/**
 * Dòng nhu cầu đầu tiên mà lượt chấp nhận này làm VƯỢT phần còn thiếu (§5).
 *
 * Gọi TRONG transaction, sau khi đã khoá các dòng nhu cầu — con số `remaining` ở đây
 * chỉ đúng vì không ai khác ghi được vào những dòng đó cho tới khi transaction xong.
 * Gọi ngoài khoá là đúng cái lỗ mà tiêu chí §11.1 (hai người tổ chức bấm cùng lúc)
 * được viết ra để canh.
 *
 * Không âm thầm cắt số: §5 nói người tổ chức phải biết chính xác mình vừa chấp nhận
 * bao nhiêu, nên vượt thì từ chối cả lượt và trả phần còn lại mới nhất.
 */
export function firstNeedOverflow(
  needs: readonly INeedCapacity[],
  accepted: readonly { needItemId: string; acceptedQuantity: number }[],
  /**
   * Chiến dịch cho phép nhận vượt mục tiêu (§5: *"nếu chiến dịch không cho vượt"*).
   * Mặc định `false` — hành vi đã chạy tới 12/10.
   */
  allowOverTarget = false,
): INeedOverflow | null {
  if (allowOverTarget) return null;
  const requested = new Map<string, number>();
  for (const line of accepted)
    requested.set(
      line.needItemId,
      (requested.get(line.needItemId) ?? 0) + line.acceptedQuantity,
    );

  for (const need of needs) {
    const want = requested.get(need.needItemId) ?? 0;
    if (want === 0) continue;
    const remaining = remainingNeedQuantity(need);
    if (want > remaining)
      return {
        needItemId: need.needItemId,
        itemName: need.itemName,
        requested: want,
        remaining,
      };
  }
  return null;
}
