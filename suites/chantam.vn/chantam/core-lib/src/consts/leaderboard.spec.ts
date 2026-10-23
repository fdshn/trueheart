import {
  addMonths,
  LeaderboardBoards,
  LeaderboardConfigDefaults,
  LeaderboardConfigKeys,
  monthBoundsUtc,
  parseLeaderboardMonth,
  previousMonth,
  toLeaderboardMonthLabel,
  vietnamMonthOf,
} from './leaderboard';

describe('tháng của bảng thành tích', () => {
  it('nhận đúng dạng YYYY-MM và trả ngày 1', () => {
    expect(parseLeaderboardMonth('2026-10')).toBe('2026-10-01');
    expect(parseLeaderboardMonth('2027-01')).toBe('2027-01-01');
  });

  it.each(['2026-13', '2026-00', '2026-1', 'abc', '', '2026-10-01'])(
    'từ chối %p',
    (value) => {
      expect(parseLeaderboardMonth(value)).toBeNull();
    },
  );

  it('cắt tháng theo giờ Việt Nam, không theo UTC', () => {
    // 00:30 ngày 1/11 giờ VN vẫn là 17:30 ngày 31/10 theo UTC.
    expect(vietnamMonthOf(new Date('2026-10-31T17:30:00Z'))).toBe('2026-11-01');
    expect(vietnamMonthOf(new Date('2026-10-31T16:30:00Z'))).toBe('2026-10-01');
  });

  it('lùi và tiến tháng qua ranh giới năm', () => {
    expect(previousMonth('2026-01-01')).toBe('2025-12-01');
    expect(addMonths('2026-10-01', 3)).toBe('2027-01-01');
    expect(addMonths('2026-10-01', 4)).toBe('2027-02-01');
  });

  it('khoảng thời gian UTC của một tháng giờ Việt Nam', () => {
    expect(monthBoundsUtc('2026-10-01')).toEqual({
      start: new Date('2026-09-30T17:00:00Z'),
      end: new Date('2026-10-31T17:00:00Z'),
    });
  });

  it('nhãn trả ra API là YYYY-MM', () => {
    expect(toLeaderboardMonthLabel('2026-10-01')).toBe('2026-10');
  });
});

describe('cấu hình bảng thành tích', () => {
  it('mặc định đúng như thiết kế', () => {
    expect(LeaderboardConfigDefaults).toEqual({
      [LeaderboardConfigKeys.ENABLED]: 1,
      [LeaderboardConfigKeys.MIN_GIVERS]: 1,
      [LeaderboardConfigKeys.MIN_CHARITY]: 1,
      [LeaderboardConfigKeys.MIN_CONSISTENCY_DAYS]: 10,
      [LeaderboardConfigKeys.BADGE_RANKS]: 3,
      [LeaderboardConfigKeys.BADGE_MONTHS]: 3,
    });
    expect(Object.values(LeaderboardBoards)).toEqual([
      'GIVERS',
      'CHARITY',
      'CONSISTENCY',
    ]);
  });
});
