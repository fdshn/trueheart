import {
  CharityContributionNotFoundException,
  CharityDisputeAlreadyOpenException,
  CharityDisputeInvalidStateException,
  CharityDisputeNotAllowedException,
} from '@/domain/exceptions';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  CloseCharityDisputeUseCase,
  OpenCharityDisputeUseCase,
} from './charity-dispute.use-cases';

const Owner = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e001';
const Giver = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e002';
const Coordinator = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e003';
const Stranger = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e004';
const Admin = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2e005';

const parties = (status = 'ACCEPTED') => ({
  contributionId: 'c1',
  campaignId: 'p1',
  campaignTitle: 'Mùa đông ấm',
  campaignCreatedBy: Owner,
  contributorId: Giver,
  status,
});

const dispute = (overrides: Record<string, unknown> = {}) => ({
  disputeId: 'd1',
  campaignId: 'p1',
  contributionId: 'c1',
  contributorId: Giver,
  openedBy: Giver,
  openedByParty: 'CONTRIBUTOR',
  reason: 'QUANTITY_MISMATCH',
  status: 'OPEN',
  resolution: null,
  ...overrides,
});

function make() {
  const operations = {
    findContributionParties: jest.fn(async (): Promise<unknown> => parties()),
    openDispute: jest.fn(async (): Promise<unknown> => dispute()),
    findDispute: jest.fn(async (): Promise<unknown> => dispute()),
    closeDispute: jest.fn(
      async (params: { to: string; resolution: string | null }) =>
        dispute({ status: params.to, resolution: params.resolution }),
    ),
  };
  const campaigns = {
    isCampaignManager: jest.fn(
      async (_campaign: string, userId: string) => userId === Coordinator,
    ),
  };
  const admin = {
    hasPermission: jest.fn(async (userId: string) => userId === Admin),
  };
  const notifier = { notify: jest.fn(async () => undefined) };
  return { operations, campaigns, admin, notifier };
}

const openCmd = {
  userId: Giver,
  contributionId: 'c1',
  reason: 'QUANTITY_MISMATCH' as const,
  description: 'Tôi gửi 20 áo, biên nhận ghi 15',
  evidenceUrls: ['https://cdn.test/bien-nhan.png'],
};

describe('Mở tranh chấp', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new OpenCharityDisputeUseCase(
      deps.operations as never,
      deps.campaigns as never,
      deps.notifier as never,
    );

  it('người đóng góp mở → bên CONTRIBUTOR, báo bên kia', async () => {
    const deps = make();
    await build(deps).handle(openCmd);
    expect(deps.operations.openDispute).toHaveBeenCalledWith(
      expect.objectContaining({ party: 'CONTRIBUTOR', campaignId: 'p1' }),
    );
    expect(deps.notifier.notify).toHaveBeenCalled();
  });

  it('coordinator mở → bên ORGANIZER; người ngoài → 404', async () => {
    const deps = make();
    await build(deps).handle({ ...openCmd, userId: Coordinator });
    expect(deps.operations.openDispute).toHaveBeenCalledWith(
      expect.objectContaining({ party: 'ORGANIZER' }),
    );
    await expect(
      build(deps).handle({ ...openCmd, userId: Stranger }),
    ).rejects.toThrow(CharityContributionNotFoundException);
  });

  it('đóng góp chưa được chấp nhận → không mở được; mô tả ngắn / bằng chứng http → 400', async () => {
    const deps = make();
    deps.operations.findContributionParties.mockResolvedValueOnce(
      parties('PENDING_REVIEW'),
    );
    await expect(build(deps).handle(openCmd)).rejects.toThrow(
      CharityDisputeNotAllowedException,
    );
    await expect(
      build(deps).handle({ ...openCmd, description: 'ngắn' }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(deps).handle({ ...openCmd, evidenceUrls: ['http://x'] }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('đã có tranh chấp mở → 409', async () => {
    const deps = make();
    deps.operations.openDispute.mockResolvedValueOnce('ALREADY_OPEN');
    await expect(build(deps).handle(openCmd)).rejects.toThrow(
      CharityDisputeAlreadyOpenException,
    );
  });
});

describe('Giải quyết / rút tranh chấp', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new CloseCharityDisputeUseCase(
      deps.operations as never,
      deps.campaigns as never,
      deps.admin as never,
      deps.notifier as never,
    );
  const close = {
    disputeId: 'd1',
    action: 'RESOLVE' as const,
    resolution: 'Đếm lại kho: đủ 20 áo, đã sửa biên nhận',
  };

  it('bên kia (ban tổ chức) giải quyết, kèm kết luận', async () => {
    const deps = make();
    const result = await build(deps).handle({ ...close, userId: Owner });
    expect(result.status).toBe('RESOLVED');
    expect(deps.notifier.notify).toHaveBeenCalled();
  });

  it('người mở không tự kết luận; Admin thì được', async () => {
    const deps = make();
    await expect(
      build(deps).handle({ ...close, userId: Giver }),
    ).rejects.toThrow(CharityDisputeNotAllowedException);
    await build(deps).handle({ ...close, userId: Admin });
    expect(deps.operations.closeDispute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'RESOLVED', actorId: Admin }),
    );
  });

  it('thiếu kết luận → 400; rút chỉ người mở; đã đóng → 409', async () => {
    const deps = make();
    await expect(
      build(deps).handle({ ...close, userId: Owner, resolution: ' ' }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(deps).handle({
        disputeId: 'd1',
        action: 'WITHDRAW',
        resolution: null,
        userId: Owner,
      }),
    ).rejects.toThrow(CharityDisputeNotAllowedException);
    await build(deps).handle({
      disputeId: 'd1',
      action: 'WITHDRAW',
      resolution: null,
      userId: Giver,
    });
    expect(deps.operations.closeDispute).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'WITHDRAWN', resolution: null }),
    );
    deps.operations.findDispute.mockResolvedValueOnce(
      dispute({ status: 'RESOLVED' }),
    );
    await expect(
      build(deps).handle({ ...close, userId: Owner }),
    ).rejects.toThrow(CharityDisputeInvalidStateException);
  });
});
