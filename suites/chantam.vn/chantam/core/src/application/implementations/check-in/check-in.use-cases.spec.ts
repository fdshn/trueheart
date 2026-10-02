import { CheckInRepairDateInvalidException } from '@/domain/exceptions';
import { ICheckInRepository } from '@/domain/ports/repository';
import { DefaultCheckInPolicy } from '@chantam.vn/chantam.core-lib/models';
import {
  GetCheckInStateUseCase,
  RecordCheckInUseCase,
  RepairCheckInUseCase,
} from './check-in.use-cases';

const UserId = '11111111-1111-4111-8111-111111111111';

const enabledPolicy = {
  version: 3,
  policy: {
    enabled: true,
    dailyPoints: 2,
    milestones: [
      { streakDays: 3, bonusPoints: 10 },
      { streakDays: 7, bonusPoints: 25 },
    ],
    transactionsPerRepair: 4,
    repairWindowDays: 7,
  },
  effectiveAt: new Date(),
  reason: 'x',
  createdBy: null,
  createdAt: new Date(),
};

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getActivePolicy: jest.fn().mockResolvedValue(enabledPolicy),
    readState: jest.fn().mockResolvedValue({
      run: null,
      todayEntry: null,
      longestStreak: 0,
      repairCredits: 0,
      cohort: null,
    }),
    listHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    record: jest.fn().mockResolvedValue({
      applied: true,
      kind: 'NORMAL',
      date: '2026-10-02',
      streakDay: 1,
      currentStreak: 1,
      recoverableStreak: 1,
      pendingGapDates: [],
      runStatus: 'ACTIVE',
      dailyPointsAwarded: 2,
      milestonePointsAwarded: 0,
      milestones: [],
      repairCreditsRemaining: 0,
      policyVersion: 3,
    }),
    ...overrides,
  } as unknown as jest.Mocked<ICheckInRepository>;
}

describe('GetCheckInStateUseCase', () => {
  it('chưa publish policy thì vẫn ĐỌC được, chỉ là enabled=false', async () => {
    // Lịch sử là dữ liệu của người dùng. Khoá đường đọc khi Admin tắt tính năng
    // sẽ làm họ tưởng mất hết.
    const repo = makeRepo({
      getActivePolicy: jest.fn().mockResolvedValue(null),
    });

    const result = await new GetCheckInStateUseCase(repo).handle({
      userId: UserId,
    });

    expect(result.enabled).toBe(false);
    expect(result.policyVersion).toBeNull();
    expect(result.dailyPoints).toBe(DefaultCheckInPolicy.dailyPoints);
    expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('repairableDates lọc theo cửa sổ VÀ theo số lượt còn lại', async () => {
    // App hiện nút bù theo danh sách này. Trả cả ngày không bù được là mời người
    // dùng bấm vào một thứ chắc chắn lỗi.
    const repo = makeRepo({
      readState: jest.fn().mockResolvedValue({
        run: {
          id: '1',
          startDate: '2026-10-01',
          latestCoveredDate: '2026-10-05',
          status: 'AT_RISK',
          coveredDates: ['2026-10-01', '2026-10-05'],
          awardedMilestoneDays: [],
        },
        todayEntry: null,
        longestStreak: 3,
        repairCredits: 0,
        cohort: null,
      }),
    });

    const noCredits = await new GetCheckInStateUseCase(repo).handle({
      userId: UserId,
    });
    expect(noCredits.pendingGapDates.length).toBeGreaterThan(0);
    expect(noCredits.repairableDates).toEqual([]);
  });

  it('longestStreak không bao giờ nhỏ hơn chuỗi đang giữ', async () => {
    // Chuỗi dài nhất đọc từ các run đã lưu; run ĐANG chạy có thể vừa vượt nó mà
    // cột kia chưa kịp phản ánh.
    const repo = makeRepo({
      readState: jest.fn().mockResolvedValue({
        run: {
          id: '1',
          startDate: '2026-10-01',
          latestCoveredDate: '2026-10-04',
          status: 'ACTIVE',
          coveredDates: [
            '2026-10-01',
            '2026-10-02',
            '2026-10-03',
            '2026-10-04',
          ],
          awardedMilestoneDays: [3],
        },
        todayEntry: null,
        longestStreak: 2,
        repairCredits: 0,
        cohort: null,
      }),
    });

    const result = await new GetCheckInStateUseCase(repo).handle({
      userId: UserId,
    });

    expect(result.currentStreak).toBe(4);
    expect(result.longestStreak).toBe(4);
    expect(result.nextMilestone).toEqual({ streakDays: 7, bonusPoints: 25 });
  });
});

describe('RecordCheckInUseCase', () => {
  it('ngày lấy từ server, KHÔNG nhận từ client', async () => {
    // Nhận ngày từ client là mời người ta điểm danh cho ngày mai, hoặc lấp ngược
    // quá khứ miễn phí mà không tiêu lượt bù nào.
    const repo = makeRepo();

    await new RecordCheckInUseCase(repo).handle({ userId: UserId });

    const call = (repo.record as jest.Mock).mock.calls[0][0];
    expect(call.kind).toBe('NORMAL');
    expect(call.date).toBe(call.today);
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('RepairCheckInUseCase', () => {
  it('chuỗi ngày rác bị chặn TRƯỚC khi mở transaction', async () => {
    // Một chuỗi rác xuống tới SQL sẽ ra lỗi cú pháp Postgres, tức 500 cho một
    // lỗi của client.
    const repo = makeRepo();

    for (const date of ['hôm qua', '2026-13-45', '', '2026/10/01']) {
      await expect(
        new RepairCheckInUseCase(repo).handle({ userId: UserId, date }),
      ).rejects.toBeInstanceOf(CheckInRepairDateInvalidException);
    }
    expect(repo.record).not.toHaveBeenCalled();
  });

  it('ngày hợp lệ đi xuống repository với kind REPAIR', async () => {
    const repo = makeRepo();

    await new RepairCheckInUseCase(repo).handle({
      userId: UserId,
      date: '2026-09-30',
    });

    expect(repo.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'REPAIR', date: '2026-09-30' }),
    );
  });
});
