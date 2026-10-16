import { AffiliatePolicyVersionConflictException } from '@/domain/exceptions';
import { IAffiliatePolicy } from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  GetAffiliateEventRewardsUseCase,
  GetAffiliatePolicyUseCase,
  ListAffiliateEventsUseCase,
  PublishAffiliatePolicyUseCase,
  ReverseAffiliateEventUseCase,
} from './affiliate.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const EventId = '20000000-0000-4000-8000-000000000002';

const activeRevision = {
  version: 3,
  policy: { enabled: false },
  effectiveAt: new Date('2026-01-01T00:00:00Z'),
  reason: 'cũ',
  createdBy: ActorId,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};
const publishedRevision = { ...activeRevision, version: 4, reason: 'mới' };

function makeDeps(options: { allowed?: boolean } = {}) {
  return {
    affiliate: {
      getActivePolicy: jest.fn().mockResolvedValue(activeRevision),
      listPolicyHistory: jest.fn().mockResolvedValue([activeRevision]),
      publishPolicy: jest.fn().mockResolvedValue(publishedRevision),
      listEvents: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      listRewards: jest.fn().mockResolvedValue([]),
      reverseEvent: jest
        .fn()
        .mockResolvedValue({ reversedCount: 2, pointsReclaimed: 40 }),
    },
    admin: {
      hasPermission: jest.fn().mockResolvedValue(options.allowed ?? true),
      appendAudit: jest.fn().mockResolvedValue(undefined),
    },
  };
}

type Deps = ReturnType<typeof makeDeps>;

function expectNoWrite(deps: Deps) {
  expect(deps.affiliate.publishPolicy).not.toHaveBeenCalled();
  expect(deps.affiliate.reverseEvent).not.toHaveBeenCalled();
  expect(deps.admin.appendAudit).not.toHaveBeenCalled();
}

describe(GetAffiliatePolicyUseCase.name, () => {
  const build = (deps: Deps) =>
    new GetAffiliatePolicyUseCase(deps.affiliate as never, deps.admin as never);

  it('thiếu config.read thì 403 và không đọc gì', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      build(deps).handle({ actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'config.read',
    );
    expect(deps.affiliate.getActivePolicy).not.toHaveBeenCalled();
    expect(deps.affiliate.listPolicyHistory).not.toHaveBeenCalled();
  });

  it('trả bản đang hiệu lực cùng 20 bản lịch sử gần nhất', async () => {
    const deps = makeDeps();

    await expect(build(deps).handle({ actorUserId: ActorId })).resolves.toEqual(
      { active: activeRevision, history: [activeRevision] },
    );
    expect(deps.affiliate.listPolicyHistory).toHaveBeenCalledWith(20);
  });

  it('chưa có bản nào thì active null', async () => {
    const deps = makeDeps();
    deps.affiliate.getActivePolicy.mockResolvedValue(null);
    deps.affiliate.listPolicyHistory.mockResolvedValue([]);

    await expect(build(deps).handle({ actorUserId: ActorId })).resolves.toEqual(
      { active: null, history: [] },
    );
  });
});

describe(PublishAffiliatePolicyUseCase.name, () => {
  const build = (deps: Deps) =>
    new PublishAffiliatePolicyUseCase(
      deps.affiliate as never,
      deps.admin as never,
    );

  const rawPolicy = {
    enabled: true,
    distributionMode: 'BOGUS',
    eventPoints: { POST_CREATED: 12.7, GIFT_COMPLETED: 999_999 },
    dailyCapPerBeneficiary: -5,
    maxBeneficiariesPerEvent: '30',
  } as unknown as IAffiliatePolicy;

  it('thiếu config.write thì 403 và không ghi gì', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        policy: rawPolicy,
        reason: 'đổi',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'config.write',
    );
    expectNoWrite(deps);
  });

  it('chỉ có quyền config.read thì vẫn 403', async () => {
    const deps = makeDeps();
    deps.admin.hasPermission.mockImplementation(
      async (_id: string, permission: string) => permission === 'config.read',
    );

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        policy: rawPolicy,
        reason: 'đổi',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoWrite(deps);
  });

  it.each([
    ['rỗng', ''],
    ['toàn khoảng trắng', '   \n\t'],
    ['undefined', undefined],
  ])('lý do %s thì 400 và không ghi gì', async (_label, reason) => {
    const deps = makeDeps();

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        policy: rawPolicy,
        reason: reason as string,
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.affiliate.getActivePolicy).not.toHaveBeenCalled();
    expectNoWrite(deps);
  });

  it('ghi chính sách đã chuẩn hoá, lý do đã trim, đúng người và version', async () => {
    const deps = makeDeps();
    const effectiveAt = new Date('2026-11-01T00:00:00Z');

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        expectedVersion: 3,
        policy: rawPolicy,
        effectiveAt,
        reason: '  Bật thưởng affiliate  ',
      }),
    ).resolves.toEqual({ policy: publishedRevision });

    expect(deps.affiliate.publishPolicy).toHaveBeenCalledWith({
      actorUserId: ActorId,
      expectedVersion: 3,
      policy: {
        enabled: true,
        distributionMode: 'SPLIT_POOL',
        eventPoints: { POST_CREATED: 12, GIFT_COMPLETED: 1_000 },
        dailyCapPerBeneficiary: 0,
        maxBeneficiariesPerEvent: 30,
      },
      effectiveAt,
      reason: 'Bật thưởng affiliate',
    });
  });

  it('ghi audit với bản trước, bản sau và version mới làm resourceId', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      policy: rawPolicy,
      reason: ' lý do ',
    });

    expect(deps.admin.appendAudit).toHaveBeenCalledTimes(1);
    expect(deps.admin.appendAudit).toHaveBeenCalledWith({
      actorUserId: ActorId,
      action: 'PUBLISH_AFFILIATE_POLICY',
      resourceType: 'AFFILIATE_POLICY',
      resourceId: '4',
      before: activeRevision,
      after: publishedRevision,
      reason: 'lý do',
    });
  });

  it('chưa có bản cũ thì audit before null', async () => {
    const deps = makeDeps();
    deps.affiliate.getActivePolicy.mockResolvedValue(null);

    await build(deps).handle({
      actorUserId: ActorId,
      policy: rawPolicy,
      reason: 'lần đầu',
    });

    expect(deps.admin.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ before: null }),
    );
  });

  it('không gửi expectedVersion thì truyền null, không gửi effectiveAt thì lấy bây giờ', async () => {
    const deps = makeDeps();
    const before = Date.now();

    await build(deps).handle({
      actorUserId: ActorId,
      policy: rawPolicy,
      reason: 'đổi',
    });

    const params = deps.affiliate.publishPolicy.mock.calls[0][0];
    expect(params.expectedVersion).toBeNull();
    expect(params.effectiveAt).toBeInstanceOf(Date);
    expect(params.effectiveAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(params.effectiveAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('effectiveAt dạng chuỗi ISO được đổi sang Date', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      policy: rawPolicy,
      effectiveAt: '2026-12-01T00:00:00.000Z' as unknown as Date,
      reason: 'đổi',
    });

    expect(deps.affiliate.publishPolicy.mock.calls[0][0].effectiveAt).toEqual(
      new Date('2026-12-01T00:00:00.000Z'),
    );
  });

  it('version lệch thì AFFILIATE_POLICY_VERSION_CONFLICT và không ghi audit', async () => {
    const deps = makeDeps();
    deps.affiliate.publishPolicy.mockRejectedValue(
      new AffiliatePolicyVersionConflictException(4, 3),
    );

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        expectedVersion: 3,
        policy: rawPolicy,
        reason: 'đổi',
      }),
    ).rejects.toBeInstanceOf(AffiliatePolicyVersionConflictException);
    expect(deps.admin.appendAudit).not.toHaveBeenCalled();
  });
});

describe(ListAffiliateEventsUseCase.name, () => {
  const build = (deps: Deps) =>
    new ListAffiliateEventsUseCase(
      deps.affiliate as never,
      deps.admin as never,
    );

  it('thiếu config.read thì 403 và không truy vấn', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      build(deps).handle({ actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'config.read',
    );
    expect(deps.affiliate.listEvents).not.toHaveBeenCalled();
  });

  it('truyền bộ lọc và skip/take theo trang, trả meta phân trang', async () => {
    const deps = makeDeps();
    const row = { globalId: EventId };
    deps.affiliate.listEvents.mockResolvedValue({ items: [row], total: 25 });

    const result = await build(deps).handle({
      actorUserId: ActorId,
      groupId: 'g1',
      geoStatus: 'ELIGIBLE' as never,
      page: 3,
      pageSize: 10,
    });

    expect(deps.affiliate.listEvents).toHaveBeenCalledWith({
      groupId: 'g1',
      geoStatus: 'ELIGIBLE',
      skip: 20,
      take: 10,
    });
    expect(result.events).toEqual([row]);
    expect(result.meta).toMatchObject({ page: 3, pageSize: 10, total: 25 });
  });

  it('pageSize vượt trần bị kẹp về 50', async () => {
    const deps = makeDeps();

    const result = await build(deps).handle({
      actorUserId: ActorId,
      page: 2,
      pageSize: 500,
    });

    expect(deps.affiliate.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 }),
    );
    expect(result.meta).toMatchObject({ page: 2, pageSize: 50 });
  });
});

describe(GetAffiliateEventRewardsUseCase.name, () => {
  const build = (deps: Deps) =>
    new GetAffiliateEventRewardsUseCase(
      deps.affiliate as never,
      deps.admin as never,
    );

  it('thiếu config.read thì 403 và không đọc reward', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      build(deps).handle({ actorUserId: ActorId, eventId: EventId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'config.read',
    );
    expect(deps.affiliate.listRewards).not.toHaveBeenCalled();
  });

  it('trả reward của đúng sự kiện được hỏi', async () => {
    const deps = makeDeps();
    const rewards = [{ beneficiaryUserId: 'u1', pointDelta: 5 }];
    deps.affiliate.listRewards.mockResolvedValue(rewards);

    await expect(
      build(deps).handle({ actorUserId: ActorId, eventId: EventId }),
    ).resolves.toEqual({ rewards });
    expect(deps.affiliate.listRewards).toHaveBeenCalledWith(EventId);
  });
});

describe(ReverseAffiliateEventUseCase.name, () => {
  const build = (deps: Deps) =>
    new ReverseAffiliateEventUseCase(
      deps.affiliate as never,
      deps.admin as never,
    );

  it('thiếu point.adjust thì 403 và không thu hồi gì', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        eventId: EventId,
        reason: 'gian lận',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'point.adjust',
    );
    expectNoWrite(deps);
  });

  it('có config.write mà không có point.adjust vẫn 403', async () => {
    const deps = makeDeps();
    deps.admin.hasPermission.mockImplementation(
      async (_id: string, permission: string) =>
        permission === 'config.write' || permission === 'config.read',
    );

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        eventId: EventId,
        reason: 'gian lận',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoWrite(deps);
  });

  it.each([
    ['rỗng', ''],
    ['toàn khoảng trắng', '   '],
    ['undefined', undefined],
    ['null', null],
  ])('lý do %s thì 400 và không thu hồi gì', async (_label, reason) => {
    const deps = makeDeps();

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        eventId: EventId,
        reason: reason as string,
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expectNoWrite(deps);
  });

  it('thu hồi đúng sự kiện, đúng người, lý do đã trim và trả nguyên kết quả', async () => {
    const deps = makeDeps();

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        eventId: EventId,
        reason: '  Tự tạo bài để ăn điểm  ',
      }),
    ).resolves.toEqual({ reversedCount: 2, pointsReclaimed: 40 });

    expect(deps.affiliate.reverseEvent).toHaveBeenCalledTimes(1);
    expect(deps.affiliate.reverseEvent).toHaveBeenCalledWith({
      eventGlobalId: EventId,
      actorUserId: ActorId,
      reason: 'Tự tạo bài để ăn điểm',
    });
  });

  it('thu hồi được thì ghi đúng một dòng audit kèm lý do và kết quả', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      eventId: EventId,
      reason: ' gian lận ',
    });

    expect(deps.admin.appendAudit).toHaveBeenCalledTimes(1);
    expect(deps.admin.appendAudit).toHaveBeenCalledWith({
      actorUserId: ActorId,
      action: 'REVERSE_AFFILIATE_EVENT',
      resourceType: 'AFFILIATE_EVENT',
      resourceId: EventId,
      before: null,
      after: { reversedCount: 2, pointsReclaimed: 40 },
      reason: 'gian lận',
    });
  });

  it('thu hồi lần hai (không còn reward AWARDED) trả 0/0 và không dựng thêm audit', async () => {
    const deps = makeDeps();
    deps.affiliate.reverseEvent
      .mockResolvedValueOnce({ reversedCount: 2, pointsReclaimed: 40 })
      .mockResolvedValueOnce({ reversedCount: 0, pointsReclaimed: 0 });
    const useCase = build(deps);
    const command = { actorUserId: ActorId, eventId: EventId, reason: 'x' };

    await useCase.handle(command);
    await expect(useCase.handle(command)).resolves.toEqual({
      reversedCount: 0,
      pointsReclaimed: 0,
    });

    expect(deps.affiliate.reverseEvent).toHaveBeenCalledTimes(2);
    expect(deps.admin.appendAudit).toHaveBeenCalledTimes(1);
  });

  it('sự kiện không tồn tại thì lỗi từ repository nổi lên và không ghi audit', async () => {
    const deps = makeDeps();
    deps.affiliate.reverseEvent.mockRejectedValue(
      new ValidationFailedException([
        `eventGlobalId: không tìm thấy sự kiện ${EventId}`,
      ]),
    );

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        eventId: EventId,
        reason: 'gian lận',
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.admin.appendAudit).not.toHaveBeenCalled();
  });
});
