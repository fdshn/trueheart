import {
  CharityCampaignCreateNotAllowedException,
  CharityNotOrganizerException,
  CharityReviewNotPermittedException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityCampaignRepository,
  IEntitlementRepository,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CreateCharityCampaignUseCase,
  ReviewCharityCampaignUseCase,
  UpdateCharityProgressUseCase,
} from './charity-campaign.use-cases';

const OrganizerId = 'organizer';
const ActorId = 'actor';
const Hour = 3_600_000;

function campaign(overrides: Partial<ICharityCampaign> = {}): ICharityCampaign {
  const startTime = new Date(Date.now() - 2 * Hour);
  return {
    globalId: 'campaign-1',
    title: 'Bếp cơm Vu Lan',
    slug: 'bep-com-vu-lan',
    description: 'Nấu và trao 500 suất cơm chay.',
    bannerUrl: 'https://cdn.chantam.vn/a.jpg',
    badgeName: 'Tấm lòng Vu Lan',
    targetItemsCount: 500,
    currentItemsCount: 0,
    progressPercent: 0,
    lat: null,
    lng: null,
    locationLabel: null,
    startTime,
    endTime: new Date(startTime.getTime() + Hour),
    isActive: true,
    approvalStatus: 'APPROVED',
    approvalNote: null,
    approvedAt: new Date(),
    approvedBy: 'admin',
    createdBy: OrganizerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    participantCount: 0,
    ...overrides,
  };
}

function makeRepository(): jest.Mocked<ICharityCampaignRepository> {
  return {
    create: jest.fn(),
    slugTaken: jest.fn().mockResolvedValue(false),
    findByGlobalId: jest.fn(),
    findPublicByIdOrSlug: jest.fn(),
    listPublic: jest.fn(),
    listForAdmin: jest.fn(),
    listJoinedByUser: jest.fn(),
    listByCreator: jest.fn(),
    decideApproval: jest.fn(),
    updateProgress: jest.fn(),
    setActive: jest.fn(),
    register: jest.fn(),
    cancelParticipation: jest.fn(),
    findParticipationStatus: jest.fn(),
    listRegisteredUserIds: jest.fn(),
    createReview: jest.fn(),
    reviewExists: jest.fn().mockResolvedValue(false),
    listReviews: jest.fn(),
  } as unknown as jest.Mocked<ICharityCampaignRepository>;
}

function makeEntitlements(allowed: boolean | null) {
  return {
    getCapability: jest
      .fn()
      .mockResolvedValue(
        allowed === null ? null : { code: 'x', allowed, limit: null },
      ),
  } as unknown as jest.Mocked<IEntitlementRepository>;
}

function makeAdmin(granted: boolean) {
  return {
    hasPermission: jest.fn().mockResolvedValue(granted),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

function writeInput(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 24 * Hour);
  return {
    title: 'Bếp cơm Vu Lan 2026',
    description: 'Nấu và trao 500 suất cơm chay tại chùa.',
    bannerUrl: 'https://cdn.chantam.vn/a.jpg',
    badgeName: 'Tấm lòng Vu Lan',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 8 * Hour).toISOString(),
    ...overrides,
  };
}

describe('CreateCharityCampaignUseCase', () => {
  it('đường thành viên hỏi Rank Config, KHÔNG hỏi quyền Admin', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const entitlements = makeEntitlements(true);
    const admin = makeAdmin(true);

    await new CreateCharityCampaignUseCase(
      repository,
      entitlements,
      admin,
    ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false });

    expect(entitlements.getCapability).toHaveBeenCalledWith(
      ActorId,
      'SUBMIT_CHARITY_PROPOSAL',
    );
    // Hỏi `hasPermission` ở đường thành viên là mở một cửa thứ hai vào cùng việc.
    expect(admin.hasPermission).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalStatus: 'PENDING_APPROVAL',
        approvedBy: null,
      }),
    );
  });

  it('capability null (thiếu hàng Rank Config) là KHÔNG cho phép', async () => {
    // Fail-closed: thiếu hàng nghĩa là chưa ai quyết định, và mặc định của một quyền chưa
    // quyết định phải là đóng.
    await expect(
      new CreateCharityCampaignUseCase(
        makeRepository(),
        makeEntitlements(null),
        makeAdmin(true),
      ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false }),
    ).rejects.toThrow(CharityCampaignCreateNotAllowedException);
  });

  it('đường Admin hỏi campaign.manage, KHÔNG hỏi Rank Config', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const entitlements = makeEntitlements(false);
    const admin = makeAdmin(true);

    await new CreateCharityCampaignUseCase(
      repository,
      entitlements,
      admin,
    ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: true });

    expect(admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'campaign.manage',
    );
    // Admin hạng VIEWER vẫn phải tạo được — hạng là chuyện của thành viên, không của Admin.
    expect(entitlements.getCapability).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalStatus: 'APPROVED',
        approvedBy: ActorId,
      }),
    );
  });

  it('đường Admin không có quyền thì ForbiddenException', async () => {
    await expect(
      new CreateCharityCampaignUseCase(
        makeRepository(),
        makeEntitlements(true),
        makeAdmin(false),
      ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: true }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('kiểm quyền TRƯỚC khi kiểm nội dung', async () => {
    // Thứ tự có nghĩa: người không được tạo gửi hồ sơ rác phải nhận "bạn chưa được tạo",
    // không phải một danh sách lỗi nội dung tiết lộ rằng nếu sửa xong thì sẽ tạo được.
    const repository = makeRepository();
    await expect(
      new CreateCharityCampaignUseCase(
        repository,
        makeEntitlements(false),
        makeAdmin(true),
      ).handle({
        ...writeInput({ title: 'x', bannerUrl: 'http://x', description: 'a' }),
        actorUserId: ActorId,
        asAdmin: false,
      }),
    ).rejects.toThrow(CharityCampaignCreateNotAllowedException);
    expect(repository.slugTaken).not.toHaveBeenCalled();
  });

  it('slug sinh từ tiêu đề khi không gửi, và chuẩn hoá khi có gửi', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const useCase = new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
    );

    await useCase.handle({
      ...writeInput({ title: 'Đồ Dùng Cho Bé' }),
      actorUserId: ActorId,
      asAdmin: false,
    });
    expect(repository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: 'do-dung-cho-be' }),
    );

    await useCase.handle({
      ...writeInput({ slug: 'Vu Lan  2026!!' }),
      actorUserId: ActorId,
      asAdmin: false,
    });
    expect(repository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: 'vu-lan-2026' }),
    );
  });

  it('gửi lat mà thiếu lng bị từ chối', async () => {
    // `ST_MakePoint` với `NULL` cho ra `NULL`, tức hoạt động lặng lẽ mất vị trí thay vì
    // người tạo biết mình gửi thiếu.
    await expect(
      new CreateCharityCampaignUseCase(
        makeRepository(),
        makeEntitlements(true),
        makeAdmin(true),
      ).handle({
        ...writeInput({ lat: 10.7797 }),
        actorUserId: ActorId,
        asAdmin: false,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('bỏ cả lat và lng thì hợp lệ, và ghi null', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
    ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ lat: null, lng: null, locationLabel: null }),
    );
  });

  it('slug trùng trả thông báo đọc được chứ không để UNIQUE nổ', async () => {
    const repository = makeRepository();
    repository.slugTaken.mockResolvedValue(true);

    await expect(
      new CreateCharityCampaignUseCase(
        repository,
        makeEntitlements(true),
        makeAdmin(true),
      ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('ReviewCharityCampaignUseCase', () => {
  function useCase(repository: jest.Mocked<ICharityCampaignRepository>) {
    return new ReviewCharityCampaignUseCase(repository);
  }

  it('kiểm rating TRƯỚC khi đọc database', async () => {
    const repository = makeRepository();
    await expect(
      useCase(repository).handle({
        actorUserId: ActorId,
        campaignId: 'campaign-1',
        revieweeId: OrganizerId,
        rating: 9,
      }),
    ).rejects.toThrow(ValidationFailedException);
    // Một con số sai không đáng một lượt đi database.
    expect(repository.findByGlobalId).not.toHaveBeenCalled();
  });

  it('người tham gia chấm người tham gia khác bị chặn', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    repository.listRegisteredUserIds.mockResolvedValue([ActorId, 'p2']);

    await expect(
      useCase(repository).handle({
        actorUserId: ActorId,
        campaignId: 'campaign-1',
        revieweeId: 'p2',
        rating: 1,
      }),
    ).rejects.toThrow(CharityReviewNotPermittedException);
    expect(repository.createReview).not.toHaveBeenCalled();
  });

  it('người tổ chức chấm người KHÔNG đăng ký bị chặn', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    repository.listRegisteredUserIds.mockResolvedValue(['p1']);

    await expect(
      useCase(repository).handle({
        actorUserId: OrganizerId,
        campaignId: 'campaign-1',
        revieweeId: 'nguoila',
        rating: 5,
      }),
    ).rejects.toThrow(CharityReviewNotPermittedException);
  });

  it('bình luận chỉ gồm dấu cách lưu thành null, không thành chuỗi rỗng', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    repository.listRegisteredUserIds.mockResolvedValue([ActorId]);
    repository.createReview.mockResolvedValue({
      globalId: 'review-1',
      campaignId: 'campaign-1',
      reviewerId: ActorId,
      revieweeId: OrganizerId,
      reviewerRole: 'PARTICIPANT',
      rating: 5,
      comment: null,
      createdAt: new Date(),
    });

    await useCase(repository).handle({
      actorUserId: ActorId,
      campaignId: 'campaign-1',
      revieweeId: OrganizerId,
      rating: 5,
      comment: '   ',
    });

    expect(repository.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ comment: null, reviewerRole: 'PARTICIPANT' }),
    );
  });
});

describe('UpdateCharityProgressUseCase', () => {
  it('người không phải người tổ chức bị chặn', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());

    await expect(
      new UpdateCharityProgressUseCase(repository, makeAdmin(true)).handle({
        actorUserId: 'nguoila',
        campaignId: 'campaign-1',
        currentItemsCount: 10,
        asAdmin: false,
      }),
    ).rejects.toThrow(CharityNotOrganizerException);
    expect(repository.updateProgress).not.toHaveBeenCalled();
  });

  it('đường Admin bỏ qua phép kiểm người tổ chức nhưng vẫn hỏi quyền', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    repository.updateProgress.mockResolvedValue(
      campaign({ currentItemsCount: 10 }),
    );
    const admin = makeAdmin(true);

    await new UpdateCharityProgressUseCase(repository, admin).handle({
      actorUserId: 'khong-phai-nguoi-to-chuc',
      campaignId: 'campaign-1',
      currentItemsCount: 10,
      asAdmin: true,
    });

    expect(admin.hasPermission).toHaveBeenCalledWith(
      'khong-phai-nguoi-to-chuc',
      'campaign.manage',
    );
    expect(repository.updateProgress).toHaveBeenCalled();
  });

  it('con số âm bị từ chối trước khi đi database', async () => {
    const repository = makeRepository();
    await expect(
      new UpdateCharityProgressUseCase(repository, makeAdmin(true)).handle({
        actorUserId: OrganizerId,
        campaignId: 'campaign-1',
        currentItemsCount: -1,
        asAdmin: false,
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.findByGlobalId).not.toHaveBeenCalled();
  });
});
