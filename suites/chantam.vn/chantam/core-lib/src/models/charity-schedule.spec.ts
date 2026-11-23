import {
  charityScheduleComplete,
  charityScheduleGaps,
  ICharitySchedule,
  isIntakeClosed,
} from './charity-schedule';

const at = (day: number) => new Date(Date.UTC(2026, 11, day));
const schedule = (
  overrides: Partial<ICharitySchedule> = {},
): ICharitySchedule => ({
  intakeStartsAt: at(1),
  intakeEndsAt: at(10),
  distributionStartsAt: at(12),
  distributionEndsAt: at(13),
  endTime: at(20),
  ...overrides,
});

describe('charity-schedule', () => {
  it('lịch hợp lệ → không có lỗi', () => {
    expect(charityScheduleGaps(schedule())).toEqual([]);
  });

  it('intakeEndsAt > distributionStartsAt → đúng một lỗi', () => {
    const gaps = charityScheduleGaps(schedule({ intakeEndsAt: at(14) }));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('intakeEndsAt');
  });

  it('intakeEndsAt = distributionStartsAt được phép', () => {
    expect(charityScheduleGaps(schedule({ intakeEndsAt: at(12) }))).toEqual([]);
  });

  it('distributionEndsAt > endTime → đúng một lỗi', () => {
    const gaps = charityScheduleGaps(schedule({ distributionEndsAt: at(21) }));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('distributionEndsAt');
  });

  it('giá trị thiếu bỏ qua các cặp dính tới nó', () => {
    expect(
      charityScheduleGaps(
        schedule({ intakeEndsAt: null, distributionStartsAt: null }),
      ),
    ).toEqual([]);
  });

  it('gửi duyệt cần đủ ba khung', () => {
    expect(
      charityScheduleComplete(
        schedule({
          intakeEndsAt: null,
          distributionStartsAt: null,
          distributionEndsAt: null,
        }),
      ),
    ).toEqual([
      'schedule.intakeEndsAt',
      'schedule.distributionStartsAt',
      'schedule.distributionEndsAt',
    ]);
    expect(charityScheduleComplete(schedule())).toEqual([]);
  });
});

describe('isIntakeClosed', () => {
  const now = new Date('2027-01-10T00:00:00Z');
  it('chưa lập intakeEndsAt (null) → chưa đóng', () => {
    expect(isIntakeClosed({ intakeEndsAt: null }, now)).toBe(false);
  });
  it('trước intakeEndsAt → chưa đóng', () => {
    expect(
      isIntakeClosed({ intakeEndsAt: new Date('2027-01-10T00:01:00Z') }, now),
    ).toBe(false);
  });
  it('đúng hoặc sau intakeEndsAt → đã đóng', () => {
    expect(isIntakeClosed({ intakeEndsAt: now }, now)).toBe(true);
    expect(
      isIntakeClosed({ intakeEndsAt: new Date('2027-01-09T23:59:00Z') }, now),
    ).toBe(true);
  });
});
