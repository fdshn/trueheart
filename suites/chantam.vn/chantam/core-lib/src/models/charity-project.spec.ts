import {
  CharityPhaseKeys,
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
  const gated = { rehearsalReady: true, distributionSettled: true };

  it('PLAN và SUMMARY không tự đổi theo thời gian', () => {
    for (const stored of ['PLAN', 'SUMMARY'] as const)
      expect(
        effectiveOperationStage({
          stored,
          distribution,
          endTime,
          now: at('2027-06-01T00:00:00Z'),
          ...gated,
        }),
      ).toBe(stored);
  });

  it('EXECUTION → EVENT khi tới giờ trao và tổng duyệt READY', () => {
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution,
        endTime,
        now: at('2026-11-30T23:59:59Z'),
        ...gated,
      }),
    ).toBe('EXECUTION');
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution,
        endTime,
        now: at('2026-12-01T00:00:00Z'),
        ...gated,
      }),
    ).toBe('EVENT');
  });

  it('EXECUTION quá endTime mà chưa READY vẫn ở EXECUTION', () => {
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution,
        endTime,
        now: at('2027-01-15T00:00:00Z'),
        rehearsalReady: false,
        distributionSettled: true,
      }),
    ).toBe('EXECUTION');
  });

  it('EXECUTION tới giờ trao + READY + đã qua endsAt + chưa đủ bằng chứng → EVENT (không nhảy SUMMARY)', () => {
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution,
        endTime,
        now: at('2026-12-05T00:00:00Z'),
        rehearsalReady: true,
        distributionSettled: false,
      }),
    ).toBe('EVENT');
  });

  it('EXECUTION không bao giờ nhảy thẳng SUMMARY', () => {
    expect(
      effectiveOperationStage({
        stored: 'EXECUTION',
        distribution: null,
        endTime,
        now: at('2027-06-01T00:00:00Z'),
        ...gated,
      }),
    ).toBe('EXECUTION');
  });

  it('EVENT qua endsAt + settled → SUMMARY', () => {
    expect(
      effectiveOperationStage({
        stored: 'EVENT',
        distribution,
        endTime,
        now: at('2026-12-02T00:00:00Z'),
        ...gated,
      }),
    ).toBe('SUMMARY');
  });

  it('EVENT qua endsAt + chưa settled → EVENT', () => {
    expect(
      effectiveOperationStage({
        stored: 'EVENT',
        distribution,
        endTime,
        now: at('2026-12-02T00:00:00Z'),
        rehearsalReady: true,
        distributionSettled: false,
      }),
    ).toBe('EVENT');
  });
});

describe('phaseScheduleGaps', () => {
  const phase = (
    key: (typeof CharityPhaseKeys)[number],
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

  it('REHEARSAL đứng thứ 3 và không được chồng lên DISTRIBUTION', () => {
    expect(CharityPhaseKeys.indexOf('REHEARSAL')).toBe(2);
    expect(
      phaseScheduleGaps([
        phase('REHEARSAL', '2026-11-28T00:00:00Z', '2026-12-01T12:00:00Z'),
        phase('DISTRIBUTION', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'),
      ]),
    ).toHaveLength(1);
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
