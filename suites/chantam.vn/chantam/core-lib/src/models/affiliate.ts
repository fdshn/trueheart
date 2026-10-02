/**
 * Affiliate nhóm — bộ máy chia thưởng (F56–F58).
 *
 * Toán nằm ở đây dưới dạng hàm THUẦN vì hai quyết định trong phân hệ này là loại
 * sai một ly đi một dặm: **thứ tự ưu tiên vị trí** (F58) và **cách chia thưởng**
 * (A1). Cái thứ hai, với nhóm 500 người, hai lựa chọn chênh nhau 500 lần.
 */

/**
 * Loại sự kiện sinh affiliate.
 *
 * BR-AFF-02 liệt kê: đăng bài, tặng/giao dịch hoàn tất, mời user mới hợp lệ, tham
 * gia Event/hoạt động, và giao dịch hợp lệ trong vùng Group.
 *
 * Hai loại dưới đây là hai loại có đường gọi THẬT trong mã nguồn. Những loại còn lại
 * mà BR-AFF-02 nhắc — mời user mới hợp lệ, tham gia Event/hoạt động — **cố ý chưa
 * khai**, vì hai lý do cùng lúc:
 *
 * 1. Câu A2 của Bên A (*"những loại sự kiện nào sinh affiliate"*) chưa có trả lời, nên
 *    khai đủ danh sách là tự quyết hộ.
 * 2. Khai một loại mà không nơi nào ghi là dựng lại đúng cái bẫy đã bắt nhiều lần ở
 *    repo này: `SELECT_REQUESTER` seed mà không ai đọc, `postTypes` chỉ để hiển thị,
 *    `canViewExactLocation` hardcode `false` dưới một docblock nói đã hiện thực.
 *
 * Thêm loại nào thì thêm cùng ngày với cái hook của nó.
 */
export const AffiliateEventTypes = ['POST_CREATED', 'GIFT_COMPLETED'] as const;

export type AffiliateEventType = (typeof AffiliateEventTypes)[number];

/**
 * Nguồn toạ độ đã dùng để xét geo, theo thứ tự ưu tiên của BR-GEO-AFF-02 (F58).
 *
 * Ghi lại NGUỒN chứ không chỉ ghi khoảng cách: khi Owner thắc mắc "vì sao sự kiện
 * này bị loại", câu trả lời "cách tâm 7km" chưa đủ — họ cần biết 7km đó đo từ vị
 * trí của bài đăng hay từ Vị trí mặc định của thành viên, vì hai cái có thể cách
 * nhau rất xa và chỉ một trong hai là thứ họ kiểm soát được.
 */
export const AffiliateLocationSources = [
  /** Toạ độ của chính sự kiện (hoạt động/Event có địa điểm riêng). */
  'EVENT',
  /** Toạ độ lượt trao. */
  'TRANSACTION',
  /** Toạ độ bài đăng. */
  'POST',
  /** Vị trí mặc định của thành viên — gốc khi sự kiện không có toạ độ riêng. */
  'MEMBER_DEFAULT',
  /** Không tìm được toạ độ nào. */
  'NONE',
] as const;

export type AffiliateLocationSource = (typeof AffiliateLocationSources)[number];

/** Kết luận geo của một sự kiện (BR-GEO-AFF-01, BR-GEO-AFF-03). */
export const AffiliateGeoStatuses = [
  'ELIGIBLE',
  'NOT_ELIGIBLE_GEO',
  /** Không có toạ độ nào để xét — vẫn lưu để audit, vẫn 0 điểm. */
  'NO_LOCATION',
] as const;

export type AffiliateGeoStatus = (typeof AffiliateGeoStatuses)[number];

/** Kết luận của một dòng reward (BR-AFF-03). */
export const AffiliateRewardStatuses = [
  'AWARDED',
  'NOT_ELIGIBLE_GEO',
  /** Vượt trần ngày của người nhận — vẫn lưu, `point_delta = 0`. */
  'CAPPED',
  /** Sự kiện gốc bị huỷ; đã ghi bút toán đảo (BR-AFF-04). */
  'REVERSED',
] as const;

export type AffiliateRewardStatus = (typeof AffiliateRewardStatuses)[number];

/**
 * Cách chia thưởng — **câu A1, quyết định kinh tế lớn nhất của phân hệ**.
 *
 * - `PER_MEMBER` — mỗi Active Member nhận ĐỦ số điểm của loại sự kiện. Tổng điểm
 *   phát ra tỷ lệ thuận với số thành viên, nên một nhóm 500 người sinh gấp 500 lần
 *   một nhóm 1 người cho cùng một hành động.
 * - `SPLIT_POOL` — số điểm của loại sự kiện là MỘT GIỎ, chia đều cho các Active
 *   Member. Tổng phát ra không đổi theo quy mô nhóm; nhóm càng lớn thì mỗi người
 *   càng ít.
 *
 * Hai cách không phải hai con số mà là hai công thức, nên cả hai được hiện thực và
 * Admin chọn. Mặc định `SPLIT_POOL` vì nó là cách **chặn trên** được tổng điểm:
 * nếu Bên A chưa chốt mà tính năng vô tình bật, `SPLIT_POOL` làm sai lệch một giỏ,
 * còn `PER_MEMBER` làm sai lệch một giỏ nhân số thành viên.
 */
export const AffiliateDistributionModes = ['SPLIT_POOL', 'PER_MEMBER'] as const;

export type AffiliateDistributionMode =
  (typeof AffiliateDistributionModes)[number];

export interface IAffiliatePolicy {
  readonly enabled: boolean;
  readonly distributionMode: AffiliateDistributionMode;
  /** Điểm cho từng loại sự kiện. Thiếu loại nào thì loại đó = 0, tức không phát. */
  readonly eventPoints: Readonly<Record<AffiliateEventType, number>>;
  /**
   * Trần điểm affiliate MỘT người nhận được mỗi ngày — câu A4.
   *
   * `0` nghĩa là chưa cấu hình, và vì `enabled` đòi trần > 0 nên không có đường nào
   * phát điểm mà không có trần. Không trần thì một nhóm lớn sinh điểm không giới hạn,
   * và đó là lỗ farm điểm rẻ nhất của cả hệ.
   */
  readonly dailyCapPerBeneficiary: number;
  /**
   * Trần số người nhận cho MỘT sự kiện.
   *
   * Khác `dailyCapPerBeneficiary`: cái kia chặn một người nhận quá nhiều, cái này
   * chặn một sự kiện ghi quá nhiều dòng. Một nhóm 5.000 người mà mỗi hành động ghi
   * 5.000 dòng reward thì bảng phình nhanh hơn mọi bảng khác trong hệ.
   */
  readonly maxBeneficiariesPerEvent: number;
}

/** Mặc định **không bật và không phát điểm** — cùng lối `DefaultCheckInPolicy`. */
export const DefaultAffiliatePolicy: IAffiliatePolicy = {
  enabled: false,
  distributionMode: 'SPLIT_POOL',
  eventPoints: {
    POST_CREATED: 0,
    GIFT_COMPLETED: 0,
  },
  dailyCapPerBeneficiary: 0,
  maxBeneficiariesPerEvent: 0,
};

export const MaxAffiliateEventPoints = 1_000;
export const MaxAffiliateDailyCap = 100_000;
export const MaxAffiliateBeneficiariesPerEvent = 5_000;

export function normalizeAffiliatePolicy(raw: unknown): IAffiliatePolicy {
  if (typeof raw !== 'object' || raw === null) return DefaultAffiliatePolicy;
  const source = raw as Record<string, unknown>;

  const clampInt = (value: unknown, min: number, max: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  };

  const rawPoints =
    typeof source.eventPoints === 'object' && source.eventPoints !== null
      ? (source.eventPoints as Record<string, unknown>)
      : {};
  const eventPoints = Object.fromEntries(
    AffiliateEventTypes.map((type) => [
      type,
      clampInt(rawPoints[type], 0, MaxAffiliateEventPoints),
    ]),
  ) as Record<AffiliateEventType, number>;

  const mode = source.distributionMode;

  return {
    enabled: source.enabled === true,
    // Giá trị lạ lùi về `SPLIT_POOL`, không về `PER_MEMBER`: lùi về cách chặn trên
    // được tổng điểm là hướng an toàn khi dữ liệu cấu hình không đọc được.
    distributionMode:
      mode === 'PER_MEMBER' || mode === 'SPLIT_POOL' ? mode : 'SPLIT_POOL',
    eventPoints,
    dailyCapPerBeneficiary: clampInt(
      source.dailyCapPerBeneficiary,
      0,
      MaxAffiliateDailyCap,
    ),
    maxBeneficiariesPerEvent: clampInt(
      source.maxBeneficiariesPerEvent,
      0,
      MaxAffiliateBeneficiariesPerEvent,
    ),
  };
}

/**
 * Những chỗ còn thiếu khiến policy KHÔNG dùng được để phát điểm.
 *
 * Trần ngày và trần người nhận đều BẮT BUỘC khi bật — đây là phân hệ mà ROADMAP ghi
 * rõ *"thả M5 ra mà chưa có chống gian lận là mở cửa cho farm điểm"*, nên một policy
 * bật mà không trần là đúng cái cửa đó.
 */
export function affiliatePolicyGaps(policy: IAffiliatePolicy): string[] {
  if (!policy.enabled) return [];

  const gaps: string[] = [];
  if (policy.dailyCapPerBeneficiary < 1)
    gaps.push('dailyCapPerBeneficiary phải lớn hơn 0 khi bật');
  if (policy.maxBeneficiariesPerEvent < 1)
    gaps.push('maxBeneficiariesPerEvent phải lớn hơn 0 khi bật');

  const total = AffiliateEventTypes.reduce(
    (sum, type) => sum + policy.eventPoints[type],
    0,
  );
  // Bật mà mọi loại 0 điểm thì bộ máy chạy không, ghi đầy bảng audit toàn dòng 0
  // điểm — tốn chỗ và làm người đọc tưởng có gì đang hoạt động.
  if (total === 0)
    gaps.push('cần ít nhất một loại sự kiện có eventPoints lớn hơn 0');

  return gaps;
}

export interface IGeoPointLike {
  readonly lat: number;
  readonly lng: number;
}

export interface IAffiliateLocationCandidates {
  readonly eventLocation?: IGeoPointLike | null;
  readonly transactionLocation?: IGeoPointLike | null;
  readonly postLocation?: IGeoPointLike | null;
  readonly memberDefaultLocation?: IGeoPointLike | null;
}

export interface IResolvedAffiliateLocation {
  readonly location: IGeoPointLike | null;
  readonly source: AffiliateLocationSource;
}

/**
 * Chọn toạ độ để xét geo, theo đúng thứ tự BR-GEO-AFF-02 (F58).
 *
 * *"Default Location là vị trí gốc của member cho Geo Affiliate KHI sự kiện không có
 * location riêng. Nếu event có event_location/transaction_location/post_location thì
 * ưu tiên location nghiệp vụ."*
 *
 * Thứ tự quan trọng vì nó quyết ai được thưởng: một người ở Hà Nội đăng bài tặng đồ
 * ở TP.HCM — lấy Vị trí mặc định thì sự kiện bị loại khỏi nhóm TP.HCM, lấy vị trí
 * bài đăng thì được nhận. Đặc tả chọn cái thứ hai, và hàm này là chỗ DUY NHẤT quyết
 * định đó được viết ra.
 */
export function resolveAffiliateLocation(
  candidates: IAffiliateLocationCandidates,
): IResolvedAffiliateLocation {
  const ordered: [AffiliateLocationSource, IGeoPointLike | null | undefined][] =
    [
      ['EVENT', candidates.eventLocation],
      ['TRANSACTION', candidates.transactionLocation],
      ['POST', candidates.postLocation],
      ['MEMBER_DEFAULT', candidates.memberDefaultLocation],
    ];

  for (const [source, location] of ordered)
    if (location) return { location, source };

  return { location: null, source: 'NONE' };
}

export interface IAffiliateShare {
  readonly beneficiaryUserId: string;
  readonly pointDelta: number;
}

/**
 * Chia điểm của một sự kiện cho các Active Member — câu A1.
 *
 * `SPLIT_POOL` chia phần dư cho những người ĐẦU danh sách thay vì bỏ đi: với giỏ 10
 * điểm và 3 người, kết quả là 4/3/3 chứ không phải 3/3/3 làm bay mất 1 điểm. Thứ tự
 * danh sách do nơi gọi quyết (hiện là theo `global_id`), nên nó tiền định — không ai
 * được nhiều hơn vì may.
 *
 * Người nhận 0 điểm vẫn được trả về: BR-GEO-AFF-03 và BR-AFF-03 đòi lưu đủ dòng để
 * audit, nên "ai lẽ ra được chia" là thông tin phải giữ, kể cả khi phần chia là 0.
 */
export function distributeAffiliatePoints(params: {
  readonly beneficiaryUserIds: readonly string[];
  readonly eventPoints: number;
  readonly mode: AffiliateDistributionMode;
}): IAffiliateShare[] {
  const people = params.beneficiaryUserIds;
  if (people.length === 0 || params.eventPoints <= 0)
    return people.map((beneficiaryUserId) => ({
      beneficiaryUserId,
      pointDelta: 0,
    }));

  if (params.mode === 'PER_MEMBER')
    return people.map((beneficiaryUserId) => ({
      beneficiaryUserId,
      pointDelta: params.eventPoints,
    }));

  const base = Math.floor(params.eventPoints / people.length);
  let remainder = params.eventPoints % people.length;

  return people.map((beneficiaryUserId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { beneficiaryUserId, pointDelta: base + extra };
  });
}

/** Khoá chống trùng của BR-AFF-04: beneficiary + source reference + event type. */
export function affiliateRewardIdempotencyKey(params: {
  readonly beneficiaryUserId: string;
  readonly eventType: AffiliateEventType;
  readonly referenceType: string;
  readonly referenceId: string;
}): string {
  return [
    'AFFILIATE',
    params.eventType,
    params.referenceType,
    params.referenceId,
    params.beneficiaryUserId,
  ].join(':');
}
