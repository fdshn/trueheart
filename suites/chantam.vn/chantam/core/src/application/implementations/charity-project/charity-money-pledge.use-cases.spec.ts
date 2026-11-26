import {
  CharityCampaignNotFoundException,
  CharityContributionTypeDisabledException,
  CharityFundingNeedNotFoundException,
  CharityIntakeClosedException,
  CharityMoneyPledgeAlreadyCompletedException,
  CharityMoneyPledgeAlreadyHiddenException,
  CharityMoneyPledgeLockedException,
  CharityMoneyPledgeNotFoundException,
  CharityMoneyPledgeNotHiddenException,
  CharityMoneyPledgeSelfException,
  CharityNotAcceptingContributionsException,
  CharityReceivingAccountRequiredException,
} from '@/domain/exceptions';
import {
  ICharityCampaign,
  ICharityMoneyPledge,
  ICharityMoneyPledgeRow,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  CharityMoneyPledgeNotifier,
  CharityMoneyPledgeRateLimit,
  CompleteCharityMoneyPledgeUseCase,
  DeclareCharityMoneyPledgeUseCase,
  ListCharityMoneyPledgesUseCase,
  ListMyCharityMoneyPledgesUseCase,
  SetCharityMoneyPledgeHiddenUseCase,
} from './charity-money-pledge.use-cases';
import { CharityProjectAccess } from './charity-project.use-cases';

const CampaignId = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e001';
const Owner = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e002';
const Donor = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e003';
const PledgeId = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e004';
const Day = 24 * 3_600_000;

function campaign(overrides: Partial<ICharityCampaign> = {}): ICharityCampaign {
  return {
    globalId: CampaignId,
    title: 'Mùa đông ấm',
    slug: 'mua-dong-am',
    createdBy: Owner,
    approvalStatus: 'APPROVED',
    isActive: true,
    endTime: new Date(Date.now() + 30 * Day),
    operationStage: 'EXECUTION',
    acceptedContributionTypes: ['MATERIAL', 'MONEY'],
    intakeEndsAt: null,
    summaryPublishedAt: null,
    ...overrides,
  } as ICharityCampaign;
}

const liveAccount = (accountId: string, bankBin: string | null = '970436') => ({
  accountId,
  label: null,
  bankName: 'Vietcombank',
  bankBin,
  accountNo: '9999000101',
  accountName: 'CLB AM AP',
  validFrom: new Date(),
  validTo: null,
  closeReason: null,
});

function pledge(
  overrides: Partial<ICharityMoneyPledge> = {},
): ICharityMoneyPledge {
  return {
    pledgeId: PledgeId,
    campaignId: CampaignId,
    fundingNeedId: null,
    userId: Donor,
    pledgedAmount: 500_000,
    status: 'INTENDED',
    showNamePublicly: true,
    note: 'Ủng hộ chăn',
    bankAccountId: 'acc-1',
    transferContent: 'CT ABC234',
    declaredAt: new Date('2026-11-26T01:00:00Z'),
    completedAt: null,
    hiddenAt: null,
    hiddenBy: null,
    hiddenReason: null,
    ...overrides,
  };
}

function row(
  overrides: Partial<ICharityMoneyPledgeRow> = {},
  cursorId = 7,
): ICharityMoneyPledgeRow & { cursorId: number } {
  return {
    ...pledge(),
    user: {
      globalId: Donor,
      username: 'donor',
      fullName: 'Người Góp',
      avatarUrl: null,
      rank: 'BRONZE' as never,
    },
    account: {
      accountId: 'acc-1',
      bankName: 'Vietcombank',
      bankBin: '970436',
      accountNo: '9999000101',
      accountName: 'CLB AM AP',
      validTo: null,
    },
    campaign: {
      globalId: CampaignId,
      title: 'Mùa đông ấm',
      slug: 'mua-dong-am',
    },
    cursorId,
    ...overrides,
  };
}

function makeDeclare(current = campaign()) {
  const campaigns = {
    findByGlobalId: jest.fn().mockResolvedValue(current),
    isCampaignManager: jest.fn().mockResolvedValue(false),
  };
  const projects = {
    listFundingNeeds: jest.fn().mockResolvedValue([
      { fundingNeedId: 'need-open', status: 'OPEN', bankAccountId: 'acc-2' },
      { fundingNeedId: 'need-closed', status: 'CLOSED', bankAccountId: null },
    ]),
    listBankAccounts: jest
      .fn()
      .mockResolvedValue([liveAccount('acc-1'), liveAccount('acc-2', null)]),
  };
  const pledges = {
    create: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve(pledge(input as Partial<ICharityMoneyPledge>)),
      ),
  };
  const throttle = {
    assertWithinLimit: jest.fn().mockResolvedValue(undefined),
    registerHit: jest.fn().mockResolvedValue(undefined),
  };
  const useCase = new DeclareCharityMoneyPledgeUseCase(
    campaigns as never,
    projects as never,
    pledges as never,
    throttle as never,
  );
  return { useCase, campaigns, projects, pledges, throttle };
}

const declare = (
  useCase: DeclareCharityMoneyPledgeUseCase,
  input: Record<string, unknown> = {},
) =>
  useCase.handle({
    userId: Donor,
    campaignId: CampaignId,
    pledge: { pledgedAmount: 500_000, ...input } as never,
  });

describe('DeclareCharityMoneyPledgeUseCase', () => {
  it('khai thành công: trả transfer có VietQR, nội dung CT <mã>, đếm trần sau khi ghi', async () => {
    const deps = makeDeclare();
    const result = await declare(deps.useCase, { note: '  chăn ấm  ' });
    const input = deps.pledges.create.mock.calls[0][0];
    expect(input).toMatchObject({
      campaignId: CampaignId,
      userId: Donor,
      pledgedAmount: 500_000,
      note: 'chăn ấm',
      bankAccountId: 'acc-1',
      showNamePublicly: null,
      fundingNeedId: null,
    });
    expect(input.transferContent).toMatch(/^CT [2-9A-HJKMNP-Z]{6}$/);
    expect(result.transfer).toMatchObject({
      bankName: 'Vietcombank',
      accountNo: '9999000101',
      amount: 500_000,
      transferContent: input.transferContent,
    });
    expect(result.transfer.vietQrUrl).toContain('970436-9999000101');
    expect(result.pledge.status).toBe('INTENDED');
    expect(deps.throttle.registerHit).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: CharityMoneyPledgeRateLimit.bucket }),
    );
  });

  it('chọn khoản tiền: dùng tài khoản của khoản đó; thiếu BIN thì vietQrUrl = null', async () => {
    const deps = makeDeclare();
    const result = await declare(deps.useCase, { fundingNeedId: 'need-open' });
    expect(deps.pledges.create.mock.calls[0][0]).toMatchObject({
      fundingNeedId: 'need-open',
      bankAccountId: 'acc-2',
    });
    expect(result.transfer.vietQrUrl).toBeNull();
  });

  it('khoản tiền không thuộc dự án → 404; khoản đã đóng → 400', async () => {
    const deps = makeDeclare();
    await expect(
      declare(deps.useCase, { fundingNeedId: 'other' }),
    ).rejects.toThrow(CharityFundingNeedNotFoundException);
    await expect(
      declare(deps.useCase, { fundingNeedId: 'need-closed' }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('số tiền ngoài 1.000 → 10 tỷ hoặc không nguyên → 400, không chạm DB', async () => {
    const deps = makeDeclare();
    for (const pledgedAmount of [999, 10_000_000_001, 1500.5])
      await expect(declare(deps.useCase, { pledgedAmount })).rejects.toThrow(
        ValidationFailedException,
      );
    expect(deps.campaigns.findByGlobalId).not.toHaveBeenCalled();
  });

  it.each([
    [
      'chưa duyệt',
      { approvalStatus: 'PENDING_APPROVAL' },
      CharityCampaignNotFoundException,
    ],
    ['đình chỉ', { isActive: false }, CharityCampaignNotFoundException],
    [
      'đã đóng',
      { isActive: false, endTime: new Date(Date.now() - Day) },
      CharityNotAcceptingContributionsException,
    ],
    [
      'đang tổng kết',
      { operationStage: 'SUMMARY' },
      CharityNotAcceptingContributionsException,
    ],
    [
      'không nhận tiền',
      { acceptedContributionTypes: ['MATERIAL'] },
      CharityContributionTypeDisabledException,
    ],
    [
      'hết tiếp nhận',
      { intakeEndsAt: new Date(Date.now() - 1_000) },
      CharityIntakeClosedException,
    ],
    [
      'chủ dự án tự khai',
      { createdBy: Donor },
      CharityMoneyPledgeSelfException,
    ],
  ] as const)('%s → lỗi', async (_label, overrides, error) => {
    const deps = makeDeclare(campaign(overrides as Partial<ICharityCampaign>));
    await expect(declare(deps.useCase)).rejects.toThrow(error);
    expect(deps.pledges.create).not.toHaveBeenCalled();
  });

  it('điều phối viên tự khai → 409', async () => {
    const deps = makeDeclare();
    deps.campaigns.isCampaignManager.mockResolvedValue(true);
    await expect(declare(deps.useCase)).rejects.toThrow(
      CharityMoneyPledgeSelfException,
    );
  });

  it('không có tài khoản nhận đang hiệu lực → 409', async () => {
    const deps = makeDeclare();
    deps.projects.listBankAccounts.mockResolvedValue([
      { ...liveAccount('acc-1'), validTo: new Date() },
    ]);
    await expect(declare(deps.useCase)).rejects.toThrow(
      CharityReceivingAccountRequiredException,
    );
  });

  it('chạm trần tần suất → không ghi', async () => {
    const deps = makeDeclare();
    deps.throttle.assertWithinLimit.mockRejectedValue(new Error('429'));
    await expect(declare(deps.useCase)).rejects.toThrow('429');
    expect(deps.pledges.create).not.toHaveBeenCalled();
  });

  it('mã chuyển khoản trùng → sinh lại mã dài hơn', async () => {
    const deps = makeDeclare();
    deps.pledges.create
      .mockResolvedValueOnce(null)
      .mockImplementationOnce((input: Record<string, unknown>) =>
        Promise.resolve(pledge(input as Partial<ICharityMoneyPledge>)),
      );
    await declare(deps.useCase);
    expect(deps.pledges.create).toHaveBeenCalledTimes(2);
    expect(deps.pledges.create.mock.calls[1][0].transferContent).toMatch(
      /^CT .{7}$/,
    );
  });
});

describe('CompleteCharityMoneyPledgeUseCase', () => {
  const make = (outcome: unknown) => {
    const pledges = {
      markCompleted: jest.fn().mockResolvedValue(outcome),
      findRow: jest
        .fn()
        .mockResolvedValue(
          row({ status: 'COMPLETED', completedAt: new Date() }),
        ),
    };
    return {
      pledges,
      useCase: new CompleteCharityMoneyPledgeUseCase(pledges as never),
    };
  };

  it('báo đã chuyển → trả lời khai của tôi kèm transfer', async () => {
    const { useCase, pledges } = make({
      status: 'UPDATED',
      pledge: pledge({ status: 'COMPLETED' }),
    });
    const result = await useCase.handle({ userId: Donor, pledgeId: PledgeId });
    expect(pledges.markCompleted).toHaveBeenCalledWith({
      pledgeId: PledgeId,
      userId: Donor,
    });
    expect(result.status).toBe('COMPLETED');
    expect(result.transfer?.transferContent).toBe('CT ABC234');
  });

  it.each([
    ['NOT_FOUND', CharityMoneyPledgeNotFoundException],
    ['LOCKED', CharityMoneyPledgeLockedException],
    ['CONFLICT', CharityMoneyPledgeAlreadyCompletedException],
  ] as const)('%s → lỗi tương ứng', async (status, error) => {
    const { useCase } = make({ status, pledge: pledge() });
    await expect(
      useCase.handle({ userId: Donor, pledgeId: PledgeId }),
    ).rejects.toThrow(error);
  });
});

describe('danh sách', () => {
  it('công khai: ẩn tên → user null, không có note/transferContent, không lấy lời khai bị ẩn', async () => {
    const pledges = {
      listForCampaign: jest.fn().mockResolvedValue({
        rows: [row({ showNamePublicly: false }, 9), row({}, 8), row({}, 7)],
      }),
    };
    const projects = {
      findVisibleCampaignId: jest.fn().mockResolvedValue(CampaignId),
    };
    const result = await new ListCharityMoneyPledgesUseCase(
      projects as never,
      pledges as never,
    ).handle({
      idOrSlug: 'mua-dong-am',
      fundingNeedId: null,
      status: null,
      cursor: null,
      limit: 2,
    });
    expect(pledges.listForCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ includeHidden: false, limit: 3 }),
    );
    expect(result.pledges).toHaveLength(2);
    expect(result.pledges[0].user).toBeNull();
    expect(result.pledges[1].user?.username).toBe('donor');
    expect(result.pledges[0]).not.toHaveProperty('note');
    expect(result.pledges[0]).not.toHaveProperty('transferContent');
    expect(result.nextCursor).not.toBeNull();
  });

  it('dự án không công khai → 404; cursor hỏng → 400', async () => {
    const useCase = new ListCharityMoneyPledgesUseCase(
      { findVisibleCampaignId: jest.fn().mockResolvedValue(null) } as never,
      { listForCampaign: jest.fn() } as never,
    );
    const base = { fundingNeedId: null, status: null, limit: 20 };
    await expect(
      useCase.handle({ ...base, idOrSlug: 'x', cursor: null }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
    await expect(
      useCase.handle({ ...base, idOrSlug: 'x', cursor: '!!!' }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('của tôi: giữ hiddenAt/hiddenReason để app gắn nhãn "Đã bị ẩn"', async () => {
    const hiddenAt = new Date();
    const pledges = {
      listMine: jest.fn().mockResolvedValue({
        rows: [row({ hiddenAt, hiddenReason: 'Số tiền ảo' })],
      }),
    };
    const result = await new ListMyCharityMoneyPledgesUseCase(
      pledges as never,
    ).handle({ userId: Donor, campaignId: null, cursor: null, limit: 20 });
    expect(result.pledges[0]).toMatchObject({
      hiddenAt,
      hiddenReason: 'Số tiền ảo',
      campaign: { slug: 'mua-dong-am' },
    });
    expect(result.nextCursor).toBeNull();
  });
});

describe('SetCharityMoneyPledgeHiddenUseCase', () => {
  const make = (outcome: unknown) => {
    const access = {
      forOperate: jest.fn().mockResolvedValue({ campaign: campaign() }),
    } as unknown as CharityProjectAccess;
    const pledges = {
      findById: jest.fn().mockResolvedValue(pledge()),
      setHidden: jest.fn().mockResolvedValue(outcome),
      findRow: jest.fn().mockResolvedValue(row()),
    };
    const dispatch = { handle: jest.fn().mockResolvedValue(undefined) };
    const useCase = new SetCharityMoneyPledgeHiddenUseCase(
      access,
      pledges as never,
      new CharityMoneyPledgeNotifier(dispatch as never),
    );
    return { useCase, access, pledges, dispatch };
  };

  it('ẩn kèm lý do → báo người khai (tên chiến dịch, số tiền, lý do)', async () => {
    const hidden = pledge({
      hiddenAt: new Date(),
      hiddenBy: Owner,
      hiddenReason: 'Số tiền ảo',
    });
    const { useCase, pledges, dispatch, access } = make({
      status: 'UPDATED',
      pledge: hidden,
    });
    await useCase.handle({
      userId: Owner,
      pledgeId: PledgeId,
      hidden: true,
      reason: '  Số tiền ảo ',
    });
    expect(access.forOperate).toHaveBeenCalledWith({
      userId: Owner,
      campaignId: CampaignId,
    });
    expect(pledges.setHidden).toHaveBeenCalledWith({
      pledgeId: PledgeId,
      hidden: true,
      actorId: Owner,
      reason: 'Số tiền ảo',
    });
    const message = dispatch.handle.mock.calls[0][0];
    expect(message).toMatchObject({
      userId: Donor,
      type: NotificationTypes.CHARITY_MONEY_PLEDGE_HIDDEN,
      target: { id: CampaignId },
    });
    expect(message.body).toContain('Mùa đông ấm');
    expect(message.body).toContain('500.000đ');
    expect(message.body).toContain('Số tiền ảo');
  });

  it('bỏ ẩn → thông báo UNHIDDEN, lý do bỏ qua', async () => {
    const { useCase, pledges, dispatch } = make({
      status: 'UPDATED',
      pledge: pledge(),
    });
    await useCase.handle({
      userId: Owner,
      pledgeId: PledgeId,
      hidden: false,
      reason: 'bất kỳ',
    });
    expect(pledges.setHidden.mock.calls[0][0].reason).toBeNull();
    expect(dispatch.handle.mock.calls[0][0].type).toBe(
      NotificationTypes.CHARITY_MONEY_PLEDGE_UNHIDDEN,
    );
  });

  it('ẩn lần hai → 409; bỏ ẩn khi chưa ẩn → 409; sau khi kết thúc → LOCKED', async () => {
    const conflict = make({ status: 'CONFLICT', pledge: pledge() });
    await expect(
      conflict.useCase.handle({
        userId: Owner,
        pledgeId: PledgeId,
        hidden: true,
        reason: null,
      }),
    ).rejects.toThrow(CharityMoneyPledgeAlreadyHiddenException);
    await expect(
      conflict.useCase.handle({
        userId: Owner,
        pledgeId: PledgeId,
        hidden: false,
        reason: null,
      }),
    ).rejects.toThrow(CharityMoneyPledgeNotHiddenException);
    const locked = make({ status: 'LOCKED' });
    await expect(
      locked.useCase.handle({
        userId: Owner,
        pledgeId: PledgeId,
        hidden: true,
        reason: null,
      }),
    ).rejects.toThrow(CharityMoneyPledgeLockedException);
    expect(locked.dispatch.handle).not.toHaveBeenCalled();
  });

  it('lời khai không tồn tại → 404 trước khi kiểm quyền', async () => {
    const { useCase, pledges, access } = make({ status: 'UPDATED' });
    pledges.findById.mockResolvedValue(null);
    await expect(
      useCase.handle({
        userId: Owner,
        pledgeId: PledgeId,
        hidden: true,
        reason: null,
      }),
    ).rejects.toThrow(CharityMoneyPledgeNotFoundException);
    expect(access.forOperate).not.toHaveBeenCalled();
  });
});
