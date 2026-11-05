import {
  charityPostMediaTypeOf,
  charityPostRole,
  charityRealtimeRoom,
  normalizeCharityPostQuota,
  vietnamDayStart,
} from './charity-event';

describe('vietnamDayStart', () => {
  it('23:30 giờ VN (16:30 UTC) vẫn là ngày đó; 00:30 giờ VN sang ngày mới', () => {
    expect(
      vietnamDayStart(new Date('2026-11-05T16:30:00Z')).toISOString(),
    ).toBe('2026-11-04T17:00:00.000Z');
    expect(
      vietnamDayStart(new Date('2026-11-05T17:30:00Z')).toISOString(),
    ).toBe('2026-11-05T17:00:00.000Z');
  });
});

describe('normalizeCharityPostQuota', () => {
  it.each([
    [5, 5],
    ['7', 7],
    [0, 0],
    [500, 100],
    [-3, 0],
    ['abc', 5],
    [null, 5],
    [2.5, 5],
  ])('%p → %p', (input, expected) => {
    expect(normalizeCharityPostQuota(input)).toBe(expected);
  });
});

describe('charityPostMediaTypeOf', () => {
  it('ảnh / video / loại khác', () => {
    expect(charityPostMediaTypeOf('image/webp')).toBe('IMAGE');
    expect(charityPostMediaTypeOf('video/mp4')).toBe('VIDEO');
    expect(charityPostMediaTypeOf('application/pdf')).toBeNull();
  });
});

describe('charityPostRole', () => {
  const base = {
    approved: true,
    suspended: false,
    isOrganizer: false,
    isCoordinator: false,
    isAttendedParticipant: false,
    stage: 'EXECUTION' as const,
  };

  it('người tổ chức đăng mọi giai đoạn sau duyệt; chưa duyệt / đình chỉ thì không', () => {
    expect(charityPostRole({ ...base, isOrganizer: true })).toBe('ORGANIZER');
    expect(
      charityPostRole({ ...base, isOrganizer: true, approved: false }),
    ).toBeNull();
    expect(
      charityPostRole({ ...base, isOrganizer: true, suspended: true }),
    ).toBeNull();
  });

  it('cộng tác viên chỉ đăng được trong Sự kiện trao', () => {
    expect(
      charityPostRole({ ...base, isAttendedParticipant: true }),
    ).toBeNull();
    expect(
      charityPostRole({ ...base, isAttendedParticipant: true, stage: 'EVENT' }),
    ).toBe('PARTICIPANT');
    expect(
      charityPostRole({
        ...base,
        isAttendedParticipant: true,
        stage: 'SUMMARY',
      }),
    ).toBeNull();
  });

  it('người thường không có quyền', () => {
    expect(charityPostRole({ ...base, stage: 'EVENT' })).toBeNull();
  });

  it('coordinator đăng được', () => {
    expect(charityPostRole({ ...base, isCoordinator: true })).toBe(
      'COORDINATOR',
    );
  });
});

describe('charityRealtimeRoom', () => {
  it('hai phòng tách bạch', () => {
    expect(charityRealtimeRoom('c1', 'public')).toBe('charity:c1:public');
    expect(charityRealtimeRoom('c1', 'workspace')).toBe('charity:c1:workspace');
  });
});
