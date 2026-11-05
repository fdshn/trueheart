import {
  effectiveOperationStage,
  normalizeMaxBankAccounts,
  phaseScheduleGaps,
} from './charity-project';

const at = (iso: string) => new Date(iso);
const endTime = at('2026-12-31T00:00:00Z');
const distribution = {
  startsAt: at('2026-12-01T00:00:00Z'),
  endsAt: at('2026-12-02T00:00:00Z'),
};

describe('effectiveOperationStage', () => {
  it('PLAN và SUMMARY không tự đổi theo thời gian', () => {
    for (const stored of ['PLAN', 'SUMMARY'] as const)
      expect(
        effectiveOperationStage({
          stored,
          distribution,
          endTime,
          now: at('2027-06-01T00:00:00Z'),
        }),
      ).toBe(stored);
  });

  it('EXECUTION → EVENT khi tới giờ trao', () => {
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution,
        endTime,
        now: at('2026-11-30T23:59:59Z'),
      }),
    ).toBe('EXECUTION');
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution,
        endTime,
        now: at('2026-12-01T00:00:00Z'),
      }),
    ).toBe('EVENT');
  });

  it('EXECUTION/EVENT → SUMMARY khi qua giờ kết thúc trao (job trễ vẫn đúng)', () => {
    for (const stored of ['EXECUTION', 'EVENT'] as const)
      expect(
        effectiveOperationStage({
          stored,
          distribution,
          endTime,
          now: at('2026-12-02T00:00:00Z'),
        }),
      ).toBe('SUMMARY');
  });

  it('chưa lập bước trao: không vào EVENT theo giờ, SUMMARY theo endTime', () => {
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution: null,
        endTime,
        now: at('2026-12-15T00:00:00Z'),
      }),
    ).toBe('EXECUTION');
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution: null,
        endTime,
        now: endTime,
      }),
    ).toBe('SUMMARY');
  });
});

describe('phaseScheduleGaps', () => {
  const phase = (
    key: 'PLANNING' | 'PREPARATION' | 'DISTRIBUTION' | 'REPORTING',
    from: string,
    to: string,
  ) => ({ phase: key, startsAt: at(from), endsAt: at(to) });

  it('đúng thứ tự, không chồng → hợp lệ (thiếu bước vẫn hợp lệ)', () => {
    expect(
      phaseScheduleGaps([
        phase('DISTRIBUTION', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'),
        phase('PLANNING', '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'),
      ]),
    ).toEqual([]);
  });

  it('chồng thời gian, kết thúc trước bắt đầu, khai trùng → lỗi', () => {
    expect(
      phaseScheduleGaps([
        phase('PLANNING', '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'),
        phase('PREPARATION', '2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z'),
      ]),
    ).toHaveLength(1);
    expect(
      phaseScheduleGaps([
        phase('PLANNING', '2026-11-10T00:00:00Z', '2026-11-01T00:00:00Z'),
      ]),
    ).toHaveLength(1);
    expect(
      phaseScheduleGaps([
        phase('PLANNING', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'),
        phase('PLANNING', '2026-11-03T00:00:00Z', '2026-11-04T00:00:00Z'),
      ]).some((gap) => gap.includes('hai lần')),
    ).toBe(true);
  });
});

describe('normalizeMaxBankAccounts', () => {
  it.each([
    [3, 3],
    [undefined, 2],
    [0, 2],
    [21, 2],
    [2.5, 2],
  ])('%p → %p', (value, expected) => {
    expect(normalizeMaxBankAccounts(value)).toBe(expected);
  });
});
