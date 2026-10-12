import {
  CharityBeneficiaryConsentRequiredException,
  CharityBeneficiaryNotApplicableException,
  CharityCampaignCreateNotAllowedException,
  CharityCampaignNotFoundException,
  CharityContributionNotEditableException,
  CharityContributionNotFoundException,
  CharityCoordinatorNotAllowedException,
  CharityDeliveryNotFoundException,
  CharityLinesInvalidException,
  CharityNeedItemInvalidException,
  CharityNotAcceptingContributionsException,
  CharityNotOrganizerException,
  CharityReviewNotPermittedException,
  CharitySelfContributionException,
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
  AmendExternalContributionUseCase,
  CancelCharityDeliveryUseCase,
  CloseCharityCampaignUseCase,
  CreateCharityCampaignUseCase,
  DecideCharityApprovalUseCase,
  DecideCharityContributionUseCase,
  ExtendCharityCampaignUseCase,
  GetCampaignNeedsUseCase,
  GetCharityDeliveryUseCase,
  ListCampaignContributionsUseCase,
  ManageCharityBeneficiaryUseCase,
  ManageCharityCoordinatorsUseCase,
  RecordExternalContributionUseCase,
  ReviewCharityCampaignUseCase,
  SubmitCharityContributionUseCase,
  UpdateCharityContributionUseCase,
  UpdateCharityProgressUseCase,
} from './charity-campaign.use-cases';

const OrganizerId = 'organizer';
const CampaignId = 'campaign-1';
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
    media: [],
    campaignType: 'ORGANIZED_CAMPAIGN' as const,
    beneficiaryRelation: null,
    allowOverTarget: false,
    ...overrides,
  };
}

function makeRepository(): jest.Mocked<ICharityCampaignRepository> {
  return {
    create: jest.fn(),
    replaceMedia: jest.fn(),
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
    createContribution: jest.fn(),
    listContributionsByCampaign: jest.fn(),
    listContributionsByContributor: jest.fn(),
    findContributionByGlobalId: jest.fn(),
    replaceContribution: jest.fn(),
    withdrawContribution: jest.fn(),
    decideContribution: jest.fn(),
    completeDelivery: jest.fn(),
    cancelDelivery: jest.fn(),
    findDeliveryByGlobalId: jest.fn(),
    recordExternalContribution: jest.fn(),
    amendExternalContribution: jest.fn(),
    listExternalContributions: jest.fn().mockResolvedValue([]),
    closeCampaign: jest.fn(),
    extendCampaign: jest.fn(),
    // Mặc định KHÔNG phải người điều phối: phép kiểm nào cần quyền thì tự bật.
    isCampaignManager: jest.fn().mockResolvedValue(false),
    grantCoordinator: jest.fn(),
    revokeCoordinator: jest.fn(),
    listCoordinators: jest.fn().mockResolvedValue([]),
    findBeneficiary: jest.fn().mockResolvedValue(null),
    upsertBeneficiary: jest.fn(),
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

/** Notifier giả: phép kiểm từng câu thông báo nằm ở `charity.notifier.spec.ts`. */
function makeNotifier() {
  return {
    contributionSubmitted: jest.fn(async () => undefined),
    contributionDecided: jest.fn(async () => undefined),
    deliveryCompleted: jest.fn(async () => undefined),
    deliveryCancelled: jest.fn(async () => undefined),
  } as never;
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
    pendingQuantity: 0,
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

describe('SubmitCharityContributionUseCase (F65b §4)', () => {
  const Need = '99999999-9999-4999-8999-99999999aaaa';

  function openNeed(overrides: Record<string, unknown> = {}) {
    return {
      globalId: Need,
      categoryId: null,
      itemName: 'Gạo tẻ',
      description: null,
      unit: 'kg',
      targetQuantity: 100,
      allowAlternative: false,
      acceptedQuantity: 0,
      receivedQuantity: 0,
      remainingQuantity: 100,
      pendingQuantity: 0,
      sortOrder: 0,
      isActive: true,
      ...overrides,
    };
  }

  /** Hoạt động ĐANG nhận đề nghị: đã duyệt, còn bật, chưa tới hạn kết thúc. */
  function activeCampaign() {
    return campaign({
      approvalStatus: 'APPROVED' as const,
      isActive: true,
      endTime: new Date(Date.now() + 7 * 24 * Hour),
    });
  }

  function makeSubmitRepo(overrides: Record<string, unknown> = {}) {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(activeCampaign());
    repository.listNeeds.mockResolvedValue([openNeed()]);
    repository.createContribution.mockResolvedValue({
      globalId: 'contribution-1',
    } as never);
    Object.assign(repository, overrides);
    return repository;
  }

  it('gửi được, và ghi đúng dòng người tặng chọn', async () => {
    const repository = makeSubmitRepo();

    await new SubmitCharityContributionUseCase(
      repository,
      makeNotifier(),
    ).handle({
      campaignId: CampaignId,
      contributorId: ActorId,
      note: '  Em xin gửi ạ  ',
      items: [{ needItemId: Need, offeredQuantity: 50 }],
    });

    expect(repository.createContribution).toHaveBeenCalledWith({
      campaignId: CampaignId,
      contributorId: ActorId,
      note: 'Em xin gửi ạ',
      contactNote: null,
      items: [{ needItemId: Need, offeredQuantity: 50, conditionNote: null }],
    });
  });

  it('hoạt động CHƯA DUYỆT trả cùng lỗi với hoạt động không tồn tại', async () => {
    // Phân biệt hai cái là cho người ngoài dò được hồ sơ đang chờ kiểm duyệt.
    const repository = makeSubmitRepo({
      findByGlobalId: jest
        .fn()
        .mockResolvedValue(campaign({ approvalStatus: 'PENDING_APPROVAL' })),
    });

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: Need, offeredQuantity: 50 }],
      }),
    ).rejects.toBeInstanceOf(CharityCampaignNotFoundException);
  });

  it('hoạt động đã ĐÓNG thì không nhận đề nghị', async () => {
    // `end_time` trong quá khứ là dấu hiệu "đã đóng" (§8). Đọc cả ba cột chứ không
    // suy từ một cột: `approval_status` không bao giờ mang chữ CLOSED.
    const repository = makeSubmitRepo({
      findByGlobalId: jest.fn().mockResolvedValue(
        campaign({
          approvalStatus: 'APPROVED',
          isActive: false,
          endTime: new Date(Date.now() - Hour),
        }),
      ),
    });

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: Need, offeredQuantity: 50 }],
      }),
    ).rejects.toBeInstanceOf(CharityNotAcceptingContributionsException);
    expect(repository.createContribution).not.toHaveBeenCalled();
  });

  it('hoạt động đang ĐÌNH CHỈ cũng không nhận', async () => {
    const repository = makeSubmitRepo({
      findByGlobalId: jest.fn().mockResolvedValue(
        campaign({
          approvalStatus: 'APPROVED',
          isActive: false,
          endTime: new Date(Date.now() + 7 * 24 * Hour),
        }),
      ),
    });

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: Need, offeredQuantity: 50 }],
      }),
    ).rejects.toBeInstanceOf(CharityNotAcceptingContributionsException);
  });

  it('dòng nhu cầu của hoạt động KHÁC bị từ chối', async () => {
    // Thiếu phép kiểm này thì một `needItemId` lạ vẫn ghi được, và tiến độ của
    // hoạt động kia nhận một đề nghị không ai gửi cho nó.
    const repository = makeSubmitRepo();

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [
          {
            needItemId: '11111111-1111-4111-8111-111111111111',
            offeredQuantity: 5,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(CharityNeedItemInvalidException);
    expect(repository.createContribution).not.toHaveBeenCalled();
  });

  it('dòng nhu cầu người tổ chức đã RÚT bị từ chối', async () => {
    const repository = makeSubmitRepo({
      listNeeds: jest.fn().mockResolvedValue([openNeed({ isActive: false })]),
    });

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: Need, offeredQuantity: 50 }],
      }),
    ).rejects.toBeInstanceOf(CharityNeedItemInvalidException);
  });

  it('hai dòng cùng trỏ MỘT nhu cầu bị từ chối ở tầng use case', async () => {
    // Database có UNIQUE chặn, nhưng chặn ở đây cho ra thông báo đọc được thay vì
    // một lỗi ràng buộc 500.
    const repository = makeSubmitRepo();

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [
          { needItemId: Need, offeredQuantity: 50 },
          { needItemId: Need, offeredQuantity: 10 },
        ],
      }),
    ).rejects.toBeInstanceOf(CharityNeedItemInvalidException);
  });
});

describe('ListCampaignContributionsUseCase (F65b §9)', () => {
  it('người KHÔNG tổ chức không đọc được danh sách', async () => {
    // Danh sách mang `contactNote` của người tặng, và §9 nói response công khai
    // không trả contact.
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-khac' }),
    );

    await expect(
      new ListCampaignContributionsUseCase(repository).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        limit: 20,
        offset: 0,
      }),
    ).rejects.toBeInstanceOf(CharityNotOrganizerException);
    expect(repository.listContributionsByCampaign).not.toHaveBeenCalled();
  });

  it('người tổ chức đọc được, và lọc theo trạng thái chảy xuống repository', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId }),
    );
    // Từ khi có coordinator, quyền đọc đi qua `isCampaignManager` — nguồn duy nhất
    // nói "người tổ chức HOẶC coordinator còn hiệu lực".
    repository.isCampaignManager.mockResolvedValue(true);
    repository.listContributionsByCampaign.mockResolvedValue({
      items: [],
      total: 0,
    });

    await new ListCampaignContributionsUseCase(repository).handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
      status: 'PENDING_REVIEW',
      limit: 20,
      offset: 0,
    });

    expect(repository.listContributionsByCampaign).toHaveBeenCalledWith({
      campaignId: CampaignId,
      status: 'PENDING_REVIEW',
      limit: 20,
      offset: 0,
    });
  });
});

describe('UpdateCharityContributionUseCase (F65b §4)', () => {
  const Need = '99999999-9999-4999-8999-99999999aaaa';
  const ContributionId = 'contribution-1';

  function contribution(overrides: Record<string, unknown> = {}) {
    return {
      globalId: ContributionId,
      campaignId: CampaignId,
      contributorId: ActorId,
      status: 'PENDING_REVIEW' as const,
      note: null,
      contactNote: null,
      decidedAt: null,
      createdAt: new Date(),
      items: [],
      deliveryId: null,
      deliveryStatus: null,
      ...overrides,
    };
  }

  function makeUpdateRepo(overrides: Record<string, unknown> = {}) {
    const repository = makeRepository();
    repository.findContributionByGlobalId.mockResolvedValue(contribution());
    repository.listNeeds.mockResolvedValue([
      {
        globalId: Need,
        categoryId: null,
        itemName: 'Gạo tẻ',
        description: null,
        unit: 'kg',
        targetQuantity: 100,
        allowAlternative: false,
        acceptedQuantity: 0,
        receivedQuantity: 0,
        remainingQuantity: 100,
        pendingQuantity: 0,
        sortOrder: 0,
        isActive: true,
      },
    ]);
    repository.replaceContribution.mockResolvedValue(contribution());
    repository.withdrawContribution.mockResolvedValue(
      contribution({ status: 'WITHDRAWN' }),
    );
    Object.assign(repository, overrides);
    return repository;
  }

  it('đề nghị của NGƯỜI KHÁC trả cùng lỗi với không tồn tại', async () => {
    const repository = makeUpdateRepo({
      findContributionByGlobalId: jest
        .fn()
        .mockResolvedValue(contribution({ contributorId: 'nguoi-khac' })),
    });

    await expect(
      new UpdateCharityContributionUseCase(repository).handle({
        contributionId: ContributionId,
        contributorId: ActorId,
        action: 'WITHDRAW',
      }),
    ).rejects.toBeInstanceOf(CharityContributionNotFoundException);
  });

  it('đã có phần được chấp nhận thì KHÔNG sửa và KHÔNG rút được', async () => {
    // §4: sau đó mọi thay đổi phải đi qua huỷ lượt giao nhận. Sửa ngược một đề
    // nghị đã sinh lượt giao nhận là để hai bên nói khác nhau về cùng một cam kết.
    for (const status of ['PARTIALLY_ACCEPTED', 'ACCEPTED'] as const) {
      const repository = makeUpdateRepo({
        findContributionByGlobalId: jest
          .fn()
          .mockResolvedValue(contribution({ status })),
      });

      await expect(
        new UpdateCharityContributionUseCase(repository).handle({
          contributionId: ContributionId,
          contributorId: ActorId,
          action: 'WITHDRAW',
        }),
      ).rejects.toBeInstanceOf(CharityContributionNotEditableException);
      expect(repository.withdrawContribution).not.toHaveBeenCalled();
    }
  });

  it('repository trả null — ai đó vừa xét xong — thì cũng là lỗi khoá', async () => {
    // Hai lượt sửa song song: cả hai đọc thấy PENDING_REVIEW, và chỉ database thấy
    // cái thứ hai. `null` từ repository là tín hiệu đó.
    const repository = makeUpdateRepo({
      withdrawContribution: jest.fn().mockResolvedValue(null),
    });

    await expect(
      new UpdateCharityContributionUseCase(repository).handle({
        contributionId: ContributionId,
        contributorId: ActorId,
        action: 'WITHDRAW',
      }),
    ).rejects.toBeInstanceOf(CharityContributionNotEditableException);
  });

  it('REPLACE không có dòng nào bị từ chối', async () => {
    // Một đề nghị rỗng không phải một đề nghị. Muốn bỏ hết thì đó là RÚT.
    const repository = makeUpdateRepo();

    await expect(
      new UpdateCharityContributionUseCase(repository).handle({
        contributionId: ContributionId,
        contributorId: ActorId,
        action: 'REPLACE',
        items: [],
      }),
    ).rejects.toBeInstanceOf(CharityNeedItemInvalidException);
  });

  it('REPLACE kiểm lại dòng nhu cầu: người tổ chức có thể đã rút nó', async () => {
    const repository = makeUpdateRepo({
      listNeeds: jest.fn().mockResolvedValue([]),
    });

    await expect(
      new UpdateCharityContributionUseCase(repository).handle({
        contributionId: ContributionId,
        contributorId: ActorId,
        action: 'REPLACE',
        items: [{ needItemId: Need, offeredQuantity: 20 }],
      }),
    ).rejects.toBeInstanceOf(CharityNeedItemInvalidException);
  });

  it('RÚT thì không đụng đường thay dòng', async () => {
    const repository = makeUpdateRepo();

    const result = await new UpdateCharityContributionUseCase(
      repository,
    ).handle({
      contributionId: ContributionId,
      contributorId: ActorId,
      action: 'WITHDRAW',
      // Gửi kèm nội dung cũng bị bỏ: rút là rút.
      items: [{ needItemId: Need, offeredQuantity: 20 }],
    });

    expect(result.status).toBe('WITHDRAWN');
    expect(repository.replaceContribution).not.toHaveBeenCalled();
  });
});

describe('Lát C — tầng ứng dụng (F65b §5–§6)', () => {
  const Need = '99999999-9999-4999-8999-99999999aaaa';

  function delivery(overrides: Record<string, unknown> = {}) {
    return {
      globalId: 'delivery-1',
      campaignId: CampaignId,
      contributionId: 'contribution-1',
      contributorId: ActorId,
      organizerId: OrganizerId,
      status: 'ACCEPTED' as const,
      createdAt: new Date(),
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      items: [],
      ...overrides,
    };
  }

  it('người tổ chức KHÔNG gửi đề nghị vào chính hoạt động của mình', async () => {
    // Không chặn ở đây thì tới lượt quyết `CHK_campaign_deliveries_not_self` mới bắt,
    // và người dùng nhận lỗi 500 cho một đề nghị hệ thống đã nhận từ trước.
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        approvalStatus: 'APPROVED',
        isActive: true,
        endTime: new Date(Date.now() + 7 * 24 * Hour),
        createdBy: ActorId,
      }),
    );

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: Need, offeredQuantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(CharitySelfContributionException);
    expect(repository.createContribution).not.toHaveBeenCalled();
  });

  it('quyết định đi thẳng xuống repository — mọi luật nằm trong transaction', async () => {
    // Kiểm quyền ở use case, NGOÀI transaction, là kiểm trên một bản đọc có thể đã
    // cũ khi transaction mở. Phép kiểm này canh rằng use case không tự thêm một
    // bản sao nào của luật đó.
    const repository = makeRepository();
    repository.decideContribution.mockResolvedValue({
      contribution: {} as never,
      delivery: null,
      replayed: false,
    });
    const command = {
      contributionId: 'contribution-1',
      organizerId: OrganizerId,
      decisionKey: 'khoa-1-abcdef',
      decisions: [{ contributionItemId: 'item-1', acceptedQuantity: 5 }],
    };

    await new DecideCharityContributionUseCase(
      repository,
      makeNotifier(),
    ).handle(command);

    expect(repository.decideContribution).toHaveBeenCalledWith(command);
    // Từ lát thông báo, use case CÓ đọc chiến dịch — để lấy tiêu đề cho câu thông
    // báo, SAU khi lượt quyết đã commit. Điều phép kiểm này canh là không có lượt đọc
    // nào ĐỨNG TRƯỚC để kiểm quyền ngoài transaction.
    for (const order of repository.findByGlobalId.mock.invocationCallOrder)
      expect(order).toBeGreaterThan(
        repository.decideContribution.mock.invocationCallOrder[0],
      );
  });

  it('huỷ mà lý do chỉ có khoảng trắng thì bị chặn trước khi ghi', async () => {
    const repository = makeRepository();

    await expect(
      new CancelCharityDeliveryUseCase(repository, makeNotifier()).handle({
        deliveryId: 'delivery-1',
        actorUserId: ActorId,
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(CharityLinesInvalidException);
    expect(repository.cancelDelivery).not.toHaveBeenCalled();
  });

  it('huỷ thì lý do được cắt khoảng trắng', async () => {
    const repository = makeRepository();
    repository.cancelDelivery.mockResolvedValue(delivery() as never);

    await new CancelCharityDeliveryUseCase(repository, makeNotifier()).handle({
      deliveryId: 'delivery-1',
      actorUserId: ActorId,
      reason: '  Không sắp xếp được  ',
    });

    expect(repository.cancelDelivery).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      actorUserId: ActorId,
      reason: 'Không sắp xếp được',
    });
  });

  it('người NGOÀI đọc lượt giao nhận thì nhận cùng lỗi với không tồn tại', async () => {
    const repository = makeRepository();
    repository.findDeliveryByGlobalId.mockResolvedValue(delivery() as never);

    await expect(
      new GetCharityDeliveryUseCase(repository).handle({
        deliveryId: 'delivery-1',
        viewerUserId: 'nguoi-ngoai',
      }),
    ).rejects.toBeInstanceOf(CharityDeliveryNotFoundException);
  });

  it('cả HAI bên đều đọc được lượt giao nhận', async () => {
    const repository = makeRepository();
    repository.findDeliveryByGlobalId.mockResolvedValue(delivery() as never);
    repository.isCampaignManager.mockImplementation(
      async (_campaignId: string, userId: string) => userId === OrganizerId,
    );

    for (const viewer of [ActorId, OrganizerId])
      await expect(
        new GetCharityDeliveryUseCase(repository).handle({
          deliveryId: 'delivery-1',
          viewerUserId: viewer,
        }),
      ).resolves.toMatchObject({ globalId: 'delivery-1' });
  });
});

describe('Lát D — ngoài app và đóng chiến dịch (F65b §7–§8)', () => {
  const Need = '99999999-9999-4999-8999-99999999aaaa';

  it('người tổ chức đóng được chiến dịch của mình mà không cần quyền Admin', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId }),
    );
    repository.closeCampaign.mockResolvedValue({
      campaignId: CampaignId,
      rejectedContributions: 2,
      openDeliveries: 1,
      rejected: [],
    });
    const admin = makeAdmin(false);

    await new CloseCharityCampaignUseCase(
      repository,
      admin,
      makeNotifier(),
    ).handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
    });

    expect(repository.closeCampaign).toHaveBeenCalledWith({
      campaignId: CampaignId,
      actorUserId: ActorId,
    });
    expect(admin.hasPermission).not.toHaveBeenCalled();
  });

  it('Admin có campaign.manage đóng được chiến dịch của người khác', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-khac' }),
    );
    repository.closeCampaign.mockResolvedValue({
      campaignId: CampaignId,
      rejectedContributions: 0,
      openDeliveries: 0,
      rejected: [],
    });

    await new CloseCharityCampaignUseCase(
      repository,
      makeAdmin(true),
      makeNotifier(),
    ).handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
    });

    expect(repository.closeCampaign).toHaveBeenCalled();
  });

  it('người ngoài không có quyền Admin thì KHÔNG đóng được', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-khac' }),
    );

    await expect(
      new CloseCharityCampaignUseCase(
        repository,
        makeAdmin(false),
        makeNotifier(),
      ).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
      }),
    ).rejects.toBeInstanceOf(CharityNotOrganizerException);
    expect(repository.closeCampaign).not.toHaveBeenCalled();
  });

  it('ngày nhận ở TƯƠNG LAI bị từ chối — tiến độ chỉ tăng theo thứ đã về kho', async () => {
    const repository = makeRepository();

    await expect(
      new RecordExternalContributionUseCase(repository).handle({
        campaignId: CampaignId,
        recordedBy: ActorId,
        needItemId: Need,
        quantity: 10,
        sourceLabel: 'Cô Lan',
        receivedAt: new Date(Date.now() + 24 * Hour).toISOString(),
      }),
    ).rejects.toBeInstanceOf(CharityLinesInvalidException);
    expect(repository.recordExternalContribution).not.toHaveBeenCalled();
  });

  it('huỷ hay điều chỉnh mà lý do chỉ có khoảng trắng thì bị chặn', async () => {
    const repository = makeRepository();

    await expect(
      new AmendExternalContributionUseCase(repository).handle({
        externalId: 'ext-1',
        actorUserId: ActorId,
        action: 'VOID',
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(CharityLinesInvalidException);
    expect(repository.amendExternalContribution).not.toHaveBeenCalled();
  });

  it('điều chỉnh không có số mới thì bị chặn — muốn về 0 thì huỷ', async () => {
    const repository = makeRepository();

    await expect(
      new AmendExternalContributionUseCase(repository).handle({
        externalId: 'ext-1',
        actorUserId: ActorId,
        action: 'ADJUST',
        reason: 'Đếm lại',
      }),
    ).rejects.toBeInstanceOf(CharityLinesInvalidException);
  });
});

describe('Thông báo được NỐI vào đúng đường (F65b)', () => {
  function notifier() {
    return {
      contributionSubmitted: jest.fn(async () => undefined),
      contributionDecided: jest.fn(async () => undefined),
      deliveryCompleted: jest.fn(async () => undefined),
      deliveryCancelled: jest.fn(async () => undefined),
    };
  }

  it('quyết định MỚI báo người tặng; retry cùng khoá thì KHÔNG báo lại', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    const fresh = notifier();
    repository.decideContribution.mockResolvedValue({
      contribution: { campaignId: CampaignId } as never,
      delivery: null,
      replayed: false,
    });
    const command = {
      contributionId: 'c-1',
      organizerId: OrganizerId,
      decisionKey: 'khoa-12345678',
      decisions: [],
    };

    await new DecideCharityContributionUseCase(
      repository,
      fresh as never,
    ).handle(command);
    expect(fresh.contributionDecided).toHaveBeenCalledTimes(1);

    const retried = notifier();
    repository.decideContribution.mockResolvedValue({
      contribution: { campaignId: CampaignId } as never,
      delivery: null,
      replayed: true,
    });
    await new DecideCharityContributionUseCase(
      repository,
      retried as never,
    ).handle(command);
    expect(retried.contributionDecided).not.toHaveBeenCalled();
  });

  it('đóng chiến dịch báo TỪNG người bị từ chối, đánh dấu là do đóng', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId }),
    );
    repository.closeCampaign.mockResolvedValue({
      campaignId: CampaignId,
      rejectedContributions: 2,
      openDeliveries: 0,
      rejected: [
        { contributionId: 'c-1', contributorId: 'g-1' },
        { contributionId: 'c-2', contributorId: 'g-2' },
      ],
    });
    const sent = notifier();

    await new CloseCharityCampaignUseCase(
      repository,
      makeAdmin(false),
      sent as never,
    ).handle({ campaignId: CampaignId, actorUserId: ActorId });

    expect(sent.contributionDecided).toHaveBeenCalledTimes(2);
    expect(sent.contributionDecided).toHaveBeenCalledWith(
      expect.objectContaining({
        byClosing: true,
        contribution: expect.objectContaining({ contributorId: 'g-2' }),
      }),
    );
  });

  it('gửi đề nghị báo NGƯỜI TỔ CHỨC của hoạt động', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        approvalStatus: 'APPROVED',
        isActive: true,
        endTime: new Date(Date.now() + 7 * 24 * Hour),
        createdBy: OrganizerId,
      }),
    );
    repository.listNeeds.mockResolvedValue([
      {
        globalId: 'need-1',
        isActive: true,
      } as never,
    ]);
    repository.createContribution.mockResolvedValue({
      globalId: 'c-1',
      items: [{}],
    } as never);
    const sent = notifier();

    await new SubmitCharityContributionUseCase(
      repository,
      sent as never,
    ).handle({
      campaignId: CampaignId,
      contributorId: ActorId,
      items: [{ needItemId: 'need-1', offeredQuantity: 1 }],
    });

    expect(sent.contributionSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ organizerId: OrganizerId }),
    );
  });
});

describe('ExtendCharityCampaignUseCase (F65b §8)', () => {
  it('người ngoài không có quyền Admin thì không gia hạn được', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-khac' }),
    );
    repository.extendCampaign = jest.fn();

    await expect(
      new ExtendCharityCampaignUseCase(repository, makeAdmin(false)).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        endTime: new Date(Date.now() + 9 * 24 * Hour).toISOString(),
        reason: 'Kéo dài',
      }),
    ).rejects.toBeInstanceOf(CharityNotOrganizerException);
    expect(repository.extendCampaign).not.toHaveBeenCalled();
  });

  it('thiếu lý do thì bị chặn trước khi ghi audit', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId }),
    );
    repository.extendCampaign = jest.fn();

    await expect(
      new ExtendCharityCampaignUseCase(repository, makeAdmin(false)).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        endTime: new Date(Date.now() + 9 * 24 * Hour).toISOString(),
        reason: '  ',
      }),
    ).rejects.toBeInstanceOf(CharityLinesInvalidException);
    expect(repository.extendCampaign).not.toHaveBeenCalled();
  });
});

describe('Coordinator (F65b §2)', () => {
  it('coordinator ĐỌC được danh sách đề nghị dù không phải người tạo', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-tao' }),
    );
    repository.isCampaignManager.mockResolvedValue(true);
    repository.listContributionsByCampaign.mockResolvedValue({
      items: [],
      total: 0,
    });

    await new ListCampaignContributionsUseCase(repository).handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
      limit: 20,
      offset: 0,
    });

    expect(repository.listContributionsByCampaign).toHaveBeenCalled();
  });

  it('coordinator KHÔNG đóng được hoạt động — đó là quyền chủ sở hữu', async () => {
    // Ranh giới §2: điều phối được, không đổi được số phận của hoạt động.
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-tao' }),
    );
    repository.isCampaignManager.mockResolvedValue(true);

    await expect(
      new CloseCharityCampaignUseCase(
        repository,
        makeAdmin(false),
        makeNotifier(),
      ).handle({ campaignId: CampaignId, actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(CharityNotOrganizerException);
    expect(repository.closeCampaign).not.toHaveBeenCalled();
  });

  it('coordinator KHÔNG giao quyền tiếp cho người khác', async () => {
    // Để coordinator tự giao quyền là đường chuyển quyền chủ sở hữu từng bước.
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-tao' }),
    );
    repository.isCampaignManager.mockResolvedValue(true);

    await expect(
      new ManageCharityCoordinatorsUseCase(repository).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        action: 'GRANT',
        userId: 'nguoi-thu-ba',
      }),
    ).rejects.toBeInstanceOf(CharityNotOrganizerException);
    expect(repository.grantCoordinator).not.toHaveBeenCalled();
  });

  it('kêu gọi CÁ NHÂN không có coordinator', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        createdBy: ActorId,
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'SELF',
      }),
    );

    await expect(
      new ManageCharityCoordinatorsUseCase(repository).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        action: 'GRANT',
        userId: 'nguoi-khac',
      }),
    ).rejects.toBeInstanceOf(CharityCoordinatorNotAllowedException);
  });

  it('coordinator KHÔNG tặng vào hoạt động mình điều phối', async () => {
    // Họ sẽ tự xét đề nghị của chính mình.
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        approvalStatus: 'APPROVED',
        isActive: true,
        endTime: new Date(Date.now() + 7 * 24 * Hour),
        createdBy: 'nguoi-tao',
      }),
    );
    repository.isCampaignManager.mockResolvedValue(true);

    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: 'need-1', offeredQuantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(CharitySelfContributionException);
  });
});

describe('Người thụ hưởng — riêng tư và cổng chặn public (F65b §2)', () => {
  const otherAppeal = {
    campaignType: 'INDIVIDUAL_APPEAL' as const,
    beneficiaryRelation: 'OTHER' as const,
  };
  const person = (consentStatus: 'PENDING' | 'CONFIRMED') => ({
    fullName: 'Nguyễn Thị B',
    relationNote: 'Hàng xóm',
    phone: '0900000000',
    consentStatus,
  });

  it('có quyền public NGAY mà người thụ hưởng CHƯA đồng ý thì vẫn chờ duyệt', async () => {
    // Quyền public ngay nói "nội dung của tôi không cần ai đọc trước", không nói "tôi
    // được đăng hoàn cảnh của người khác khi họ chưa đồng ý".
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true, true),
      makeAdmin(false),
    ).handle({
      ...writeInput({ ...otherAppeal, beneficiary: person('PENDING') }),
      actorUserId: ActorId,
      asAdmin: false,
    });

    expect(repository.create.mock.calls[0][0].approvalStatus).toBe(
      'PENDING_APPROVAL',
    );
  });

  it('thiếu hẳn thông tin người thụ hưởng cũng chờ duyệt', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true, true),
      makeAdmin(false),
    ).handle({
      ...writeInput(otherAppeal),
      actorUserId: ActorId,
      asAdmin: false,
    });

    expect(repository.create.mock.calls[0][0].approvalStatus).toBe(
      'PENDING_APPROVAL',
    );
  });

  it('đã CONFIRMED và có quyền public ngay thì public ngay', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());

    await new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true, true),
      makeAdmin(false),
    ).handle({
      ...writeInput({ ...otherAppeal, beneficiary: person('CONFIRMED') }),
      actorUserId: ActorId,
      asAdmin: false,
    });

    expect(repository.create.mock.calls[0][0].approvalStatus).toBe('APPROVED');
  });

  it('gửi người thụ hưởng cho loại KHÔNG phải kêu gọi cho người khác thì bị chặn', async () => {
    // Lưu dữ liệu riêng tư của một người không liên quan gì tới hoạt động.
    const repository = makeRepository();

    await expect(
      new CreateCharityCampaignUseCase(
        repository,
        makeEntitlements(true),
        makeAdmin(false),
      ).handle({
        ...writeInput({ beneficiary: person('CONFIRMED') }),
        actorUserId: ActorId,
        asAdmin: false,
      }),
    ).rejects.toBeInstanceOf(CharityBeneficiaryNotApplicableException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('Admin DUYỆT kêu gọi cho người khác chưa có đồng ý thì bị chặn', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign(otherAppeal));
    repository.findBeneficiary.mockResolvedValue({
      ...person('PENDING'),
      address: null,
      verificationNote: null,
      updatedAt: new Date(),
      phone: '0900000000',
    });

    await expect(
      new DecideCharityApprovalUseCase(repository, makeAdmin(true)).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        approve: true,
      }),
    ).rejects.toBeInstanceOf(CharityBeneficiaryConsentRequiredException);
    expect(repository.decideApproval).not.toHaveBeenCalled();
  });

  it('người KHÔNG tổ chức, không phải Admin thì không đọc được', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ ...otherAppeal, createdBy: 'nguoi-khac' }),
    );

    await expect(
      new ManageCharityBeneficiaryUseCase(repository, makeAdmin(false)).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
      }),
    ).rejects.toBeInstanceOf(CharityNotOrganizerException);
    expect(repository.findBeneficiary).not.toHaveBeenCalled();
  });
});
