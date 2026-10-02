/**
 * Chế tài gắn với kết luận báo xấu (F49, UC-ADM-02, mục mở L4).
 *
 * ## Vấn đề L4 nêu
 *
 * *"Admin xác minh một báo xấu rồi… phải tự đi tìm tài khoản đó mà đình chỉ tay, bằng một
 * đường khác."* Ba chế tài UC-ADM-02 liệt kê đều đã có endpoint riêng — `PATCH
 * /admin/users/:id/status`, `PATCH /admin/posts/:id/moderate`, `POST /admin/points/adjust`
 * — nhưng không gì nối chúng với kết luận.
 *
 * Hậu quả không chỉ là bất tiện. Hai lượt bấm rời nhau nghĩa là hai bản ghi audit rời
 * nhau, và sáu tháng sau không ai trả lời được *"người này bị khoá vì báo xấu nào"*. Kết
 * luận và chế tài là MỘT quyết định; tách chúng ra là làm mất mối liên hệ đó.
 *
 * ## Vì sao chỉ ba giá trị
 *
 * `HIDE_CONTENT` **không có ở đây**, dù UC-ADM-02 liệt kê "Gỡ/Ẩn Bài Viết". Lý do: đường ẩn
 * bài đã có ở `PATCH /admin/posts/:id/moderate` với bộ trạng thái riêng và luật riêng
 * (`REMOVED` khác `HIDDEN` khác `PENDING_REVIEW`), và gói nó vào một enum chế tài là dựng
 * một bản thứ hai của cùng một luật. Nối bài viết là việc của một lượt sau, khi đã quyết
 * được mức ẩn nào ứng với mức báo xấu nào — và đó là câu của Bên A, không phải của tôi.
 */
export const ReportEnforcementActions = [
  /** Không chế tài. Đây là hành vi của đường cũ, và là mặc định. */
  'NONE',
  /** Treo có thời hạn — `UserStatuses.SUSPENDED`, đòi `suspendDays`. */
  'SUSPEND_USER',
  /** Khoá vĩnh viễn — `UserStatuses.BANNED`. */
  'BAN_USER',
] as const;

export type ReportEnforcementAction = (typeof ReportEnforcementActions)[number];

/**
 * Trần số ngày treo.
 *
 * Treo 10 năm là khoá vĩnh viễn viết bằng một cách khác, và nó tệ hơn `BAN_USER` ở một
 * điểm: bản ghi nói "tạm", nên không ai đi soát lại. Muốn vĩnh viễn thì khai vĩnh viễn.
 */
export const MaxReportSuspendDays = 365;

export interface IReportEnforcement {
  readonly action: ReportEnforcementAction;
  /** Chỉ có nghĩa với `SUSPEND_USER`. */
  readonly suspendDays: number | null;
}

export const NoReportEnforcement: IReportEnforcement = {
  action: 'NONE',
  suspendDays: null,
};

export function normalizeReportEnforcement(raw: unknown): IReportEnforcement {
  if (typeof raw !== 'object' || raw === null) return NoReportEnforcement;
  const source = raw as Record<string, unknown>;

  const action = source.action;
  if (!ReportEnforcementActions.includes(action as ReportEnforcementAction))
    return NoReportEnforcement;
  if (action === 'NONE') return NoReportEnforcement;

  const parsed = Number(source.suspendDays);
  const suspendDays =
    action === 'SUSPEND_USER' && Number.isFinite(parsed)
      ? Math.min(MaxReportSuspendDays, Math.max(1, Math.trunc(parsed)))
      : null;

  return { action: action as ReportEnforcementAction, suspendDays };
}

/**
 * Những chỗ khiến chế tài KHÔNG áp được.
 *
 * `upheld` là tham số quan trọng nhất: chế tài chỉ hợp lệ khi báo xấu được XÁC MINH. Bác
 * một báo xấu rồi khoá người bị báo là ghi vào sổ hai câu trái nhau — "không vi phạm" và
 * "đã khoá vì vi phạm" — và câu sau là câu người bị khoá đọc được.
 */
export function reportEnforcementGaps(input: {
  readonly enforcement: IReportEnforcement;
  readonly upheld: boolean;
  /** `null` khi không tìm được chủ của nội dung bị báo (đã xoá, hoặc đích lạ). */
  readonly targetUserId: string | null;
  readonly actorUserId: string;
}): string[] {
  if (input.enforcement.action === 'NONE') return [];

  const gaps: string[] = [];

  if (!input.upheld)
    gaps.push(
      'chỉ áp chế tài khi kết luận là RESOLVED — bác báo xấu rồi khoá người bị ' +
        'báo là ghi vào sổ hai câu trái nhau',
    );

  if (input.targetUserId === null)
    gaps.push(
      'không xác định được tài khoản của đích bị báo — nội dung có thể đã bị xoá',
    );
  else if (input.targetUserId === input.actorUserId)
    // Tự khoá mình là tự nhốt ra ngoài, và nếu đó là admin cuối cùng thì không còn ai mở
    // lại được. `ChangeAdminUserStatusUseCase` cũng chặn, nhưng chặn ở đây cho ra một
    // thông báo nói đúng việc thay vì một lỗi chung.
    gaps.push('không thể tự áp chế tài lên chính mình');

  if (
    input.enforcement.action === 'SUSPEND_USER' &&
    (input.enforcement.suspendDays ?? 0) < 1
  )
    gaps.push('suspendDays phải từ 1 ngày trở lên khi treo tài khoản');

  return gaps;
}

/** Mốc hết treo, tính từ `now`. Trả `null` cho mọi chế tài không phải treo. */
export function resolveSuspendedUntil(
  enforcement: IReportEnforcement,
  now: Date,
): Date | null {
  if (enforcement.action !== 'SUSPEND_USER') return null;
  if (enforcement.suspendDays === null) return null;

  return new Date(
    now.getTime() + enforcement.suspendDays * 24 * 60 * 60 * 1_000,
  );
}
