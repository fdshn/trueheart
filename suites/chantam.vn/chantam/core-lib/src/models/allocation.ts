/**
 * Chính sách phân bổ & ghép nối toàn hệ thống (SRS §6.2.14 `system_allocation_configs`,
 * F61 — ô cấu hình cuối còn sót của nhóm "Cấu hình có version").
 *
 * Năm cột SRS nêu đều là thứ ĐANG được quyết bằng hằng số cứng trong mã nguồn, nên
 * mỗi cột ở đây là một hằng số được gỡ ra khỏi `src/domain/consts`. Mặc định của
 * `DefaultAllocationPolicy` cố ý **trùng khít hành vi hôm nay**: triển khai bản này
 * không đổi một gợi ý nào, tới khi Admin publish bản đầu tiên.
 *
 * Đó là lý do mặc định ở đây KHÁC mặc định SRS ghi (`category_match_required DEFAULT
 * true`). Mã hiện tại lọc `(cùng danh mục HOẶC trùng từ khoá)`, tức danh mục không
 * bắt buộc. Lấy `true` làm mặc định là **âm thầm thắt** bộ lọc ngay lúc deploy, và
 * không ai biết vì sao gợi ý đột nhiên ít đi. Giá trị SRS đề nghị là giá trị Bên A
 * publish bằng một lượt `PUT`, không phải thứ lén thay đổi theo bản cài.
 *
 * KHÔNG dựng bảng riêng. `system_configs` đã có copy-on-write, `updated_by` và
 * `change_reason` đi thẳng vào audit log — đúng cơ chế mà `selection.candidate_priority`
 * (cùng nhóm `/admin/config`) đang dùng. Thêm một bảng revision nữa chỉ để chứa sáu
 * trường là chép lại một cơ chế đã có.
 */

/**
 * Luật chọn bán kính khi ghép nối.
 *
 * Ba giá trị, và cái thứ ba là cái SRS đặt làm mặc định:
 *
 * - `FILTER_ONLY` — chỉ bán kính người dùng gửi (hoặc mặc định khi họ không gửi).
 *   Đây là hành vi của Smart Match tới hôm nay: hạng của người dùng **không** tham gia.
 * - `RANK_ONLY` — chỉ hạn mức `DISCOVERY_RADIUS` theo hạng, bỏ qua bộ lọc client gửi.
 * - `RANK_OR_FILTER` — lấy cái NỚI HƠN của hai. Tên SRS đặt là "OR" nên nghĩa là hợp
 *   của hai vùng, chứ không phải giao; lấy giao thì đã gọi là `AND`.
 *
 * Mọi giá trị đều còn bị kẹp vào cận kỹ thuật `MinSearchRadiusMeters` /
 * `MaxSearchRadiusMeters` ở tầng truy vấn — cấu hình của Admin không nới được chúng.
 */
export const AllocationDistanceRules = [
  'FILTER_ONLY',
  'RANK_ONLY',
  'RANK_OR_FILTER',
] as const;

export type AllocationDistanceRule = (typeof AllocationDistanceRules)[number];

/**
 * Trọng số chấm điểm khớp.
 *
 * SRS §6.2.14 **không** nêu ba trọng số này — đó là lỗ hổng thứ hai, không phải lỗ
 * hổng SRS mô tả. Nối năm cột SRS mà bỏ trọng số thì `SmartMatchWeights` vẫn là hằng
 * số cứng, và Admin vẫn không đổi được thứ quyết định **thứ tự** gợi ý. Nửa vời theo
 * đúng nghĩa: cấu hình được cái lọc, không cấu hình được cái xếp hạng.
 */
export interface IAllocationMatchWeights {
  readonly sameCategory: number;
  readonly keyword: number;
  readonly proximity: number;
}

export interface IAllocationPolicy {
  /**
   * `true` thì cùng danh mục là ĐIỀU KIỆN BẮT BUỘC; `false` thì chỉ cần cùng danh mục
   * HOẶC trùng từ khoá.
   */
  readonly categoryMatchRequired: boolean;
  readonly distanceRule: AllocationDistanceRule;
  /**
   * Tắt thì bỏ hẳn nhánh `to_tsquery` khỏi truy vấn — rẻ hơn, nhưng gợi ý chỉ còn dựa
   * vào danh mục. Tắt CÙNG LÚC với `categoryMatchRequired = false` là không còn tín
   * hiệu nào ngoài khoảng cách, nên `allocationPolicyGaps` chặn cặp đó.
   */
  readonly keywordMatchEnabled: boolean;
  /**
   * Tự tạo lượt trao từ gợi ý, không chờ người dùng xin nhận.
   *
   * **Chưa hiện thực.** Giữ trường để đúng schema SRS, nhưng `allocationPolicyGaps`
   * TỪ CHỐI `true`: một cờ bật được mà không đường mã nào đọc là đúng cái bẫy đã bắt
   * nhiều lần ở repo này (`canViewExactLocation` hardcode `false`, `SELECT_REQUESTER`
   * seed mà không ai đọc). Thà báo "chưa làm" ở API còn hơn để Admin bật rồi ngồi đợi
   * một việc không bao giờ xảy ra.
   */
  readonly autoCreateTransaction: boolean;
  readonly maxSuggestions: number;
  readonly weights: IAllocationMatchWeights;
}

/** Khoá `system_configs` chứa cả chính sách dưới dạng JSON. */
export const AllocationPolicyConfigKey = 'allocation.policy';

/**
 * Trần số gợi ý.
 *
 * Bằng đúng `SmartMatchCandidateLimit` — rổ ứng viên truy vấn kéo về. Cho phép cấu
 * hình vượt số đó là hứa nhiều hơn thứ câu truy vấn có thể trả: Admin đặt 200 rồi
 * thấy mãi chỉ 100, không có chỗ nào nói vì sao.
 */
export const MaxAllocationSuggestions = 100;

/** Mặc định = hành vi hôm nay, từng giá trị một. */
export const DefaultAllocationPolicy: IAllocationPolicy = {
  // `post.repository.ts` lọc `(category_id = X OR keywordMatch)` khi có từ khoá.
  categoryMatchRequired: false,
  // `get-smart-matches.use-case.ts` không đọc `DISCOVERY_RADIUS` ở đường này.
  distanceRule: 'FILTER_ONLY',
  keywordMatchEnabled: true,
  autoCreateTransaction: false,
  // `SmartMatchMaxResults`.
  maxSuggestions: 20,
  // `SmartMatchWeights`.
  weights: { sameCategory: 0.5, keyword: 0.3, proximity: 0.2 },
};

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Chuẩn hoá trọng số về tổng bằng 1.
 *
 * `scoreSmartMatch` hứa trả điểm trong `[0, 1]` và giao diện đọc nó như phần trăm độ
 * khớp. Nhận thẳng `{5, 3, 2}` của Admin là phá lời hứa đó — điểm lên tới 10 và thanh
 * phần trăm tràn. Chia cho tổng giữ nguyên TỈ LỆ Admin muốn, thứ duy nhất có nghĩa ở
 * đây, mà không phải bắt họ tự tính ra số thập phân cộng đúng bằng 1.
 *
 * Tổng bằng 0 (hoặc mọi số đều hỏng) thì về mặc định: chia cho 0 ra `NaN`, và một
 * `NaN` lọt vào `sort` làm thứ tự gợi ý thành ngẫu nhiên tuỳ cách duyệt mảng.
 */
function normalizeWeights(raw: unknown): IAllocationMatchWeights {
  if (typeof raw !== 'object' || raw === null)
    return DefaultAllocationPolicy.weights;
  const source = raw as Record<string, unknown>;

  const read = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  };

  const sameCategory = read(source.sameCategory);
  const keyword = read(source.keyword);
  const proximity = read(source.proximity);
  const total = sameCategory + keyword + proximity;

  if (total <= 0) return DefaultAllocationPolicy.weights;

  return {
    sameCategory: sameCategory / total,
    keyword: keyword / total,
    proximity: proximity / total,
  };
}

export function normalizeAllocationPolicy(raw: unknown): IAllocationPolicy {
  if (typeof raw !== 'object' || raw === null) return DefaultAllocationPolicy;
  const source = raw as Record<string, unknown>;

  const rule = source.distanceRule;

  return {
    categoryMatchRequired: source.categoryMatchRequired === true,
    distanceRule: AllocationDistanceRules.includes(
      rule as AllocationDistanceRule,
    )
      ? (rule as AllocationDistanceRule)
      : DefaultAllocationPolicy.distanceRule,
    // Khác ba cờ còn lại: thiếu khoá thì BẬT, vì tắt từ khoá là thu hẹp gợi ý. Dữ
    // liệu cấu hình đọc không ra không được tự ý cắt bớt thứ người dùng đang thấy.
    keywordMatchEnabled: source.keywordMatchEnabled !== false,
    autoCreateTransaction: source.autoCreateTransaction === true,
    maxSuggestions: clampInt(
      source.maxSuggestions,
      1,
      MaxAllocationSuggestions,
      DefaultAllocationPolicy.maxSuggestions,
    ),
    weights: normalizeWeights(source.weights),
  };
}

/**
 * Những chỗ khiến chính sách KHÔNG dùng được, cùng lối `affiliatePolicyGaps`.
 *
 * Khác `affiliatePolicyGaps` ở một điểm: không có cờ `enabled` để thoát sớm. Phân bổ
 * không tắt được — mọi lượt gọi Smart Match đều đi qua chính sách này — nên mọi bản
 * publish đều phải dùng được.
 */
export function allocationPolicyGaps(policy: IAllocationPolicy): string[] {
  const gaps: string[] = [];

  if (!policy.categoryMatchRequired && !policy.keywordMatchEnabled)
    gaps.push(
      'categoryMatchRequired và keywordMatchEnabled không được tắt cùng lúc: ' +
        'gợi ý sẽ chỉ còn lọc theo khoảng cách',
    );

  if (policy.autoCreateTransaction)
    gaps.push(
      'autoCreateTransaction: chưa hiện thực, chưa đường mã nào đọc cờ này nên ' +
        'bật lên sẽ không có tác dụng gì',
    );

  if (policy.maxSuggestions < 1) gaps.push('maxSuggestions phải lớn hơn 0');

  return gaps;
}

/**
 * Bán kính cuối cùng của một lượt ghép nối, theo luật đã chọn.
 *
 * Hạn mức theo hạng vắng mặt (khách chưa đăng nhập, hoặc chưa seed `DISCOVERY_RADIUS`)
 * thì `RANK_ONLY` lùi về bộ lọc chứ không trả 0: trả 0 là không gợi ý gì cho ai cho
 * tới khi Admin seed xong capability, một cách làm chết tính năng mà không báo lỗi.
 */
export function resolveAllocationRadiusMeters(
  rule: AllocationDistanceRule,
  radii: {
    readonly filterRadiusMeters: number;
    readonly rankRadiusMeters?: number | null;
  },
): number {
  const rank =
    typeof radii.rankRadiusMeters === 'number' &&
    Number.isFinite(radii.rankRadiusMeters) &&
    radii.rankRadiusMeters > 0
      ? radii.rankRadiusMeters
      : null;

  if (rule === 'FILTER_ONLY') return radii.filterRadiusMeters;
  if (rule === 'RANK_ONLY') return rank ?? radii.filterRadiusMeters;

  return Math.max(radii.filterRadiusMeters, rank ?? 0);
}
