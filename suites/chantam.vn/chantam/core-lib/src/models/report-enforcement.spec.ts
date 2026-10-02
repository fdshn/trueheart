import {
  MaxReportSuspendDays,
  NoReportEnforcement,
  ReportEnforcementActions,
  normalizeReportEnforcement,
  reportEnforcementGaps,
  resolveSuspendedUntil,
} from './report-enforcement';

const Actor = '10000000-0000-4000-8000-000000000001';
const Target = '20000000-0000-4000-8000-000000000002';

describe('normalizeReportEnforcement', () => {
  it('thiếu hoặc hỏng thì không chế tài', () => {
    for (const raw of [null, undefined, 'BAN', 7, []])
      expect(normalizeReportEnforcement(raw)).toEqual(NoReportEnforcement);
  });

  it('action lạ lùi về NONE, không lùi về BAN', () => {
    // Hướng lùi quan trọng: dữ liệu đọc không ra không được biến thành một lượt khoá
    // tài khoản.
    expect(normalizeReportEnforcement({ action: 'DELETE_EVERYTHING' })).toEqual(
      NoReportEnforcement,
    );
  });

  it('kẹp suspendDays vào [1, 365]', () => {
    expect(
      normalizeReportEnforcement({ action: 'SUSPEND_USER', suspendDays: 0 })
        .suspendDays,
    ).toBe(1);
    expect(
      normalizeReportEnforcement({ action: 'SUSPEND_USER', suspendDays: 9_999 })
        .suspendDays,
    ).toBe(MaxReportSuspendDays);
    expect(
      normalizeReportEnforcement({ action: 'SUSPEND_USER', suspendDays: 7 })
        .suspendDays,
    ).toBe(7);
  });

  it('suspendDays không phải số thì về null, và gaps sẽ chặn', () => {
    const enforcement = normalizeReportEnforcement({
      action: 'SUSPEND_USER',
      suspendDays: 'bay ngay',
    });
    expect(enforcement.suspendDays).toBeNull();
    expect(
      reportEnforcementGaps({
        enforcement,
        upheld: true,
        targetUserId: Target,
        actorUserId: Actor,
      }),
    ).toContain('suspendDays phải từ 1 ngày trở lên khi treo tài khoản');
  });

  it('BAN_USER bỏ qua suspendDays', () => {
    expect(
      normalizeReportEnforcement({ action: 'BAN_USER', suspendDays: 30 })
        .suspendDays,
    ).toBeNull();
  });

  it('ba giá trị khai báo đều nhận được', () => {
    for (const action of ReportEnforcementActions)
      expect(
        normalizeReportEnforcement({ action, suspendDays: 5 }).action,
      ).toBe(action);
  });
});

describe('reportEnforcementGaps', () => {
  const ok = {
    enforcement: { action: 'BAN_USER' as const, suspendDays: null },
    upheld: true,
    targetUserId: Target,
    actorUserId: Actor,
  };

  it('NONE thì không bao giờ có gap, kể cả khi báo xấu bị bác', () => {
    expect(
      reportEnforcementGaps({
        ...ok,
        enforcement: NoReportEnforcement,
        upheld: false,
        targetUserId: null,
      }),
    ).toEqual([]);
  });

  it('chặn chế tài khi báo xấu bị BÁC', () => {
    // Bác rồi khoá là ghi vào sổ hai câu trái nhau, và câu sau là câu người bị khoá
    // đọc được.
    const gaps = reportEnforcementGaps({ ...ok, upheld: false });
    expect(
      gaps.some((g) => g.includes('chỉ áp chế tài khi kết luận là RESOLVED')),
    ).toBe(true);
  });

  it('chặn khi không tìm được chủ của đích bị báo', () => {
    const gaps = reportEnforcementGaps({ ...ok, targetUserId: null });
    expect(gaps.some((g) => g.includes('không xác định được tài khoản'))).toBe(
      true,
    );
  });

  it('chặn tự áp chế tài lên chính mình', () => {
    const gaps = reportEnforcementGaps({ ...ok, targetUserId: Actor });
    expect(gaps).toContain('không thể tự áp chế tài lên chính mình');
  });

  it('gộp được nhiều gap cùng lúc', () => {
    const gaps = reportEnforcementGaps({
      enforcement: { action: 'SUSPEND_USER', suspendDays: null },
      upheld: false,
      targetUserId: null,
      actorUserId: Actor,
    });
    expect(gaps).toHaveLength(3);
  });

  it('bộ hợp lệ thì không còn gap', () => {
    expect(reportEnforcementGaps(ok)).toEqual([]);
    expect(
      reportEnforcementGaps({
        ...ok,
        enforcement: { action: 'SUSPEND_USER', suspendDays: 7 },
      }),
    ).toEqual([]);
  });
});

describe('resolveSuspendedUntil', () => {
  const now = new Date('2026-10-02T00:00:00Z');

  it('tính đúng mốc hết treo', () => {
    const until = resolveSuspendedUntil(
      { action: 'SUSPEND_USER', suspendDays: 7 },
      now,
    );
    expect(until?.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('BAN_USER và NONE đều trả null', () => {
    // `UserStatuses.BANNED` không tự gỡ, nên một mốc hết hạn ở đó là một lời hứa sai.
    expect(
      resolveSuspendedUntil({ action: 'BAN_USER', suspendDays: 30 }, now),
    ).toBeNull();
    expect(resolveSuspendedUntil(NoReportEnforcement, now)).toBeNull();
  });

  it('SUSPEND_USER thiếu số ngày trả null thay vì mốc bằng chính now', () => {
    // Trả `now` nghĩa là treo 0 giây — tức không treo gì, nhưng bản ghi nói là có treo.
    expect(
      resolveSuspendedUntil({ action: 'SUSPEND_USER', suspendDays: null }, now),
    ).toBeNull();
  });
});
