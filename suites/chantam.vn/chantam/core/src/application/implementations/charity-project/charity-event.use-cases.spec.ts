import {
  CharityCampaignNotFoundException,
  CharityEventContributorNotEligibleException,
  CharityEventStepNotFoundException,
  CharityPostForbiddenException,
  CharityPostMediaInvalidException,
  CharityPostQuotaExceededException,
  CharityProjectForbiddenException,
  CharityProjectNotApprovedException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  CharityPostAccess,
  CreateCharityPostUseCase,
  DeleteCharityPostUseCase,
  RequestCharityPostUploadUseCase,
  SetCharityEventContributorUseCase,
  UpdateCharityEventStepUseCase,
} from './charity-event.use-cases';
import { CharityProjectAccess } from './charity-project.use-cases';

const CampaignId = '1f7c0a52-61a6-4a43-9d4e-6a0cf1f2b001';
const Owner = '1f7c0a52-61a6-4a43-9d4e-6a0cf1f2b002';
const Volunteer = '1f7c0a52-61a6-4a43-9d4e-6a0cf1f2b003';
const Stranger = '1f7c0a52-61a6-4a43-9d4e-6a0cf1f2b004';

function campaign(overrides: Partial<ICharityCampaign> = {}): ICharityCampaign {
  const now = Date.now();
  return {
    globalId: CampaignId,
    title: 'Mùa đông ấm',
    slug: 'mua-dong-am',
    endTime: new Date(now + 10 * 86_400_000),
    isActive: true,
    approvalStatus: 'APPROVED',
    createdBy: Owner,
    operationStage: 'EVENT',
    ...overrides,
  } as ICharityCampaign;
}

function make(
  options: { campaign?: ICharityCampaign; contributor?: boolean } = {},
) {
  const current = options.campaign ?? campaign();
  const campaigns = {
    findByGlobalId: jest.fn(async () => current),
    isCampaignManager: jest.fn(async () => false),
  };
  const admin = {
    hasPermission: jest.fn(async () => false),
    getConfigValue: jest.fn(async () => 2),
  };
  const events = {
    isActiveContributor: jest.fn(async () => options.contributor ?? false),
    isEligibleContributor: jest.fn(async () => false),
    setContributor: jest.fn(async () => null as unknown),
    ensureEventSteps: jest.fn(async () => undefined),
    updateEventStep: jest.fn(async (): Promise<unknown> => null),
    reserveUpload: jest.fn(
      async (params: { sign: () => Promise<unknown> }): Promise<unknown> => ({
        status: 'RESERVED',
        upload: await params.sign(),
      }),
    ),
    usedUploads: jest.fn(async () => ({ IMAGE: 1, VIDEO: 0 })),
    createPost: jest.fn(async (): Promise<unknown> => ({ postId: 'p1' })),
    findPost: jest.fn(async (): Promise<unknown> => null),
    deletePost: jest.fn(async () => true),
  };
  const storage = {
    createCampaignMediaUpload: jest.fn(async () => ({
      key: 'users/x/campaign-media/a.webp',
      uploadUrl: 'https://upload',
      publicUrl: 'https://cdn/a.webp',
      expiresInSeconds: 300,
    })),
    confirmCampaignMediaUpload: jest.fn(async () => ({
      mediaType: 'IMAGE' as const,
      publicUrl: 'https://cdn/a.webp',
    })),
  };
  const realtime = { signal: jest.fn() };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  const postAccess = new CharityPostAccess(
    campaigns as never,
    events as never,
    admin as never,
  );
  return { campaigns, admin, events, storage, realtime, access, postAccess };
}

describe('CharityPostAccess', () => {
  it('người dùng thường không phải cộng tác viên: không đăng được (nhưng không 404 dự án đã duyệt)', async () => {
    const deps = make();
    await expect(
      deps.postAccess.resolve(CampaignId, Stranger),
    ).resolves.toMatchObject({ role: null, isModerator: false });
  });

  it('cộng tác viên trong Sự kiện trao → PARTICIPANT; ngoài Sự kiện trao → null', async () => {
    expect(
      (
        await make({ contributor: true }).postAccess.resolve(
          CampaignId,
          Volunteer,
        )
      ).role,
    ).toBe('PARTICIPANT');
    expect(
      (
        await make({
          contributor: true,
          campaign: campaign({ operationStage: 'SUMMARY' }),
        }).postAccess.resolve(CampaignId, Volunteer)
      ).role,
    ).toBeNull();
  });

  it('dự án chưa duyệt, người lạ → 404', async () => {
    await expect(
      make({
        campaign: campaign({ approvalStatus: 'PENDING_APPROVAL' }),
      }).postAccess.resolve(CampaignId, Stranger),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });
});

describe('Ký đường tải bài', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new RequestCharityPostUploadUseCase(
      deps.postAccess,
      deps.events as never,
      deps.admin as never,
      deps.storage as never,
    );
  const command = {
    userId: Owner,
    campaignId: CampaignId,
    contentType: 'image/webp',
    contentLength: 1000,
  };

  it('không có quyền đăng → chặn TRƯỚC khi ký', async () => {
    const deps = make();
    await expect(
      build(deps).handle({ ...command, userId: Stranger }),
    ).rejects.toThrow(CharityPostForbiddenException);
    expect(deps.storage.createCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it('không phải ảnh/video → 400', async () => {
    await expect(
      build(make()).handle({ ...command, contentType: 'application/pdf' }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('hết quota → lỗi kèm loại và giới hạn từ cấu hình', async () => {
    const deps = make();
    deps.events.reserveUpload.mockResolvedValueOnce({
      status: 'QUOTA_EXCEEDED',
      used: 2,
    });
    await expect(build(deps).handle(command)).rejects.toThrow(
      CharityPostQuotaExceededException,
    );
  });

  it('còn suất → ký, trả số đã dùng; quota là theo dự án + người + đầu ngày VN', async () => {
    const deps = make();
    const result = await build(deps).handle(command);
    expect(result.quota).toEqual({ mediaType: 'IMAGE', used: 1, limit: 2 });
    const call = deps.events.reserveUpload.mock.calls[0][0] as unknown as {
      campaignId: string;
      userId: string;
      quota: number;
      since: Date;
    };
    expect(call).toMatchObject({
      campaignId: CampaignId,
      userId: Owner,
      quota: 2,
    });
    expect(call.since.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('Đăng bài', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new CreateCharityPostUseCase(
      deps.postAccess,
      deps.events as never,
      deps.storage as never,
      deps.realtime,
    );

  it('không nội dung, không tệp → 400', async () => {
    await expect(
      build(make()).handle({
        userId: Owner,
        campaignId: CampaignId,
        body: '   ',
        mediaKeys: [],
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('tệp không phải lượt ký còn mới → MEDIA_INVALID, không phát tín hiệu', async () => {
    const deps = make();
    deps.events.createPost.mockResolvedValueOnce('MEDIA_INVALID');
    await expect(
      build(deps).handle({
        userId: Owner,
        campaignId: CampaignId,
        body: null,
        mediaKeys: ['k1', 'k1'],
      }),
    ).rejects.toThrow(CharityPostMediaInvalidException);
    expect(deps.storage.confirmCampaignMediaUpload).toHaveBeenCalledTimes(1);
    expect(deps.realtime.signal).not.toHaveBeenCalled();
  });

  it('ban tổ chức đăng: vai ORGANIZER, giai đoạn lúc đăng, phát POSTS', async () => {
    const deps = make();
    await build(deps).handle({
      userId: Owner,
      campaignId: CampaignId,
      body: ' Đã tới nơi ',
      mediaKeys: [],
    });
    expect(deps.events.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        authorRole: 'ORGANIZER',
        stage: 'EVENT',
        body: 'Đã tới nơi',
      }),
    );
    expect(deps.realtime.signal).toHaveBeenCalledWith(
      CampaignId,
      ['POSTS'],
      'public',
    );
  });
});

describe('Gỡ bài', () => {
  const post = {
    postId: 'p1',
    campaignId: CampaignId,
    author: { userId: Volunteer },
    deletedAt: null,
  };

  it('người khác không phải ban tổ chức → không có quyền; tác giả → được', async () => {
    const deps = make();
    deps.events.findPost.mockResolvedValue(post);
    const useCase = new DeleteCharityPostUseCase(
      deps.postAccess,
      deps.events as never,
      deps.realtime,
    );
    await expect(
      useCase.handle({
        userId: Stranger,
        campaignId: CampaignId,
        postId: 'p1',
      }),
    ).rejects.toThrow(CharityProjectForbiddenException);
    await expect(
      useCase.handle({
        userId: Volunteer,
        campaignId: CampaignId,
        postId: 'p1',
      }),
    ).resolves.toEqual({ deleted: true });
  });
});

describe('Cộng tác viên và timeline', () => {
  it('cấp cho người không đủ điều kiện → lỗi; thu hồi người chưa từng cấp → lỗi', async () => {
    const deps = make();
    const useCase = new SetCharityEventContributorUseCase(
      deps.access,
      deps.events as never,
      deps.realtime,
    );
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        targetUserId: Volunteer,
        active: true,
      }),
    ).rejects.toThrow(CharityEventContributorNotEligibleException);
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        targetUserId: Volunteer,
        active: false,
      }),
    ).rejects.toThrow(CharityEventContributorNotEligibleException);
  });

  it('timeline: dự án chưa duyệt → lỗi; bước không có → 404; cập nhật phát TIMELINE', async () => {
    const pending = make({
      campaign: campaign({ approvalStatus: 'PENDING_APPROVAL' }),
    });
    await expect(
      new UpdateCharityEventStepUseCase(
        pending.access,
        pending.events as never,
        pending.realtime,
      ).handle({
        userId: Owner,
        campaignId: CampaignId,
        stepId: 's',
        patch: {},
      }),
    ).rejects.toThrow(CharityProjectNotApprovedException);

    const deps = make();
    const useCase = new UpdateCharityEventStepUseCase(
      deps.access,
      deps.events as never,
      deps.realtime,
    );
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        stepId: 's',
        patch: {},
      }),
    ).rejects.toThrow(CharityEventStepNotFoundException);
    deps.events.updateEventStep.mockResolvedValueOnce({
      stepId: 's',
      stepKey: 'DISTRIBUTE',
      status: 'DONE',
    });
    const step = await useCase.handle({
      userId: Owner,
      campaignId: CampaignId,
      stepId: 's',
      patch: { status: 'DONE', note: '  ' },
    });
    expect(step.label).toBe('Trao quà');
    expect(deps.events.updateEventStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ patch: { status: 'DONE', note: null } }),
    );
    expect(deps.realtime.signal).toHaveBeenCalledWith(
      CampaignId,
      ['TIMELINE'],
      'public',
    );
  });
});
