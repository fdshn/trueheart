/**
 * Dự án từ thiện 4 giai đoạn — đợt 2 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.3, §3.4,
 * §3.7, §3.10, §3.13): lịch sử sửa (chữ đỏ), checklist tab B, thông báo theo dự án, bản in.
 *
 * Mọi luật ở đây là hàm thuần để backend và test dùng CÙNG một nguồn.
 */

// ── Lịch sử sửa kế hoạch (§3.3) ─────────────────────────────────────────────

export const CharityRevisionEntities = [
  'CAMPAIGN',
  'PARTY',
  'TEAM',
  'PHASE',
  'NEED_ITEM',
  'BANK_ACCOUNT',
  'FUNDING_NEED',
  'VOLUNTEER_NEED',
  'TASK',
  /** Đợt 4: tổng kết và báo cáo tài chính sửa SAU khi công khai. */
  'SUMMARY',
  'FINANCIAL_REPORT',
] as const;
export type CharityRevisionEntity = (typeof CharityRevisionEntities)[number];

/** Field đặc biệt của revision "thêm/xoá cả dòng". */
export const CharityRevisionRowField = '*';

/** Một dòng đem so: id (`null` với entity CAMPAIGN) và giá trị theo tên field. */
export interface ICharityRevisionRow {
  readonly id: string | null;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface ICharityRevisionDraft {
  readonly entity: CharityRevisionEntity;
  readonly entityId: string | null;
  /** Tên field camelCase, hoặc `*` khi cả dòng được thêm/xoá. */
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  /** `false` = chỉ workspace thấy (SĐT, người nhận hàng…). */
  readonly isPublic: boolean;
  /** Thay đổi quan trọng — báo người đã ủng hộ/tham gia/quan tâm (§3.3, §3.10). */
  readonly isImportant: boolean;
}

interface IRevisionPolicy {
  /** Field được theo dõi. Field khác (số tiến độ, thứ tự…) không sinh revision. */
  readonly fields: readonly string[];
  readonly isPrivate: (
    field: string,
    row: Readonly<Record<string, unknown>>,
  ) => boolean;
  /** Áp cho cả dòng thêm/xoá khi `field = '*'`. */
  readonly isImportant: (
    field: string,
    row: Readonly<Record<string, unknown>>,
  ) => boolean;
}

const never = () => false;

/**
 * Field nào theo dõi, field nào riêng tư, thay đổi nào quan trọng — theo đúng phạm vi bản
 * công khai của mục Kế hoạch (đợt 1): cái gì không lên public thì revision của nó cũng không.
 */
export const CharityRevisionPolicies: Readonly<
  Record<CharityRevisionEntity, IRevisionPolicy>
> = {
  CAMPAIGN: {
    fields: [
      'appealPurpose',
      'appealAudience',
      'appealCircumstance',
      'callToActions',
    ],
    isPrivate: never,
    isImportant: never,
  },
  PARTY: {
    fields: [
      'role',
      'name',
      'beneficiaryKind',
      'address',
      'hotline',
      'email',
      'phone',
      'picName',
      'picPhone',
      'picUserId',
      'evidenceUrls',
    ],
    // Bên thụ hưởng chỉ công khai tên và loại; đơn vị khác công khai địa chỉ/hotline/email.
    isPrivate: (field, row) =>
      ['phone', 'picName', 'picPhone', 'picUserId', 'evidenceUrls'].includes(
        field,
      ) ||
      (row.role === 'BENEFICIARY' &&
        ['address', 'hotline', 'email'].includes(field)),
    isImportant: (_field, row) => row.role === 'BENEFICIARY',
  },
  TEAM: {
    fields: [
      'role',
      'displayName',
      'position',
      'userId',
      'address',
      'phone',
      'email',
      'bankAccountId',
    ],
    isPrivate: (field) =>
      ['address', 'phone', 'email', 'bankAccountId'].includes(field),
    isImportant: never,
  },
  PHASE: {
    fields: [
      'startsAt',
      'endsAt',
      'deliveryMethod',
      'reportMode',
      'hotline',
      'picName',
      'picPhone',
      'picUserId',
    ],
    isPrivate: (field) => ['picName', 'picPhone', 'picUserId'].includes(field),
    isImportant: (field, row) =>
      row.phase === 'DISTRIBUTION' &&
      ['*', 'startsAt', 'endsAt', 'deliveryMethod'].includes(field),
  },
  NEED_ITEM: {
    fields: [
      'unitPrice',
      'estimatedValue',
      'itemCondition',
      'conditionNote',
      'supplySource',
      'intakeDeadline',
      'dropoffAddress',
      'deliveryInstruction',
      'receiverName',
      'receiverPhone',
      'intakeStatus',
      'surplusExplanation',
    ],
    isPrivate: (field) => ['receiverName', 'receiverPhone'].includes(field),
    isImportant: (field) =>
      ['intakeDeadline', 'dropoffAddress'].includes(field),
  },
  BANK_ACCOUNT: {
    fields: [
      'label',
      'bankName',
      'accountNo',
      'accountName',
      'validTo',
      'closeReason',
    ],
    isPrivate: never,
    // Đổi nơi nhận tiền luôn phải báo — đây là chỗ lừa đảo hay đánh vào nhất.
    isImportant: () => true,
  },
  FUNDING_NEED: {
    // Số đã xác nhận/nhập ngoài là TIẾN ĐỘ, không phải sửa kế hoạch — không theo dõi.
    fields: [
      'title',
      'description',
      'beneficiaryPartyId',
      'receivingUnit',
      'bankAccountId',
      'targetAmount',
      'deadline',
      'status',
    ],
    isPrivate: never,
    isImportant: (field) =>
      ['*', 'targetAmount', 'bankAccountId', 'beneficiaryPartyId'].includes(
        field,
      ),
  },
  VOLUNTEER_NEED: {
    fields: [
      'title',
      'description',
      'requirements',
      'neededCount',
      'startsAt',
      'endsAt',
      'locationLabel',
      'status',
    ],
    isPrivate: never,
    isImportant: (field) => ['startsAt', 'locationLabel'].includes(field),
  },
  TASK: {
    fields: ['status', 'scheduledAt'],
    isPrivate: never,
    isImportant: never,
  },
  SUMMARY: {
    fields: [
      'summary',
      'usageReport',
      'thanksMessage',
      'lessonsLearned',
      'evidenceUrls',
    ],
    isPrivate: never,
    isImportant: never,
  },
  FINANCIAL_REPORT: {
    fields: [
      'periodFrom',
      'periodTo',
      'totalIncome',
      'totalExpense',
      'explanation',
      'statementUrls',
    ],
    isPrivate: never,
    // Đổi số thu/chi sau khi đã công khai là chuyện người góp tiền phải biết.
    isImportant: (field) =>
      ['*', 'totalIncome', 'totalExpense'].includes(field),
  },
};

/** Ngày giờ thành ISO, `undefined` thành `null` — để so và lưu jsonb ổn định. */
export function normalizeRevisionValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeRevisionValue);
  return value;
}

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(normalizeRevisionValue(left)) ===
  JSON.stringify(normalizeRevisionValue(right));

function publicValues(
  entity: CharityRevisionEntity,
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const policy = CharityRevisionPolicies[entity];
  const result: Record<string, unknown> = {};
  for (const field of policy.fields)
    if (!policy.isPrivate(field, row))
      result[field] = normalizeRevisionValue(row[field]);
  // Giữ khoá nhận dạng (vai, bước) để changelog đọc được "dòng nào".
  for (const key of ['role', 'phase', 'taskKey', 'itemName'])
    if (key in row) result[key] = normalizeRevisionValue(row[key]);
  return result;
}

/**
 * So hai ảnh chụp của một entity và trả các revision cần ghi.
 *
 * - Dòng mới: một revision `*` với `newValue` là các field CÔNG KHAI của dòng.
 * - Dòng mất: một revision `*` với `oldValue` tương tự.
 * - Dòng đổi: một revision cho mỗi field theo dõi có giá trị khác.
 */
export function diffCharityRevisions(
  entity: CharityRevisionEntity,
  before: readonly ICharityRevisionRow[],
  after: readonly ICharityRevisionRow[],
): ICharityRevisionDraft[] {
  const policy = CharityRevisionPolicies[entity];
  const key = (row: ICharityRevisionRow) => row.id ?? '';
  const beforeById = new Map(before.map((row) => [key(row), row]));
  const afterById = new Map(after.map((row) => [key(row), row]));
  const drafts: ICharityRevisionDraft[] = [];

  for (const row of after) {
    const previous = beforeById.get(key(row));
    if (!previous) {
      drafts.push({
        entity,
        entityId: row.id,
        field: CharityRevisionRowField,
        oldValue: null,
        newValue: publicValues(entity, row.values),
        isPublic: true,
        isImportant: policy.isImportant(CharityRevisionRowField, row.values),
      });
      continue;
    }
    for (const field of policy.fields) {
      if (same(previous.values[field], row.values[field])) continue;
      // Riêng tư nếu riêng tư ở MỘT trong hai phía: dòng đổi vai từ BENEFICIARY sang
      // ORGANIZER không được làm lộ địa chỉ cũ của bên thụ hưởng.
      const isPrivate =
        policy.isPrivate(field, previous.values) ||
        policy.isPrivate(field, row.values);
      drafts.push({
        entity,
        entityId: row.id,
        field,
        oldValue: normalizeRevisionValue(previous.values[field]),
        newValue: normalizeRevisionValue(row.values[field]),
        isPublic: !isPrivate,
        isImportant:
          policy.isImportant(field, previous.values) ||
          policy.isImportant(field, row.values),
      });
    }
  }

  for (const row of before)
    if (!afterById.has(key(row)))
      drafts.push({
        entity,
        entityId: row.id,
        field: CharityRevisionRowField,
        oldValue: publicValues(entity, row.values),
        newValue: null,
        isPublic: true,
        isImportant: policy.isImportant(CharityRevisionRowField, row.values),
      });

  return drafts;
}

// ── Checklist tab B (§3.4) ──────────────────────────────────────────────────

export const CharityTaskKeys = [
  'LICENSING',
  'PROMOTION',
  'INTAKE',
  'MONITORING',
  'CLOSE_INTAKE',
  'PACKING',
  'PRE_EVENT_NOTICE',
] as const;
export type CharityTaskKey = (typeof CharityTaskKeys)[number];

export const CharityTaskLabels: Readonly<Record<CharityTaskKey, string>> = {
  LICENSING: 'Cấp phép, liên hệ',
  PROMOTION: 'Truyền thông/kêu gọi',
  INTAKE: 'Tiếp nhận/giải đáp',
  MONITORING: 'Theo dõi/hiệu chỉnh',
  CLOSE_INTAKE: 'Kết thúc tiếp nhận',
  PACKING: 'Thống kê/đóng gói',
  PRE_EVENT_NOTICE: 'Thông báo/tiền trạm',
};

export const CharityTaskStatuses = [
  'TODO',
  'IN_PROGRESS',
  'DONE',
  'SKIPPED',
] as const;
export type CharityTaskStatus = (typeof CharityTaskStatuses)[number];

export const CharityTaskUpdateModes = ['ONLINE', 'ON_SITE'] as const;
export type CharityTaskUpdateMode = (typeof CharityTaskUpdateModes)[number];

/** Nhắc trước khi trao (§3.4): 48 giờ. */
export const CharityPreEventNoticeHours = 48;

/**
 * Mốc gợi ý cho từng việc khi checklist được tạo: kết thúc tiếp nhận = hạn nhận sớm nhất
 * của hiện vật (không có thì hết hạn dự án); tiền trạm = 48 giờ trước bước trao.
 */
export function defaultTaskSchedule(input: {
  readonly endTime: Date;
  readonly earliestIntakeDeadline: Date | null;
  readonly distributionStartsAt: Date | null;
}): Partial<Record<CharityTaskKey, Date>> {
  const schedule: Partial<Record<CharityTaskKey, Date>> = {
    CLOSE_INTAKE: input.earliestIntakeDeadline ?? input.endTime,
  };
  if (input.distributionStartsAt)
    schedule.PRE_EVENT_NOTICE = new Date(
      input.distributionStartsAt.getTime() -
        CharityPreEventNoticeHours * 3_600_000,
    );
  return schedule;
}

// ── Thông báo theo dự án (§3.10) ────────────────────────────────────────────

export const CharityAnnouncementKinds = [
  /** Chuyển sang Sự kiện trao hoặc Tổng kết. */
  'STAGE_CHANGED',
  /** Kế hoạch có thay đổi quan trọng (§3.3). */
  'PLAN_CHANGED',
  /** Còn ≤ 48 giờ tới bước trao. */
  'PRE_EVENT',
  /** Tổng kết được công khai (đợt 4). */
  'SUMMARY_PUBLISHED',
] as const;
export type CharityAnnouncementKind = (typeof CharityAnnouncementKinds)[number];

// ── Hiển thị công khai ──────────────────────────────────────────────────────

/**
 * Dự án hiện ra ngoài khi đã duyệt, chưa xoá, và đang chạy HOẶC đã đóng bình thường.
 *
 * Đóng (`POST :id/close`) và đình chỉ đều đặt `is_active = false`; khác nhau ở `end_time`:
 * đóng kéo `end_time` về lúc đóng, đình chỉ để nguyên tương lai. Dự án đã đóng vẫn phải
 * xem được — tổng kết (tab D) chính là lúc đó.
 */
export function isPubliclyVisibleProject(
  input: {
    readonly approvalStatus: string;
    readonly isActive: boolean;
    readonly endTime: Date;
  },
  now: Date,
): boolean {
  if (input.approvalStatus !== 'APPROVED') return false;
  return input.isActive || input.endTime.getTime() <= now.getTime();
}

/** Bị đình chỉ: `is_active = false` mà hạn vẫn còn — không nhận thao tác mới. */
export function isSuspendedProject(
  input: { readonly isActive: boolean; readonly endTime: Date },
  now: Date,
): boolean {
  return !input.isActive && input.endTime.getTime() > now.getTime();
}

// ── Bản in và chia sẻ (§3.13) ───────────────────────────────────────────────

/**
 * Deep link công khai của dự án trên web landing: `/c/{slug}` (cùng họ `/p/{mã}` của bài,
 * `/u/{username}` của hồ sơ), thêm `?section=` khi chia sẻ một mục. Đường tương đối luôn có;
 * URL tuyệt đối chỉ khi `WEB_PUBLIC_BASE_URL` đã cấu hình — như `postShareLinkOf`.
 */
export function charityShareLink(
  webPublicBaseUrl: string,
  slug: string,
  sectionKey: string | null,
): { sharePath: string; shareUrl: string | null } {
  const sharePath =
    `/c/${encodeURIComponent(slug)}` +
    (sectionKey ? `?section=${sectionKey}` : '');
  const base = webPublicBaseUrl.replace(/\/+$/, '');
  return { sharePath, shareUrl: base ? `${base}${sharePath}` : null };
}
