import {
  CharityContributionTypeDisabledException,
  CharityDistributionFieldRequiredException,
  CharityDistributionMethodMismatchException,
  CharityStageTransitionInvalidException,
  CharitySupportNeedClosedException,
  CharitySupportOfferInvalidStateException,
  CharitySupportOfferNotFoundException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  DecideCharitySupportOfferUseCase,
  GetCharityDistributionUseCase,
  OfferCharitySupportUseCase,
  PostponeCharityDistributionUseCase,
  SaveCharityDistributionEvidenceUseCase,
  SaveCharityDistributionUseCase,
  SaveCharitySupportNeedUseCase,
  WithdrawCharitySupportOfferUseCase,
} from './charity-operations.use-cases';
import { CharityProjectAccess } from './charity-project.use-cases';

const CampaignId = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2d001';
const Owner = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2d002';
const Helper = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2d003';
const Hour = 3_600_000;

function campaign(overrides: Partial<ICharityCampaign> = {}): ICharityCampaign {
  return {
    globalId: CampaignId,
    title: 'Mùa đông ấm',
    createdBy: Owner,
    approvalStatus: 'APPROVED',
    isActive: true,
    endTime: new Date(Date.now() + 30 * 24 * Hour),
    operationStage: 'EXECUTION',
    acceptedContributionTypes: ['MATERIAL', 'MONEY', 'SERVICE'],
    ...overrides,
  } as ICharityCampaign;
}

const need = (status = 'OPEN') => ({
  supportNeedId: 'n1',
  campaignId: CampaignId,
  status,
  external: { quantity: 0, evidenceUrls: [], note: null },
});

const offer = (status: string, overrides: Record<string, unknown> = {}) => ({
  offerId: 'o1',
  supportNeedId: 'n1',
  campaignId: CampaignId,
  user: { userId: Helper, username: 'h', fullName: null, avatarUrl: null },
  quantity: 4,
  status,
  decisionReason: null,
  ...overrides,
});

function make(current = campaign()) {
  const campaigns = {
    findByGlobalId: jest.fn(async () => current),
    isCampaignManager: jest.fn(async () => false),
  };
  const admin = { hasPermission: jest.fn(async () => false) };
  const operations = {
    findSupportNeed: jest.fn(async (): Promise<unknown> => need()),
    createSupportNeed: jest.fn(async (): Promise<unknown> => need()),
    updateSupportNeed: jest.fn(async (): Promise<unknown> => need()),
    createOffer: jest.fn(async (): Promise<unknown> => offer('PENDING')),
    findOffer: jest.fn(async (): Promise<unknown> => offer('PENDING')),
    transitionOffer: jest.fn(async (params: { to: string }): Promise<unknown> =>
      offer(params.to),
    ),
    getDistribution: jest.fn(async (): Promise<unknown> => null),
    saveDistribution: jest.fn(async (params: { distribution: unknown }) => ({
      campaignId: CampaignId,
      ...(params.distribution as object),
      evidenceUrls: [],
      updatedAt: new Date(),
    })),
    saveDistributionEvidence: jest.fn(
      async (params: { evidenceUrls: string[] }): Promise<unknown> => ({
        campaignId: CampaignId,
        evidenceUrls: params.evidenceUrls,
      }),
    ),
  };
  const projects = {
    findVisibleCampaignId: jest.fn(
      async (): Promise<string | null> => CampaignId,
    ),
    listPhases: jest.fn(async (): Promise<unknown[]> => [
      {
        phase: 'DISTRIBUTION',
        startsAt: new Date(Date.now() + 24 * Hour),
        endsAt: new Date(Date.now() + 30 * Hour),
      },
    ]),
    replacePhases: jest.fn(async (): Promise<unknown[]> => []),
    listBeneficiaryBankAccounts: jest.fn(async (): Promise<unknown[]> => []),
  };
  const notifier = { notify: jest.fn(async () => undefined) };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  return { campaigns, operations, projects, notifier, access };
}

const cmd = { userId: Owner, campaignId: CampaignId };

describe('Hỗ trợ mở', () => {
  it('nguồn ngoài app > 0 mà thiếu bằng chứng / không phải https → 400', async () => {
    const deps = make();
    const useCase = new SaveCharitySupportNeedUseCase(
      deps.access,
      deps.operations as never,
    );
    const base = {
      ...cmd,
      supportNeedId: 'n1',
      need: {
        supportType: 'TRANSPORT' as const,
        title: 'Xe 16 chỗ',
        description: null,
        unit: 'chuyến',
        targetQuantity: 2,
        startsAt: null,
        endsAt: null,
        locationLabel: null,
        requirements: null,
        handoverMethod: null,
        picName: null,
        picPhone: null,
        sortOrder: 0,
      },
    };
    await expect(
      useCase.handle({
        ...base,
        external: { quantity: 1, evidenceUrls: [], note: null },
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        ...base,
        external: { quantity: 1, evidenceUrls: ['http://x'], note: null },
      }),
    ).rejects.toThrow(ValidationFailedException);
    await useCase.handle({
      ...base,
      external: { quantity: 1, evidenceUrls: ['https://x/a.png'], note: null },
    });
    expect(deps.operations.updateSupportNeed).toHaveBeenCalled();
  });

  it('nhận hỗ trợ khi tắt SERVICE → 409', async () => {
    const deps = make(campaign({ acceptedContributionTypes: [] }));
    await expect(
      new OfferCharitySupportUseCase(
        deps.campaigns as never,
        deps.operations as never,
      ).handle({
        userId: Helper,
        campaignId: CampaignId,
        supportNeedId: 'n1',
        quantity: 1,
        note: null,
      }),
    ).rejects.toThrow(CharityContributionTypeDisabledException);
    expect(deps.operations.createOffer).not.toHaveBeenCalled();
  });

  it('nhận hỗ trợ: hạng mục đóng / dự án ở Tổng kết → chặn', async () => {
    const closed = make();
    closed.operations.findSupportNeed.mockResolvedValueOnce(need('CLOSED'));
    const offerCmd = {
      userId: Helper,
      campaignId: CampaignId,
      supportNeedId: 'n1',
      quantity: 1,
      note: null,
    };
    await expect(
      new OfferCharitySupportUseCase(
        closed.campaigns as never,
        closed.operations as never,
      ).handle(offerCmd),
    ).rejects.toThrow(CharitySupportNeedClosedException);
    const summary = make(campaign({ operationStage: 'SUMMARY' }));
    await expect(
      new OfferCharitySupportUseCase(
        summary.campaigns as never,
        summary.operations as never,
      ).handle(offerCmd),
    ).rejects.toThrow(CharitySupportNeedClosedException);
  });

  it('ghi hoàn thành: mặc định đủ số; vượt số đã nhận → 400; từ chối thiếu lý do → 400', async () => {
    const deps = make();
    deps.operations.findOffer.mockResolvedValue(offer('ACCEPTED'));
    const useCase = new DecideCharitySupportOfferUseCase(
      deps.access,
      deps.operations as never,
      deps.notifier as never,
    );
    await useCase.handle({
      ...cmd,
      offerId: 'o1',
      action: 'COMPLETE',
      reason: null,
      completedQuantity: null,
    });
    expect(deps.operations.transitionOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'COMPLETED', completedQuantity: 4 }),
    );
    expect(deps.notifier.notify).toHaveBeenCalled();
    await expect(
      useCase.handle({
        ...cmd,
        offerId: 'o1',
        action: 'COMPLETE',
        reason: null,
        completedQuantity: 5,
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        ...cmd,
        offerId: 'o1',
        action: 'REJECT',
        reason: ' ',
        completedQuantity: null,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('nhận lại đề nghị đã hoàn thành → 409', async () => {
    const deps = make();
    deps.operations.findOffer.mockResolvedValue(offer('COMPLETED'));
    await expect(
      new DecideCharitySupportOfferUseCase(
        deps.access,
        deps.operations as never,
        deps.notifier as never,
      ).handle({
        ...cmd,
        offerId: 'o1',
        action: 'ACCEPT',
        reason: null,
        completedQuantity: null,
      }),
    ).rejects.toThrow(CharitySupportOfferInvalidStateException);
  });

  it('rút đề nghị: của người khác → 404; đã hoàn thành → 409', async () => {
    const deps = make();
    const useCase = new WithdrawCharitySupportOfferUseCase(
      deps.operations as never,
    );
    await expect(
      useCase.handle({ userId: Owner, campaignId: CampaignId, offerId: 'o1' }),
    ).rejects.toThrow(CharitySupportOfferNotFoundException);
    deps.operations.findOffer.mockResolvedValueOnce(offer('COMPLETED'));
    await expect(
      useCase.handle({ userId: Helper, campaignId: CampaignId, offerId: 'o1' }),
    ).rejects.toThrow(CharitySupportOfferInvalidStateException);
    await useCase.handle({
      userId: Helper,
      campaignId: CampaignId,
      offerId: 'o1',
    });
    expect(deps.operations.transitionOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'WITHDRAWN' }),
    );
  });
});

describe('Hoãn bước trao', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new PostponeCharityDistributionUseCase(deps.access, deps.projects as never);

  it('dời về sau, giữ độ dài, ghi lý do vào lịch sử', async () => {
    const deps = make();
    const startsAt = new Date(Date.now() + 48 * Hour);
    await build(deps).handle({
      ...cmd,
      startsAt,
      endsAt: null,
      reason: 'Mưa lũ',
    });
    const call = deps.projects.replacePhases.mock.calls[0] as unknown as [
      {
        phases: { phase: string; startsAt: Date; endsAt: Date }[];
        reason: string;
      },
    ];
    const distribution = call[0].phases.find(
      (phase) => phase.phase === 'DISTRIBUTION',
    );
    expect(call[0].reason).toBe('Mưa lũ');
    expect(distribution?.endsAt.getTime()).toBe(startsAt.getTime() + 6 * Hour);
  });

  it('thiếu lý do / mốc sớm hơn → 400; đã ở Sự kiện trao → không hoãn được', async () => {
    await expect(
      build(make()).handle({
        ...cmd,
        startsAt: new Date(Date.now() + 48 * Hour),
        endsAt: null,
        reason: ' ',
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(make()).handle({
        ...cmd,
        startsAt: new Date(Date.now() + 2 * Hour),
        endsAt: null,
        reason: 'Sớm hơn',
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(make(campaign({ operationStage: 'EVENT' }))).handle({
        ...cmd,
        startsAt: new Date(Date.now() + 48 * Hour),
        endsAt: null,
        reason: 'Hoãn',
      }),
    ).rejects.toThrow(CharityStageTransitionInvalidException);
  });
});

describe('Hình thức trao cấp chiến dịch', () => {
  const blankPrivate = {
    beneficiaryBankAccountId: null,
    recipientName: null,
    recipientPhone: null,
    recipientAddress: null,
    coordinatorName: null,
    coordinatorPhone: null,
    carrier: null,
    shippingFeePayer: null,
    estimatedShippingFee: null,
    trackingCode: null,
    transferContent: null,
  };
  const save = (deps: ReturnType<typeof make>) =>
    new SaveCharityDistributionUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );

  it('PUT distribution SHIPPING thiếu carrier → 400 0x13_57', async () => {
    const deps = make();
    await expect(
      save(deps).handle({
        ...cmd,
        distribution: {
          distributionMethod: 'SHIPPING',
          contributionTypes: ['MATERIAL'],
          serviceType: null,
          serviceChannel: null,
          privateDetails: {
            ...blankPrivate,
            recipientName: 'Chị Lan',
            recipientPhone: '0901',
            recipientAddress: 'Xã A',
            shippingFeePayer: 'ORGANIZER',
            estimatedShippingFee: 30000,
          },
        },
      }),
    ).rejects.toBeInstanceOf(CharityDistributionFieldRequiredException);
    expect(deps.operations.saveDistribution).not.toHaveBeenCalled();
  });

  it('BANK_TRANSFER + [MATERIAL] → 400 0x13_58', async () => {
    const deps = make();
    await expect(
      save(deps).handle({
        ...cmd,
        distribution: {
          distributionMethod: 'BANK_TRANSFER',
          contributionTypes: ['MATERIAL'],
          serviceType: null,
          serviceChannel: null,
          privateDetails: { ...blankPrivate, transferContent: 'CT' },
        },
      }),
    ).rejects.toBeInstanceOf(CharityDistributionMethodMismatchException);
  });

  it('beneficiaryBankAccountId của chiến dịch khác → 400', async () => {
    const deps = make();
    deps.projects.listBeneficiaryBankAccounts.mockResolvedValue([
      { accountId: 'mine', validTo: null },
    ]);
    await expect(
      save(deps).handle({
        ...cmd,
        distribution: {
          distributionMethod: 'BANK_TRANSFER',
          contributionTypes: ['MONEY'],
          serviceType: null,
          serviceChannel: null,
          privateDetails: {
            ...blankPrivate,
            transferContent: 'CT',
            beneficiaryBankAccountId: 'someone-else',
          },
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.operations.saveDistribution).not.toHaveBeenCalled();
  });

  it('OTHER_LOCATION chỉ cần người phụ trách và lưu được', async () => {
    const deps = make();
    await save(deps).handle({
      ...cmd,
      distribution: {
        distributionMethod: 'OTHER_LOCATION',
        contributionTypes: ['MATERIAL'],
        serviceType: null,
        serviceChannel: null,
        privateDetails: { ...blankPrivate, coordinatorName: ' Anh Tư ' },
      },
    });
    expect(deps.operations.saveDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CampaignId,
        distribution: expect.objectContaining({
          privateDetails: expect.objectContaining({
            coordinatorName: 'Anh Tư',
          }),
        }),
      }),
    );
  });

  it('evidence http:// hoặc 21 URL hoặc trùng → 400', async () => {
    const deps = make();
    const useCase = new SaveCharityDistributionEvidenceUseCase(
      deps.access,
      deps.operations as never,
    );
    for (const evidenceUrls of [
      ['http://x.test/a.jpg'],
      Array.from({ length: 21 }, (_, i) => `https://x.test/${i}.jpg`),
      ['https://x.test/a.jpg', 'https://x.test/a.jpg'],
    ])
      await expect(
        useCase.handle({ ...cmd, evidenceUrls }),
      ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.operations.saveDistributionEvidence).not.toHaveBeenCalled();
    await useCase.handle({ ...cmd, evidenceUrls: ['https://x.test/a.jpg'] });
    expect(deps.operations.saveDistributionEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceUrls: ['https://x.test/a.jpg'] }),
    );
  });

  it('GET distribution trả chi tiết riêng tư cho workspace', async () => {
    const deps = make();
    deps.operations.getDistribution.mockResolvedValue({
      campaignId: CampaignId,
      privateDetails: { ...blankPrivate, recipientPhone: '0909' },
    });
    const result = await new GetCharityDistributionUseCase(
      deps.access,
      deps.operations as never,
    ).handle(cmd);
    expect(
      (result as { privateDetails: { recipientPhone: string } } | null)
        ?.privateDetails.recipientPhone,
    ).toBe('0909');
  });
});
