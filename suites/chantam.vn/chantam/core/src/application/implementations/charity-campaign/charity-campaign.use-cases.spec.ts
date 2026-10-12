import {
  CharityCampaignCreateNotAllowedException,
  CharityCampaignNotFoundException,
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
  GetCampaignNeedsUseCase,
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
    campaignType: 'ORGANIZED_CAMPAIGN' as const,
    beneficiaryRelation: null,
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
    listNeeds: jest.fn().mockResolvedValue([]),
    listReviews: jest.fn(),
  } as unknown as jest.Mocked<ICharityCampaignRepository>;
}

function makeEntitlements(
  allowed: boolean | null,
  /**
   * Quyền public-ngay, tách riêng vì nó là CÂU HỎI KHÁC với quyền tạo (F65b §2).
   * Mặc định `false` để các phép kiểm cũ giữ nguyên kết luận `PENDING_APPROVAL`.
   */
  publishWithoutReview = false,
) {
  return {
    getCapability: jest.fn(async (_userId: string, code: string) => {
      if (code === 'PUBLISH_CHARITY_WITHOUT_REVIEW')
        return publishWithoutReview
          ? { code, allowed: true, limit: null }
          : { code, allowed: false, limit: null };
      return allowed === null ? null : { code, allowed, limit: null };
    }),
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
    // Mặc định là hoạt động có tổ chức: đó là loại duy nhất tồn tại trước 12/10,
    // nên các phép kiểm cũ vẫn nói đúng điều chúng vốn nói.
    campaignType: 'ORGANIZED_CAMPAIGN' as const,
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

describe('CreateCharityCampaignUseCase · hai loại hoạt động (F65b §2)', () => {
  it('kêu gọi cho CÁ NHÂN hỏi capability RIÊNG, không hỏi quyền hoạt động có tổ chức', async () => {
    // Hai loại hai baseline: kêu gọi cá nhân mở từ Thành viên, hoạt động có tổ
    // chức chỉ Kim Cương. Dùng chung một capability là hoặc chặn Thành viên khỏi
    // việc họ được làm, hoặc mở cho họ việc chỉ Kim Cương được làm.
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const entitlements = makeEntitlements(true);

    await new CreateCharityCampaignUseCase(
      repository,
      entitlements,
      makeAdmin(true),
    ).handle({
      ...writeInput({
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'SELF',
      }),
      actorUserId: ActorId,
      asAdmin: false,
    });

    expect(entitlements.getCapability).toHaveBeenCalledWith(
      ActorId,
      'SUBMIT_INDIVIDUAL_APPEAL',
    );
    expect(entitlements.getCapability).not.toHaveBeenCalledWith(
      ActorId,
      'SUBMIT_CHARITY_PROPOSAL',
    );
  });

  it('có quyền PUBLIC NGAY thì vào APPROVED, không chờ Admin', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true, true),
      makeAdmin(true),
    ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false });

    expect(repository.create.mock.calls[0][0].approvalStatus).toBe('APPROVED');
  });

  it('KHÔNG có quyền public thì vẫn PENDING_APPROVAL dù tạo được', async () => {
    // Hai câu hỏi khác nhau: "được mở kêu gọi không" và "nội dung có cần ai đọc
    // trước khi ra ngoài không". Gộp chúng là cho mọi người tạo được cũng public
    // ngay — và một kêu gọi quyên góp ra ngoài không qua ai đọc là đúng chỗ bị
    // lợi dụng.
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true, false),
      makeAdmin(true),
    ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false });

    expect(repository.create.mock.calls[0][0].approvalStatus).toBe(
      'PENDING_APPROVAL',
    );
  });

  it('hoạt động có tổ chức KHÔNG mang quan hệ người thụ hưởng', async () => {
    // Client gửi kèm cũng bị bỏ: database có CHECK nối hai cột, nên để nó chảy
    // xuống sẽ thành lỗi ràng buộc 500 thay vì một hàng đúng.
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
    ).handle({
      ...writeInput({
        campaignType: 'ORGANIZED_CAMPAIGN',
        beneficiaryRelation: 'SELF',
      }),
      actorUserId: ActorId,
      asAdmin: false,
    });

    expect(repository.create.mock.calls[0][0].beneficiaryRelation).toBeNull();
  });

  it('bảng nhu cầu đi kèm lượt tạo, và SERVER đặt thứ tự', async () => {
    // `sortOrder` không nhận từ client: hai dòng cùng số sẽ hiện theo thứ tự ngẫu
    // nhiên của `id`, và người tạo không có cách nào sửa lại.
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
    ).handle({
      ...writeInput({
        needs: [
          { itemName: '  Gạo tẻ  ', unit: ' kg ', targetQuantity: 100 },
          {
            itemName: 'Mì gói',
            unit: 'thùng',
            targetQuantity: 10,
            allowAlternative: true,
          },
        ],
      }),
      actorUserId: ActorId,
      asAdmin: false,
    });

    expect(repository.create.mock.calls[0][0].needs).toEqual([
      {
        categoryId: null,
        itemName: 'Gạo tẻ',
        description: null,
        unit: 'kg',
        targetQuantity: 100,
        allowAlternative: false,
        sortOrder: 0,
      },
      {
        categoryId: null,
        itemName: 'Mì gói',
        description: null,
        unit: 'thùng',
        targetQuantity: 10,
        allowAlternative: true,
        sortOrder: 1,
      },
    ]);
  });

  it('không gửi bảng nhu cầu thì mảng RỖNG, không phải undefined', async () => {
    // Hoạt động chỉ nhận đăng ký tham dự thì không có nhu cầu vật phẩm nào (§10).
    // `undefined` chảy xuống repository sẽ thành `needs.length` trên undefined.
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
    ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false });

    expect(repository.create.mock.calls[0][0].needs).toEqual([]);
  });
});

describe('GetCampaignNeedsUseCase (F65b §3)', () => {
  const needRow = (overrides: Record<string, unknown> = {}) => ({
    globalId: 'need-1',
    categoryId: null,
    itemName: 'Gạo tẻ',
    description: null,
    unit: 'kg',
    targetQuantity: 100,
    allowAlternative: false,
    acceptedQuantity: 0,
    receivedQuantity: 0,
    remainingQuantity: 100,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  });

  it('có bảng nhu cầu thì progressSource là NEED_ITEMS', async () => {
    const repository = makeRepository();
    repository.findPublicByIdOrSlug.mockResolvedValue(campaign());
    repository.listNeeds.mockResolvedValue([
      needRow({ acceptedQuantity: 50, remainingQuantity: 50 }),
    ]);

    const result = await new GetCampaignNeedsUseCase(repository).handle({
      idOrSlug: 'bep-com',
      viewerUserId: null,
    });

    expect(result.progressSource).toBe('NEED_ITEMS');
    expect(result.overallProgressPercent).toBe(50);
  });

  it('chưa khai nhu cầu nào thì LEGACY_DECLARED và tiến độ null', async () => {
    // Chiến dịch cũ chỉ có hai cột tổng hợp — vốn là LỜI KHAI của người tổ chức.
    // Client phải biết con số nó đang vẽ đến từ đâu.
    const repository = makeRepository();
    repository.findPublicByIdOrSlug.mockResolvedValue(campaign());
    repository.listNeeds.mockResolvedValue([]);

    const result = await new GetCampaignNeedsUseCase(repository).handle({
      idOrSlug: 'bep-com',
      viewerUserId: null,
    });

    expect(result.progressSource).toBe('LEGACY_DECLARED');
    expect(result.overallProgressPercent).toBeNull();
  });

  it('dòng đã TẮT vẫn trả về, nhưng không vào phép tính tiến độ', async () => {
    // Dòng đã tắt là nhu cầu người tổ chức rút lại: để nó kéo tiến độ xuống là
    // báo cáo một việc không còn ai cần. Nhưng nó vẫn là lịch sử của những đề
    // nghị đã gửi, nên vẫn phải đọc được.
    const repository = makeRepository();
    repository.findPublicByIdOrSlug.mockResolvedValue(campaign());
    repository.listNeeds.mockResolvedValue([
      needRow({ globalId: 'xong', acceptedQuantity: 100 }),
      needRow({ globalId: 'da-tat', isActive: false, acceptedQuantity: 0 }),
    ]);

    const result = await new GetCampaignNeedsUseCase(repository).handle({
      idOrSlug: 'bep-com',
      viewerUserId: null,
    });

    expect(result.needs).toHaveLength(2);
    expect(result.overallProgressPercent).toBe(100);
  });

  it('chiến dịch chưa duyệt thì KHÔNG đọc được bảng nhu cầu', async () => {
    const repository = makeRepository();
    repository.findPublicByIdOrSlug.mockResolvedValue(null);

    await expect(
      new GetCampaignNeedsUseCase(repository).handle({
        idOrSlug: 'chua-duyet',
        viewerUserId: null,
      }),
    ).rejects.toBeInstanceOf(CharityCampaignNotFoundException);
    expect(repository.listNeeds).not.toHaveBeenCalled();
  });
});
