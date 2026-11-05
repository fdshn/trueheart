import {
  CharityAppealConflictOfInterestException,
  CharityAppealInvalidStateException,
  CharityAppealNotAllowedException,
  CharityAppealNotFoundException,
  CharityAppealRateLimitedException,
  CharityAppealWindowClosedException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  ActOnCharityAppealUseCase,
  ProcessCharityAppealSlaUseCase,
  SubmitCharityAppealUseCase,
} from './charity-appeal.use-cases';
import { CharityProjectAccess } from './charity-project.use-cases';

const CampaignId = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2b001';
const Owner = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2b002';
const Walker = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2b003';
const Stranger = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2b004';

function appeal(overrides: Record<string, unknown> = {}) {
  return {
    appealId: 'a1',
    campaignId: CampaignId,
    campaignTitle: 'Mùa đông ấm',
    appellantId: Walker,
    targetType: 'EVALUATION',
    targetId: 'e1',
    status: 'ORGANIZER_REVIEW',
    tier: 1,
    organizerDecision: null,
    ...overrides,
  };
}

function make() {
  const campaign = {
    globalId: CampaignId,
    createdBy: Owner,
    approvalStatus: 'APPROVED',
    isActive: true,
    endTime: new Date(Date.now() + 86_400_000),
    operationStage: 'SUMMARY',
  } as ICharityCampaign;
  const campaigns = {
    findByGlobalId: jest.fn(async () => campaign),
    isCampaignManager: jest.fn(async () => false),
  };
  const admin = {
    hasPermission: jest.fn(async () => false),
    getConfigValue: jest.fn(async () => null),
  };
  const appeals = {
    countSince: jest.fn(async () => 0),
    findEvaluationTarget: jest.fn(async (): Promise<unknown> => ({
      evaluationId: 'e1',
      campaignId: CampaignId,
      participantId: Walker,
      completionScore: 60,
      evaluatedBy: Owner,
      createdAt: new Date(),
      isLatest: true,
    })),
    create: jest.fn(async (): Promise<unknown> => appeal()),
    find: jest.fn(async (): Promise<unknown> => appeal()),
    transition: jest.fn(async (params: { next: string }) =>
      appeal({ status: params.next }),
    ),
    countOtherOperators: jest.fn(async () => 0),
    listOverdue: jest.fn(async (): Promise<unknown[]> => []),
  };
  const points = { deliveryValue: jest.fn(async (): Promise<unknown> => null) };
  const notifier = { notify: jest.fn(async () => undefined) };
  const applier = { apply: jest.fn(async () => undefined) };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  return { admin, appeals, points, notifier, applier, access };
}

const submit = {
  userId: Walker,
  campaignId: CampaignId,
  targetType: 'EVALUATION' as const,
  targetId: 'e1',
  requestedValue: 90,
  description: 'Tôi có mặt từ đầu tới cuối buổi trao',
  evidenceUrls: [],
};

describe('Gửi khiếu nại', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new SubmitCharityAppealUseCase(
      deps.appeals as never,
      deps.points as never,
      deps.admin as never,
      deps.notifier as never,
    );

  it('mô tả quá ngắn / giá trị ngoài 0–100 → 400', async () => {
    await expect(
      build(make()).handle({
        ...submit,
        description: 'ngắn',
        requestedValue: 120,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('quá 5 khiếu nại / 24 giờ → chặn', async () => {
    const deps = make();
    deps.appeals.countSince.mockResolvedValueOnce(5);
    await expect(build(deps).handle(submit)).rejects.toThrow(
      CharityAppealRateLimitedException,
    );
  });

  it('khiếu nại lần chấm của người khác hoặc lần chấm cũ → không được', async () => {
    const deps = make();
    await expect(
      build(deps).handle({ ...submit, userId: Stranger }),
    ).rejects.toThrow(CharityAppealNotAllowedException);
    deps.appeals.findEvaluationTarget.mockResolvedValueOnce({
      evaluationId: 'e1',
      campaignId: CampaignId,
      participantId: Walker,
      completionScore: 60,
      evaluatedBy: Owner,
      createdAt: new Date(),
      isLatest: false,
    });
    await expect(build(deps).handle(submit)).rejects.toThrow(
      CharityAppealNotAllowedException,
    );
  });

  it('quá 7 ngày (mặc định) → hết hạn', async () => {
    const deps = make();
    deps.appeals.findEvaluationTarget.mockResolvedValueOnce({
      evaluationId: 'e1',
      campaignId: CampaignId,
      participantId: Walker,
      completionScore: 60,
      evaluatedBy: Owner,
      createdAt: new Date(Date.now() - 8 * 86_400_000),
      isLatest: true,
    });
    await expect(build(deps).handle(submit)).rejects.toThrow(
      CharityAppealWindowClosedException,
    );
  });

  it('hợp lệ → tạo với hạn tầng 1 sau 3 ngày, báo ban tổ chức', async () => {
    const deps = make();
    await build(deps).handle(submit);
    const call = deps.appeals.create.mock.calls[0] as unknown as [
      { originalValue: number; organizerDueAt: Date },
    ];
    expect(call[0].originalValue).toBe(60);
    expect(call[0].organizerDueAt.getTime() - Date.now()).toBeGreaterThan(
      2.9 * 86_400_000,
    );
    expect(deps.notifier.notify).toHaveBeenCalledWith(
      expect.anything(),
      'ORGANIZER',
      expect.any(String),
    );
  });
});

describe('Xử tầng 1', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new ActOnCharityAppealUseCase(
      deps.access,
      deps.appeals as never,
      deps.points as never,
      deps.admin as never,
      deps.applier as never,
      deps.notifier as never,
    );

  it('người đã chấm tự xét khi ban tổ chức còn người khác → xung đột lợi ích', async () => {
    const deps = make();
    deps.appeals.countOtherOperators.mockResolvedValueOnce(1);
    await expect(
      build(deps).handle({
        userId: Owner,
        appealId: 'a1',
        action: 'KEEP',
        value: null,
        reason: 'Giữ nguyên',
      }),
    ).rejects.toThrow(CharityAppealConflictOfInterestException);
  });

  it('một mình chấm thì tự xét được; ADJUST áp giá trị ngay và báo người khiếu nại', async () => {
    const deps = make();
    await build(deps).handle({
      userId: Owner,
      appealId: 'a1',
      action: 'ADJUST',
      value: 85,
      reason: 'Đối chiếu điểm danh',
    });
    expect(deps.applier.apply).toHaveBeenCalledWith(
      expect.anything(),
      85,
      Owner,
      'APPEAL',
    );
    expect(deps.notifier.notify).toHaveBeenCalledWith(
      expect.anything(),
      'APPELLANT',
      expect.any(String),
    );
  });

  it('ADJUST thiếu giá trị / thiếu lý do → 400', async () => {
    const deps = make();
    await expect(
      build(deps).handle({
        userId: Owner,
        appealId: 'a1',
        action: 'ADJUST',
        value: null,
        reason: 'x',
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(deps).handle({
        userId: Owner,
        appealId: 'a1',
        action: 'KEEP',
        value: null,
        reason: '  ',
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('người khiếu nại: chỉ khi đang chờ mình; người khác → 404', async () => {
    const deps = make();
    await expect(
      build(deps).handle({
        userId: Walker,
        appealId: 'a1',
        action: 'ACCEPT',
        value: null,
        reason: null,
      }),
    ).rejects.toThrow(CharityAppealInvalidStateException);
    deps.appeals.find.mockResolvedValue(
      appeal({ status: 'AWAITING_APPELLANT', organizerDecision: 'KEEP' }),
    );
    await expect(
      build(deps).handle({
        userId: Stranger,
        appealId: 'a1',
        action: 'ESCALATE',
        value: null,
        reason: null,
      }),
    ).rejects.toThrow(CharityAppealNotFoundException);
    await build(deps).handle({
      userId: Walker,
      appealId: 'a1',
      action: 'ESCALATE',
      value: null,
      reason: null,
    });
    expect(deps.appeals.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({ next: 'ADMIN_REVIEW', tier: 2 }),
    );
  });
});

describe('Hạn khiếu nại', () => {
  it('tầng 1 quá hạn → chuyển Admin; người khiếu nại im lặng → đóng; chạy khô chỉ đếm', async () => {
    const deps = make();
    deps.appeals.listOverdue.mockResolvedValue([
      appeal({ appealId: 'a1', status: 'ORGANIZER_REVIEW' }),
      appeal({ appealId: 'a2', status: 'AWAITING_APPELLANT' }),
    ]);
    const useCase = new ProcessCharityAppealSlaUseCase(
      deps.appeals as never,
      deps.notifier as never,
    );
    expect(await useCase.handle({ dryRun: true, limit: 10 })).toEqual({
      escalated: 0,
      autoClosed: 0,
      overdue: 2,
    });
    expect(await useCase.handle({ dryRun: false, limit: 10 })).toEqual({
      escalated: 1,
      autoClosed: 1,
      overdue: 2,
    });
  });
});
