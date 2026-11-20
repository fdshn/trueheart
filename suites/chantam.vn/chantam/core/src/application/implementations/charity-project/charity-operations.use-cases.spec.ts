import {
  CharityBeneficiaryAccountNotVerifiedException,
  CharityContributionTypeDisabledException,
  CharityDistributionFieldRequiredException,
  CharityDistributionMethodMismatchException,
  CharityRoundEvidenceRequiredException,
  CharityRoundInvalidStateException,
  CharityStageTransitionInvalidException,
  CharitySupportNeedClosedException,
  CharitySupportOfferInvalidStateException,
  CharitySupportOfferNotFoundException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { charityRoundWarnings } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  DecideCharitySupportOfferUseCase,
  ListCharityRoundsUseCase,
  ManageCharityRoundsUseCase,
  OfferCharitySupportUseCase,
  PostponeCharityDistributionUseCase,
  SaveCharityRoundUseCase,
  SaveCharitySupportNeedUseCase,
  SetCharityRoundReadinessUseCase,
  SetCharityRoundStatusUseCase,
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

const round = (overrides: Record<string, unknown> = {}) => ({
  roundId: 'r1',
  campaignId: CampaignId,
  title: 'Đợt 1',
  distributionMethod: null,
  contributionTypes: [],
  evidenceUrls: [],
  locationLabel: 'Xã A',
  address: null,
  lat: null,
  lng: null,
  needsReview: false,
  serviceType: null,
  serviceChannel: null,
  privateDetails: {
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
  },
  startsAt: new Date(Date.now() + 72 * Hour),
  endsAt: new Date(Date.now() + 80 * Hour),
  status: 'PLANNED',
  readiness: 'PENDING',
  checklist: [],
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
    findRound: jest.fn(async (): Promise<unknown> => round()),
    listRounds: jest.fn(async (): Promise<unknown[]> => [round()]),
    createRound: jest.fn(async (): Promise<unknown> => round()),
    updateRound: jest.fn(async (): Promise<unknown> => round()),
    setRoundStatus: jest.fn(async (): Promise<unknown> => round()),
    setRoundReadiness: jest.fn(async (): Promise<unknown> => round()),
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

describe('Đợt trao', () => {
  it('create and PATCH force needsReview false', async () => {
    const created = make();
    const createUseCase = new SaveCharityRoundUseCase(
      created.access,
      created.operations as never,
      created.projects as never,
    );
    await createUseCase.handle({
      ...cmd,
      roundId: null,
      reason: null,
      round: { ...round(), needsReview: true },
    });
    expect(created.operations.createRound).toHaveBeenCalledWith(
      expect.objectContaining({
        round: expect.objectContaining({ needsReview: false }),
      }),
    );

    const updated = make();
    const updateUseCase = new SaveCharityRoundUseCase(
      updated.access,
      updated.operations as never,
      updated.projects as never,
    );
    await updateUseCase.handle({
      ...cmd,
      roundId: 'r1',
      reason: null,
      round: { ...round(), needsReview: true },
    });
    expect(updated.operations.updateRound).toHaveBeenCalledWith(
      expect.objectContaining({
        round: expect.objectContaining({ needsReview: false }),
      }),
    );
  });

  it('SHIPPING moves supplied address into private recipient address', async () => {
    const deps = make();
    const useCase = new SaveCharityRoundUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    await useCase.handle({
      ...cmd,
      roundId: null,
      reason: null,
      round: {
        ...round(),
        distributionMethod: 'SHIPPING',
        contributionTypes: ['MATERIAL'],
        address: 'Địa chỉ giao kín',
        privateDetails: {
          ...round().privateDetails,
          recipientName: 'Người nhận',
          recipientPhone: '0901',
          recipientAddress: null,
          carrier: 'Nhà xe',
          shippingFeePayer: 'ORGANIZER',
          estimatedShippingFee: 10_000,
        },
      },
    });
    expect(deps.operations.createRound).toHaveBeenCalledWith(
      expect.objectContaining({
        round: expect.objectContaining({
          address: null,
          privateDetails: expect.objectContaining({
            recipientAddress: 'Địa chỉ giao kín',
          }),
        }),
      }),
    );
  });

  it('workspace round view keeps private recipient phone', async () => {
    const deps = make();
    deps.operations.listRounds.mockResolvedValue([
      round({
        privateDetails: {
          ...round().privateDetails,
          recipientPhone: '0909876543',
        },
      }),
    ]);
    const [result] = await new ManageCharityRoundsUseCase(
      deps.access,
      deps.operations as never,
    ).handle(cmd);
    expect(result.privateDetails?.recipientPhone).toBe('0909876543');
  });

  it('lưu hình thức trao: thiếu carrier SHIPPING / BANK_TRANSFER không có MONEY → mã nghiệp vụ 400', async () => {
    const deps = make();
    const useCase = new SaveCharityRoundUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    const base = {
      ...cmd,
      roundId: null,
      reason: null,
      round: {
        title: 'Đợt 1',
        distributionMethod: 'SHIPPING' as const,
        contributionTypes: ['MATERIAL'] as const,
        evidenceUrls: [],
        locationLabel: null,
        address: 'Địa chỉ riêng',
        lat: null,
        lng: null,
        needsReview: true,
        serviceType: null,
        serviceChannel: null,
        privateDetails: {
          ...round().privateDetails,
          recipientName: 'Người nhận',
          recipientPhone: '0901',
          recipientAddress: 'Địa chỉ riêng',
          shippingFeePayer: 'ORGANIZER' as const,
          estimatedShippingFee: 10_000,
        },
        startsAt: new Date(Date.now() + 72 * Hour),
        endsAt: new Date(Date.now() + 80 * Hour),
      },
    };
    await expect(useCase.handle(base)).rejects.toThrow(
      CharityDistributionFieldRequiredException,
    );
    await expect(useCase.handle(base)).rejects.toThrow('carrier');
    await expect(
      useCase.handle({
        ...base,
        round: {
          ...base.round,
          distributionMethod: 'BANK_TRANSFER',
          contributionTypes: ['MATERIAL'],
          privateDetails: {
            ...base.round.privateDetails,
            transferContent: 'CT',
          },
        },
      }),
    ).rejects.toThrow(CharityDistributionMethodMismatchException);
  });

  it('DIRECT_RECIPIENT moves public address to private recipient address', async () => {
    const deps = make();
    const useCase = new SaveCharityRoundUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    await useCase.handle({
      ...cmd,
      roundId: null,
      reason: null,
      round: {
        ...round(),
        distributionMethod: 'DIRECT_RECIPIENT',
        contributionTypes: ['MATERIAL'],
        address: 'Địa chỉ riêng',
        needsReview: true,
        privateDetails: {
          ...round().privateDetails,
          recipientAddress: null,
          coordinatorName: 'Điều phối',
          coordinatorPhone: '0902',
        },
      },
    });
    expect(deps.operations.createRound).toHaveBeenCalledWith(
      expect.objectContaining({
        round: expect.objectContaining({
          address: null,
          privateDetails: expect.objectContaining({
            recipientAddress: 'Địa chỉ riêng',
          }),
        }),
      }),
    );
  });

  it('rejects invalid, duplicate, or excessive evidence URLs', async () => {
    const deps = make();
    const useCase = new SaveCharityRoundUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    const base = {
      ...cmd,
      roundId: null,
      reason: null,
      round: { ...round(), evidenceUrls: ['http://not-secure'] },
    };
    await expect(useCase.handle(base)).rejects.toThrow(
      ValidationFailedException,
    );
    await expect(
      useCase.handle({
        ...base,
        round: { ...base.round, evidenceUrls: ['https://a', 'https://a'] },
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        ...base,
        round: {
          ...base.round,
          evidenceUrls: Array.from(
            { length: 21 },
            (_, index) => `https://e/${index}`,
          ),
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('public round view excludes private data while workspace retains it', async () => {
    const deps = make();
    const privateRound = round({
      distributionMethod: 'SHIPPING',
      address: 'Địa chỉ bí mật',
      needsReview: true,
      privateDetails: {
        ...round().privateDetails,
        recipientPhone: '0909',
        recipientAddress: 'Địa chỉ bí mật',
      },
    });
    deps.operations.listRounds = jest.fn(async () => [privateRound]);
    deps.projects.findVisibleCampaignId = jest.fn(async () => CampaignId);
    const result = await new ListCharityRoundsUseCase(
      deps.projects as never,
      deps.operations as never,
    ).handle({ idOrSlug: 'slug' });
    expect(result[0].address).toBeNull();
    expect(Object.keys(result[0])).not.toContain('privateDetails');
    expect(Object.keys(result[0])).not.toContain('needsReview');
    expect(JSON.stringify(result)).not.toContain('0909');
    expect(JSON.stringify(result)).not.toContain('Địa chỉ bí mật');
  });

  it('public OTHER_LOCATION keeps address and coordinates', async () => {
    const deps = make();
    deps.operations.listRounds = jest.fn(async () => [
      round({
        distributionMethod: 'OTHER_LOCATION',
        address: 'Điểm trao',
        lat: 10.1,
        lng: 106.2,
      }),
    ]);
    deps.projects.findVisibleCampaignId = jest.fn(async () => CampaignId);
    const [result] = await new ListCharityRoundsUseCase(
      deps.projects as never,
      deps.operations as never,
    ).handle({ idOrSlug: 'slug' });
    expect(result).toEqual(
      expect.objectContaining({ address: 'Điểm trao', lat: 10.1, lng: 106.2 }),
    );
  });

  it('DONE SHIPPING missing tracking code fails before status is saved, legacy null method needs no evidence', async () => {
    const deps = make();
    deps.operations.findRound.mockResolvedValueOnce(
      round({
        distributionMethod: 'SHIPPING',
        evidenceUrls: ['https://e'],
        privateDetails: { ...round().privateDetails, trackingCode: null },
      }),
    );
    const useCase = new SetCharityRoundStatusUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    await expect(
      useCase.handle({ ...cmd, roundId: 'r1', status: 'DONE', reason: null }),
    ).rejects.toThrow(CharityRoundEvidenceRequiredException);
    expect(deps.operations.setRoundStatus).not.toHaveBeenCalled();
    deps.operations.findRound.mockResolvedValueOnce(
      round({ distributionMethod: null }),
    );
    await useCase.handle({
      ...cmd,
      roundId: 'r1',
      status: 'DONE',
      reason: null,
    });
    expect(deps.operations.setRoundStatus).toHaveBeenCalled();
  });

  it('đổi giờ đợt của dự án đã duyệt: bắt buộc lý do, có lý do thì báo người của đợt', async () => {
    const deps = make();
    const useCase = new SaveCharityRoundUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    const moved = {
      ...cmd,
      roundId: 'r1',
      round: {
        title: 'Đợt 1',
        distributionMethod: null,
        contributionTypes: [],
        evidenceUrls: [],
        locationLabel: 'Xã A',
        address: null,
        lat: null,
        lng: null,
        needsReview: false,
        serviceType: null,
        serviceChannel: null,
        privateDetails: {
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
        },
        startsAt: new Date(Date.now() + 96 * Hour),
        endsAt: new Date(Date.now() + 100 * Hour),
      },
    };
    await expect(useCase.handle({ ...moved, reason: null })).rejects.toThrow(
      ValidationFailedException,
    );
    await useCase.handle({ ...moved, reason: 'Đường sạt lở' });
    expect(deps.operations.updateRound).toHaveBeenCalledWith(
      expect.objectContaining({ announce: true, reason: 'Đường sạt lở' }),
    );
  });

  const bankRound = (beneficiaryBankAccountId: string | null) =>
    round({
      distributionMethod: 'BANK_TRANSFER',
      contributionTypes: ['MONEY'],
      evidenceUrls: ['https://e'],
      privateDetails: {
        ...round().privateDetails,
        beneficiaryBankAccountId,
        transferContent: 'CT',
      },
    });
  const beneficiaryAccount = (overrides: Record<string, unknown> = {}) => ({
    accountId: 'acc-1',
    holderType: 'OWNER',
    partyId: null,
    bankName: 'VCB',
    accountNo: '0123456789',
    accountName: 'NGUYEN VAN DUC',
    validFrom: new Date(),
    validTo: null,
    closeReason: null,
    verifiedAt: null,
    verifiedBy: null,
    ...overrides,
  });

  it('lưu đợt BANK_TRANSFER: tài khoản gắn phải đang hiệu lực của dự án này', async () => {
    const deps = make();
    const useCase = new SaveCharityRoundUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    const save = (beneficiaryBankAccountId: string | null) =>
      useCase.handle({
        ...cmd,
        roundId: null,
        reason: null,
        round: bankRound(beneficiaryBankAccountId) as never,
      });
    deps.projects.listBeneficiaryBankAccounts.mockResolvedValue([
      beneficiaryAccount({ accountId: 'closed', validTo: new Date() }),
      beneficiaryAccount({ accountId: 'live' }),
    ]);
    for (const accountId of ['other-campaign', 'closed'])
      await expect(save(accountId)).rejects.toThrow(ValidationFailedException);
    expect(deps.operations.createRound).not.toHaveBeenCalled();
    expect(deps.projects.listBeneficiaryBankAccounts).toHaveBeenCalledWith(
      CampaignId,
    );
    await save('live');
    await save(null);
    expect(
      deps.operations.createRound.mock.calls.map(
        (call) =>
          (call as unknown as [{ round: ReturnType<typeof round> }])[0].round
            .privateDetails.beneficiaryBankAccountId,
      ),
    ).toEqual(['live', null]);
  });

  it('DONE BANK_TRANSFER: chưa gắn / chưa xác thực / tài khoản dự án khác / đã bị thay → 409 0x13_5b', async () => {
    const deps = make();
    const useCase = new SetCharityRoundStatusUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    );
    deps.projects.listBeneficiaryBankAccounts.mockResolvedValue([
      beneficiaryAccount({ accountId: 'unverified' }),
      beneficiaryAccount({
        accountId: 'replaced',
        validTo: new Date(),
        closeReason: 'Đổi tài khoản',
        verifiedAt: new Date(),
        verifiedBy: Owner,
      }),
    ]);
    for (const accountId of [
      null,
      'unverified',
      'other-campaign',
      'replaced',
    ]) {
      deps.operations.findRound.mockResolvedValueOnce(bankRound(accountId));
      const failure = useCase
        .handle({ ...cmd, roundId: 'r1', status: 'DONE', reason: null })
        .catch((error: unknown) => error);
      await expect(failure).resolves.toBeInstanceOf(
        CharityBeneficiaryAccountNotVerifiedException,
      );
      await expect(failure).resolves.toMatchObject({ code: 0x13_5b });
    }
    expect(deps.operations.setRoundStatus).not.toHaveBeenCalled();
    expect(deps.projects.listBeneficiaryBankAccounts).toHaveBeenCalledWith(
      CampaignId,
    );
  });

  it('DONE BANK_TRANSFER: tài khoản đã xác thực + đủ bằng chứng → DONE', async () => {
    const deps = make();
    deps.projects.listBeneficiaryBankAccounts.mockResolvedValue([
      beneficiaryAccount({ verifiedAt: new Date(), verifiedBy: Owner }),
    ]);
    deps.operations.findRound.mockResolvedValueOnce(bankRound('acc-1'));
    await new SetCharityRoundStatusUseCase(
      deps.access,
      deps.operations as never,
      deps.projects as never,
    ).handle({ ...cmd, roundId: 'r1', status: 'DONE', reason: null });
    expect(deps.operations.setRoundStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DONE' }),
    );
  });

  it('huỷ đợt thiếu lý do → 400; đợt đã huỷ → không sửa được', async () => {
    const deps = make();
    await expect(
      new SetCharityRoundStatusUseCase(
        deps.access,
        deps.operations as never,
        deps.projects as never,
      ).handle({ ...cmd, roundId: 'r1', status: 'CANCELLED', reason: null }),
    ).rejects.toThrow(ValidationFailedException);
    deps.operations.findRound.mockResolvedValueOnce(
      round({ status: 'CANCELLED' }),
    );
    await expect(
      new SetCharityRoundReadinessUseCase(
        deps.access,
        deps.operations as never,
      ).handle({
        ...cmd,
        roundId: 'r1',
        readiness: 'READY',
        note: null,
        checklist: [],
      }),
    ).rejects.toThrow(CharityRoundInvalidStateException);
  });

  it('chưa sẵn sàng phải có ghi chú; checklist gộp với mục cũ', async () => {
    const deps = make();
    const useCase = new SetCharityRoundReadinessUseCase(
      deps.access,
      deps.operations as never,
    );
    await expect(
      useCase.handle({
        ...cmd,
        roundId: 'r1',
        readiness: 'NOT_READY',
        note: null,
        checklist: [],
      }),
    ).rejects.toThrow(ValidationFailedException);
    await useCase.handle({
      ...cmd,
      roundId: 'r1',
      readiness: 'READY',
      note: null,
      checklist: [{ key: 'TRANSPORT', done: true }],
    });
    const call = deps.operations.setRoundReadiness.mock.calls[0] as unknown as [
      { checklist: { key: string; done: boolean }[] },
    ];
    expect(call[0].checklist).toHaveLength(6);
    expect(
      call[0].checklist.find((item) => item.key === 'TRANSPORT')?.done,
    ).toBe(true);
  });

  it('cảnh báo trước 48 giờ: chưa xác nhận + checklist chưa xong; xa hơn 48 giờ thì không', () => {
    const now = new Date();
    const soon = {
      status: 'PLANNED' as const,
      startsAt: new Date(now.getTime() + 24 * Hour),
      readiness: 'PENDING' as const,
      checklist: [{ key: 'TRANSPORT' as const, done: false, note: null }],
      now,
    };
    expect(charityRoundWarnings(soon)).toEqual([
      'READINESS_NOT_CONFIRMED',
      'CHECKLIST_INCOMPLETE',
    ]);
    expect(
      charityRoundWarnings({
        ...soon,
        startsAt: new Date(now.getTime() + 72 * Hour),
      }),
    ).toEqual([]);
    expect(
      charityRoundWarnings({
        ...soon,
        readiness: 'NOT_READY',
        startsAt: new Date(now.getTime() + 72 * Hour),
      }),
    ).toEqual(['NOT_READY']);
  });
});
