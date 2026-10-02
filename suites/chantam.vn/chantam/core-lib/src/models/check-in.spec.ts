import {
  addBusinessDays,
  businessDateOf,
  businessDaysBetween,
  checkInPolicyGaps,
  DefaultCheckInPolicy,
  isBusinessDate,
  isRepairableDate,
  milestonesNewlyReached,
  nextCheckInMilestone,
  normalizeCheckInPolicy,
  summarizeCheckInRun,
} from './check-in';

describe('businessDateOf — nửa đêm giờ Việt Nam', () => {
  it('17:00 UTC là 00:00 hôm sau ở Việt Nam, nên đã sang ngày mới', () => {
    // Đây là ca mà một phép tính theo UTC sẽ sai: ở UTC vẫn là 01/10, còn người
    // dùng ở Việt Nam đã sang 02/10 và đáng được điểm danh ngày mới.
    expect(businessDateOf(new Date('2026-10-01T17:00:00.000Z'))).toBe(
      '2026-10-02',
    );
  });

  it('16:59:59 UTC vẫn là ngày hôm đó', () => {
    expect(businessDateOf(new Date('2026-10-01T16:59:59.999Z'))).toBe(
      '2026-10-01',
    );
  });

  it('qua mốc cuối năm vẫn đúng', () => {
    expect(businessDateOf(new Date('2026-12-31T17:00:00.000Z'))).toBe(
      '2027-01-01',
    );
  });

  it('giữa trưa Việt Nam không bị lệch', () => {
    expect(businessDateOf(new Date('2026-10-01T05:00:00.000Z'))).toBe(
      '2026-10-01',
    );
  });
});

describe('cộng và trừ ngày nghiệp vụ', () => {
  it('qua mốc tháng và năm', () => {
    expect(addBusinessDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addBusinessDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addBusinessDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('năm nhuận', () => {
    expect(addBusinessDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(businessDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('khoảng cách âm khi đích nằm trước', () => {
    expect(businessDaysBetween('2026-10-05', '2026-10-01')).toBe(-4);
  });
});

describe('isBusinessDate', () => {
  it('nhận ngày thật', () => {
    for (const date of ['2026-10-02', '2028-02-29', '2026-01-01'])
      expect(isBusinessDate(date)).toBe(true);
  });

  it('TỪ CHỐI chuỗi đúng dạng mà không phải ngày thật', () => {
    // Những chuỗi này khớp YYYY-MM-DD. Nếu chỉ kiểm hình dạng thì chúng xuống tới
    // `$1::date` và Postgres ném lỗi cú pháp — 500 cho một lỗi của client.
    for (const date of ['2026-13-45', '2026-02-30', '2027-02-29', '2026-00-10'])
      expect(isBusinessDate(date)).toBe(false);
  });

  it('từ chối sai hình dạng và sai kiểu', () => {
    for (const value of [
      'hôm qua',
      '2026/10/01',
      '',
      '2026-1-1',
      20261001,
      null,
    ])
      expect(isBusinessDate(value)).toBe(false);
  });
});

describe('normalizeCheckInPolicy — fail-closed', () => {
  it('dữ liệu rác trả về bản mặc định KHÔNG phát điểm', () => {
    for (const raw of [null, undefined, 'x', 42, []]) {
      expect(normalizeCheckInPolicy(raw)).toEqual(DefaultCheckInPolicy);
    }
    expect(DefaultCheckInPolicy.enabled).toBe(false);
    expect(DefaultCheckInPolicy.dailyPoints).toBe(0);
  });

  it('xếp mốc tăng dần và khử trùng, giữ mốc khai SAU', () => {
    const policy = normalizeCheckInPolicy({
      enabled: true,
      dailyPoints: 2,
      transactionsPerRepair: 4,
      repairWindowDays: 7,
      milestones: [
        { streakDays: 30, bonusPoints: 60 },
        { streakDays: 7, bonusPoints: 10 },
        { streakDays: 7, bonusPoints: 99 },
      ],
    });

    expect(policy.milestones).toEqual([
      { streakDays: 7, bonusPoints: 99 },
      { streakDays: 30, bonusPoints: 60 },
    ]);
  });

  it('bỏ mốc có số ngày không hợp lệ thay vì nhận bừa', () => {
    const policy = normalizeCheckInPolicy({
      milestones: [
        { streakDays: 0, bonusPoints: 5 },
        { streakDays: -3, bonusPoints: 5 },
        { streakDays: 'bảy', bonusPoints: 5 },
        { streakDays: 7, bonusPoints: 10 },
      ],
    });

    expect(policy.milestones).toEqual([{ streakDays: 7, bonusPoints: 10 }]);
  });

  it('enabled chỉ bật khi đúng true, không nhận chuỗi truthy', () => {
    expect(normalizeCheckInPolicy({ enabled: 'true' }).enabled).toBe(false);
    expect(normalizeCheckInPolicy({ enabled: 1 }).enabled).toBe(false);
    expect(normalizeCheckInPolicy({ enabled: true }).enabled).toBe(true);
  });

  it('kẹp số âm và số vượt trần', () => {
    const policy = normalizeCheckInPolicy({
      dailyPoints: -5,
      transactionsPerRepair: 10_000_000,
      repairWindowDays: -1,
    });

    expect(policy.dailyPoints).toBe(0);
    expect(policy.transactionsPerRepair).toBe(1_000);
    expect(policy.repairWindowDays).toBe(0);
  });
});

describe('checkInPolicyGaps', () => {
  it('bản đang TẮT thì không đòi gì — nháp để trống là bình thường', () => {
    expect(checkInPolicyGaps(DefaultCheckInPolicy)).toEqual([]);
  });

  it('bật mà thiếu số thì liệt kê ĐÚNG cái thiếu, không nói chung chung', () => {
    const gaps = checkInPolicyGaps({
      ...DefaultCheckInPolicy,
      enabled: true,
    });

    expect(gaps).toEqual([
      'dailyPoints phải lớn hơn 0',
      'transactionsPerRepair phải lớn hơn 0',
      'repairWindowDays phải lớn hơn 0',
    ]);
  });

  it('mốc thưởng 0 điểm bị chỉ ra — nó hiện trên UI như một phần thưởng', () => {
    const gaps = checkInPolicyGaps({
      enabled: true,
      dailyPoints: 2,
      transactionsPerRepair: 4,
      repairWindowDays: 7,
      milestones: [
        { streakDays: 7, bonusPoints: 10 },
        { streakDays: 14, bonusPoints: 0 },
      ],
    });

    expect(gaps).toEqual(['mốc 14 ngày có bonusPoints bằng 0']);
  });

  it('không mốc nào thì vẫn hợp lệ — chỉ có điểm ngày là một chính sách thật', () => {
    expect(
      checkInPolicyGaps({
        enabled: true,
        dailyPoints: 2,
        transactionsPerRepair: 4,
        repairWindowDays: 7,
        milestones: [],
      }),
    ).toEqual([]);
  });
});

describe('summarizeCheckInRun', () => {
  it('chuỗi liền mạch thì ba con số bằng nhau và không có lỗ', () => {
    const summary = summarizeCheckInRun({
      startDate: '2026-10-01',
      latestCoveredDate: '2026-10-05',
      coveredDates: [
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
      ],
    });

    expect(summary.currentStreak).toBe(5);
    expect(summary.recoverableStreak).toBe(5);
    expect(summary.pendingGapDates).toEqual([]);
  });

  it('một ngày thiếu CẮT currentStreak nhưng không cắt recoverableStreak', () => {
    // Đây là chỗ ba con số phải nói ba chuyện khác nhau: giữ được 2 ngày, sẽ có
    // 5 nếu bù, và đang thiếu đúng ngày 03.
    const summary = summarizeCheckInRun({
      startDate: '2026-10-01',
      latestCoveredDate: '2026-10-05',
      coveredDates: ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'],
    });

    expect(summary.currentStreak).toBe(2);
    expect(summary.recoverableStreak).toBe(5);
    expect(summary.pendingGapDates).toEqual(['2026-10-03']);
  });

  it('nhiều lỗ hổng trả về theo thứ tự CŨ TRƯỚC', () => {
    // Thứ tự này là nghiệp vụ, không phải trình bày: bù phải đi từ ngày cũ nhất
    // vì đó là ngày sắp hết hạn trước.
    const summary = summarizeCheckInRun({
      startDate: '2026-10-01',
      latestCoveredDate: '2026-10-07',
      coveredDates: ['2026-10-01', '2026-10-04', '2026-10-07'],
    });

    expect(summary.pendingGapDates).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-05',
      '2026-10-06',
    ]);
    expect(summary.currentStreak).toBe(1);
    expect(summary.recoverableStreak).toBe(7);
  });

  it('một ngày duy nhất là chuỗi dài 1, không phải 0', () => {
    const summary = summarizeCheckInRun({
      startDate: '2026-10-01',
      latestCoveredDate: '2026-10-01',
      coveredDates: ['2026-10-01'],
    });

    expect(summary.currentStreak).toBe(1);
    expect(summary.recoverableStreak).toBe(1);
  });

  it('ngày cuối CHƯA có dấu thì currentStreak bằng 0', () => {
    // Không xảy ra ở đường ghi (ngày cuối luôn là ngày vừa ghi), nhưng đường đối
    // soát dựng lại run từ entries thì có thể gặp, và trả một con số bịa ở đây sẽ
    // thành một chuỗi không ai hiểu từ đâu ra.
    const summary = summarizeCheckInRun({
      startDate: '2026-10-01',
      latestCoveredDate: '2026-10-03',
      coveredDates: ['2026-10-01', '2026-10-02'],
    });

    expect(summary.currentStreak).toBe(0);
    expect(summary.pendingGapDates).toEqual(['2026-10-03']);
  });
});

describe('milestonesNewlyReached', () => {
  const milestones = [
    { streakDays: 7, bonusPoints: 10 },
    { streakDays: 14, bonusPoints: 25 },
    { streakDays: 30, bonusPoints: 60 },
  ];

  it('đạt đúng mốc thì trả mốc đó', () => {
    expect(
      milestonesNewlyReached({
        streakLength: 7,
        milestones,
        alreadyAwarded: [],
      }),
    ).toEqual([{ streakDays: 7, bonusPoints: 10 }]);
  });

  it('mốc đã thưởng thì KHÔNG trả lại', () => {
    expect(
      milestonesNewlyReached({
        streakLength: 10,
        milestones,
        alreadyAwarded: [7],
      }),
    ).toEqual([]);
  });

  it('một lần bù nhảy qua NHIỀU mốc thì trả hết, xếp tăng dần', () => {
    // Chuỗi 6 ngày + bù một lỗ làm chiều dài nhảy lên 15: cả mốc 7 và 14 đều vừa
    // đạt trong cùng một lần ghi.
    expect(
      milestonesNewlyReached({
        streakLength: 15,
        milestones,
        alreadyAwarded: [],
      }),
    ).toEqual([
      { streakDays: 7, bonusPoints: 10 },
      { streakDays: 14, bonusPoints: 25 },
    ]);
  });

  it('chưa tới mốc nào thì rỗng', () => {
    expect(
      milestonesNewlyReached({
        streakLength: 6,
        milestones,
        alreadyAwarded: [],
      }),
    ).toEqual([]);
  });

  it('nextCheckInMilestone trả mốc CHƯA đạt gần nhất, null khi đã qua hết', () => {
    expect(nextCheckInMilestone({ streakLength: 7, milestones })).toEqual({
      streakDays: 14,
      bonusPoints: 25,
    });
    expect(nextCheckInMilestone({ streakLength: 30, milestones })).toBeNull();
  });
});

describe('isRepairableDate', () => {
  const today = '2026-10-10';

  it('HÔM NAY không bù được — hôm nay thì điểm danh thường', () => {
    expect(isRepairableDate({ date: today, today, repairWindowDays: 7 })).toBe(
      false,
    );
  });

  it('hôm qua bù được', () => {
    expect(
      isRepairableDate({ date: '2026-10-09', today, repairWindowDays: 7 }),
    ).toBe(true);
  });

  it('đúng biên cửa sổ vẫn bù được, quá một ngày thì không', () => {
    expect(
      isRepairableDate({ date: '2026-10-03', today, repairWindowDays: 7 }),
    ).toBe(true);
    expect(
      isRepairableDate({ date: '2026-10-02', today, repairWindowDays: 7 }),
    ).toBe(false);
  });

  it('ngày TƯƠNG LAI không bù được', () => {
    expect(
      isRepairableDate({ date: '2026-10-11', today, repairWindowDays: 7 }),
    ).toBe(false);
  });

  it('cửa sổ 0 ngày thì không bù được gì — policy chưa cấu hình', () => {
    expect(
      isRepairableDate({ date: '2026-10-09', today, repairWindowDays: 0 }),
    ).toBe(false);
  });
});
