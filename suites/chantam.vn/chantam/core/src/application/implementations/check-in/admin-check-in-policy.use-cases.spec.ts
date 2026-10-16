import { CheckInPolicyVersionConflictException } from '@/domain/exceptions';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  GetCheckInPolicyUseCase,
  PublishCheckInPolicyUseCase,
} from './admin-check-in-policy.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function revision(version: number, dailyPoints = 2) {
  return {
    version,
    policy: {
      enabled: true,
      dailyPoints,
      milestones: [{ streakDays: 7, bonusPoints: 20 }],
      transactionsPerRepair: 3,
      repairWindowDays: 7,
    },
    effectiveAt: new Date('2026-10-01T00:00:00.000Z'),
    reason: `Bản ${version}`,
    createdBy: ActorId,
    createdAt: new Date('2026-09-30T00:00:00.000Z'),
  };
}

function dtoOf(entry: ReturnType<typeof revision>) {
  return {
    version: entry.version,
    ...entry.policy,
    effectiveAt: entry.effectiveAt,
    reason: entry.reason,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
  };
}

function makeDeps(granted: string[] = ['config.read', 'config.write']) {
  const checkIns = {
    getActivePolicy: jest.fn().mockResolvedValue(null),
    listPolicyHistory: jest.fn().mockResolvedValue([]),
    publishPolicy: jest.fn(async (params: { policy: unknown }) => ({
      ...revision(1),
      policy: params.policy,
    })),
  };
  const admin = {
    hasPermission: jest.fn(async (_id: string, code: string) =>
      granted.includes(code),
    ),
    appendAudit: jest.fn().mockResolvedValue(undefined),
  };
  return { checkIns, admin };
}

function policyInput(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    dailyPoints: 2,
    milestones: [{ streakDays: 7, bonusPoints: 20 }],
    transactionsPerRepair: 3,
    repairWindowDays: 7,
    reason: 'Bật điểm danh',
    ...overrides,
  };
}

describe(GetCheckInPolicyUseCase.name, () => {
  it('đòi config.read và không đọc gì khi thiếu quyền', async () => {
    const { checkIns, admin } = makeDeps([]);

    await expect(
      new GetCheckInPolicyUseCase(checkIns as never, admin as never).handle({
        actorUserId: ActorId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(checkIns.getActivePolicy).not.toHaveBeenCalled();
    expect(checkIns.listPolicyHistory).not.toHaveBeenCalled();
  });

  it('chưa có bản nào thì active null, history rỗng', async () => {
    const { checkIns, admin } = makeDeps();

    const result = await new GetCheckInPolicyUseCase(
      checkIns as never,
      admin as never,
    ).handle({ actorUserId: ActorId });

    expect(result).toEqual({ active: null, history: [] });
  });

  it('trả bản đang chạy cùng tối đa 20 bản lịch sử, phẳng hoá policy', async () => {
    const { checkIns, admin } = makeDeps();
    const active = revision(2, 5);
    const history = [revision(2, 5), revision(1)];
    checkIns.getActivePolicy.mockResolvedValue(active);
    checkIns.listPolicyHistory.mockResolvedValue(history);

    const result = await new GetCheckInPolicyUseCase(
      checkIns as never,
      admin as never,
    ).handle({ actorUserId: ActorId });

    expect(checkIns.listPolicyHistory).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      active: dtoOf(active),
      history: history.map(dtoOf),
    });
    expect(result.active?.milestones).not.toBe(active.policy.milestones);
  });
});

describe(PublishCheckInPolicyUseCase.name, () => {
  afterEach(() => jest.useRealTimers());

  it('đòi config.write và không ghi gì khi thiếu quyền', async () => {
    const { checkIns, admin } = makeDeps(['config.read']);

    await expect(
      new PublishCheckInPolicyUseCase(checkIns as never, admin as never).handle(
        { actorUserId: ActorId, checkInPolicy: policyInput() },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(checkIns.publishPolicy).not.toHaveBeenCalled();
    expect(admin.appendAudit).not.toHaveBeenCalled();
  });

  it('thiếu lý do hoặc lý do chỉ có khoảng trắng thì từ chối và không ghi', async () => {
    const { checkIns, admin } = makeDeps();
    const useCase = new PublishCheckInPolicyUseCase(
      checkIns as never,
      admin as never,
    );

    for (const reason of ['   ', '', undefined]) {
      await expect(
        useCase.handle({
          actorUserId: ActorId,
          checkInPolicy: policyInput({ reason }),
        }),
      ).rejects.toThrow(ValidationFailedException);
    }
    expect(checkIns.publishPolicy).not.toHaveBeenCalled();
    expect(admin.appendAudit).not.toHaveBeenCalled();
  });

  it('ghi policy đã chuẩn hoá, lý do đã trim, expectedVersion và hiệu lực ngay khi không hẹn giờ', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-16T03:00:00.000Z') });
    const { checkIns, admin } = makeDeps();

    const result = await new PublishCheckInPolicyUseCase(
      checkIns as never,
      admin as never,
    ).handle({
      actorUserId: ActorId,
      checkInPolicy: policyInput({
        expectedVersion: 4,
        dailyPoints: 5000,
        milestones: [
          { streakDays: 30, bonusPoints: 100 },
          { streakDays: 7, bonusPoints: 10 },
          { streakDays: 0, bonusPoints: 99 },
        ],
        reason: '  Bật điểm danh  ',
      }),
    });

    const policy = {
      enabled: true,
      dailyPoints: 1000,
      milestones: [
        { streakDays: 7, bonusPoints: 10 },
        { streakDays: 30, bonusPoints: 100 },
      ],
      transactionsPerRepair: 3,
      repairWindowDays: 7,
    };
    expect(checkIns.publishPolicy).toHaveBeenCalledWith({
      actorUserId: ActorId,
      expectedVersion: 4,
      policy,
      effectiveAt: new Date('2026-10-16T03:00:00.000Z'),
      reason: 'Bật điểm danh',
    });
    expect(result.policy).toEqual(
      expect.objectContaining({ version: 1, ...policy }),
    );
  });

  it('không gửi expectedVersion thì truyền null; hẹn giờ thì dùng đúng thời điểm đó', async () => {
    const { checkIns, admin } = makeDeps();

    await new PublishCheckInPolicyUseCase(
      checkIns as never,
      admin as never,
    ).handle({
      actorUserId: ActorId,
      checkInPolicy: policyInput({
        effectiveAt: '2026-11-01T00:00:00.000+07:00',
      }),
    });

    expect(checkIns.publishPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: null,
        effectiveAt: new Date('2026-10-31T17:00:00.000Z'),
      }),
    );
  });

  it('ghi audit với bản trước và bản sau, resourceId là version mới', async () => {
    const { checkIns, admin } = makeDeps();
    const before = revision(3);
    checkIns.getActivePolicy.mockResolvedValue(before);
    checkIns.publishPolicy.mockResolvedValue(revision(4, 9));

    await new PublishCheckInPolicyUseCase(
      checkIns as never,
      admin as never,
    ).handle({
      actorUserId: ActorId,
      checkInPolicy: policyInput({ expectedVersion: 3, reason: ' Tăng điểm ' }),
    });

    expect(admin.appendAudit).toHaveBeenCalledWith({
      actorUserId: ActorId,
      action: 'PUBLISH_CHECK_IN_POLICY',
      resourceType: 'CHECK_IN_POLICY',
      resourceId: '4',
      before: dtoOf(before),
      after: dtoOf(revision(4, 9)),
      reason: 'Tăng điểm',
    });
  });

  it('bản đầu tiên thì audit before là null', async () => {
    const { checkIns, admin } = makeDeps();

    await new PublishCheckInPolicyUseCase(
      checkIns as never,
      admin as never,
    ).handle({ actorUserId: ActorId, checkInPolicy: policyInput() });

    expect(admin.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ before: null, resourceId: '1' }),
    );
  });

  it('lệch version thì lỗi xung đột đi ra nguyên vẹn và không ghi audit', async () => {
    const { checkIns, admin } = makeDeps();
    checkIns.publishPolicy.mockRejectedValue(
      new CheckInPolicyVersionConflictException(5, 4),
    );

    await expect(
      new PublishCheckInPolicyUseCase(checkIns as never, admin as never).handle(
        {
          actorUserId: ActorId,
          checkInPolicy: policyInput({ expectedVersion: 4 }),
        },
      ),
    ).rejects.toThrow(CheckInPolicyVersionConflictException);
    expect(admin.appendAudit).not.toHaveBeenCalled();
  });
});
