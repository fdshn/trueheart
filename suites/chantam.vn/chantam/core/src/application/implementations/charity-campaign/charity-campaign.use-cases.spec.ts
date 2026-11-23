import {
  CharityAlreadyRegisteredException,
  CharityBeneficiaryConsentRequiredException,
  CharityBeneficiaryDistributionTimeOutOfRangeException,
  CharityBeneficiaryNotApplicableException,
  CharityCampaignCreateNotAllowedException,
  CharityCampaignHasActivityException,
  CharityCampaignNotFoundException,
  CharityCampaignSummaryNotPublishedException,
  CharityContributionNotEditableException,
  CharityContributionNotFoundException,
  CharityContributionTypeDisabledException,
  CharityCoordinatorNotAllowedException,
  CharityDeliveryNotFoundException,
  CharityDistributionFieldRequiredException,
  CharityDistributionMethodMismatchException,
  CharityFundingBelowEstimatedAmountException,
  CharityIntakeClosedException,
  CharityLinesInvalidException,
  CharityMediaInvalidException,
  CharityMediaNotEditableException,
  CharityNeedBelowEstimatedPortionsException,
  CharityNeedItemInvalidException,
  CharityNotAcceptingContributionsException,
  CharityNotOrganizerException,
  CharityParticipantRankTooLowException,
  CharityParticipationInvalidStateException,
  CharityReviewNotPermittedException,
  CharityScheduleInvalidException,
  CharitySelfContributionException,
  CharitySubmitRequirementsUnmetException,
  CharitySupervisorConflictException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityCampaignRepository,
  IEntitlementRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  IObjectStorage,
  StorageValidationError,
} from '@chantam/service.storage-lib';
import {
  AmendExternalContributionUseCase,
  CancelCharityDeliveryUseCase,
  CloseCharityCampaignUseCase,
  CreateCharityCampaignUseCase,
  DecideCharityApprovalUseCase,
  DecideCharityContributionUseCase,
  DeleteCharityCampaignUseCase,
  ExtendCharityCampaignUseCase,
  GetAdminCampaignNeedsUseCase,
  GetAdminCharityCampaignUseCase,
  GetCampaignNeedsUseCase,
  GetCharityContributionUseCase,
  GetCharityDeliveryUseCase,
  GetPublicCharityCampaignUseCase,
  JoinCharityCampaignUseCase,
  ListCampaignContributionsUseCase,
  ManageCharityBeneficiaryUseCase,
  ManageCharityCoordinatorsUseCase,
  RecordExternalContributionUseCase,
  ReplaceCharityMediaUseCase,
  RequestCharityMediaUploadUseCase,
  ReviewCharityCampaignUseCase,
  SubmitCharityContributionUseCase,
  UpdateAdminCharityCampaignUseCase,
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
    acceptedContributionTypes: ['MATERIAL', 'MONEY', 'SERVICE'],
    beneficiaryRelation: null,
    allowOverTarget: false,
    minimumSupervisors: 0,
    minimumSupervisorRank: null,
    pointBonusPercent: 0,
    requestedPointBonusPercent: 0,
    submittedAt: new Date(),
    operationStage: 'EXECUTION' as const,
    storedOperationStage: 'EXECUTION' as const,
    distribution: null,
    summaryPublishedAt: null,
    intakeStartsAt: new Date(),
    intakeEndsAt: null,
    totalEstimatedPortions: 0,
    totalEstimatedAmount: 0,
    intakeLocations: [],
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
    findParticipation: jest.fn().mockResolvedValue(null),
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
    listBeneficiaryPlans: jest.fn(async () => []),
    findOrganizerProfile: jest.fn().mockResolvedValue(null),
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
    // `null` = chưa cấu hình → giá trị mặc định của từng khoá.
    getConfigValue: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

const MediaKey = 'users/actor/campaign-media/a.webp';

/** Kho lưu trữ giả: key đuôi .mp4 là video, còn lại là ảnh. */
function makeStorage() {
  return {
    createCampaignMediaUpload: jest.fn(),
    confirmCampaignMediaUpload: jest.fn(
      async (_userId: string, key: string) => ({
        mediaType: key.endsWith('.mp4')
          ? ('VIDEO' as const)
          : ('IMAGE' as const),
        publicUrl: `https://cdn.chantam.test/${key}`,
      }),
    ),
  } as unknown as jest.Mocked<IObjectStorage> & {
    confirmCampaignMediaUpload: jest.Mock;
    createCampaignMediaUpload: jest.Mock;
  };
}

function writeInput(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 24 * Hour);
  return {
    // Mặc định là hoạt động có tổ chức: đó là loại duy nhất tồn tại trước 12/10,
    // nên các phép kiểm cũ vẫn nói đúng điều chúng vốn nói.
    campaignType: 'ORGANIZED_CAMPAIGN' as const,
    title: 'Bếp cơm Vu Lan 2026',
    description: 'Nấu và trao 500 suất cơm chay tại chùa.',
    media: [MediaKey],
    coverKey: MediaKey,
    badgeName: 'Tấm lòng Vu Lan',
    startTime: start.toISOString(),
    // Đủ xa để khung trao cố định trong các phép kiểm (2026-12-20) nằm trước kết thúc —
    // CR 22/11/2026: khung trao phải ≤ endTime.
    endTime: new Date(start.getTime() + 200 * 24 * Hour).toISOString(),
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
      makeStorage(),
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
        makeStorage(),
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
      makeStorage(),
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
        makeStorage(),
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
        makeStorage(),
      ).handle({
        ...writeInput({ title: 'x', description: 'a' }),
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
      makeStorage(),
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
        makeStorage(),
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
      makeStorage(),
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
        makeStorage(),
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
      makeStorage(),
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
      makeStorage(),
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
      makeStorage(),
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
      makeStorage(),
    ).handle({
      ...writeInput({
        campaignType: 'ORGANIZED_CAMPAIGN',
        acceptedContributionTypes: [],
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
      makeStorage(),
    ).handle({
      ...writeInput({
        locationLabel: 'Chùa Vĩnh Nghiêm',
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
        quantityPerPortion: 1,
      },
      {
        categoryId: null,
        itemName: 'Mì gói',
        description: null,
        unit: 'thùng',
        targetQuantity: 10,
        allowAlternative: true,
        sortOrder: 1,
        quantityPerPortion: 1,
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
      makeStorage(),
    ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false });

    expect(repository.create.mock.calls[0][0].needs).toEqual([]);
  });
});

describe('CreateCharityCampaignUseCase · loại tiếp nhận và ba nhóm nhu cầu', () => {
  const create = (
    repository: ReturnType<typeof makeRepository>,
    extra: Record<string, unknown> = {},
  ) =>
    new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
      makeStorage(),
    ).handle({
      ...writeInput(extra),
      actorUserId: ActorId,
      asAdmin: false,
    } as never);

  it('tạo chiến dịch có distribution + scheduledStart/End → repository.create nhận window đúng', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    await create(repository, {
      submit: false,
      distribution: {
        method: 'OTHER_LOCATION',
        contributionTypes: ['MATERIAL'],
        scheduledStart: '2026-12-20T01:00:00Z',
        scheduledEnd: '2026-12-20T09:00:00Z',
        coordinatorName: ' Điều phối viên ',
        coordinatorPhone: '0901000000',
      },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        distribution: {
          input: expect.objectContaining({
            distributionMethod: 'OTHER_LOCATION',
            contributionTypes: ['MATERIAL'],
            privateDetails: expect.objectContaining({
              coordinatorName: 'Điều phối viên',
              coordinatorPhone: '0901000000',
            }),
          }),
          window: {
            startsAt: new Date('2026-12-20T01:00:00Z'),
            endsAt: new Date('2026-12-20T09:00:00Z'),
          },
        },
      }),
    );
  });

  it('không gửi scheduledStart → window null, vẫn lưu hình thức trao', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    await create(repository, {
      submit: false,
      distribution: {
        method: 'OTHER_LOCATION',
        contributionTypes: ['MATERIAL'],
        coordinatorName: 'Điều phối viên',
      },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        distribution: expect.objectContaining({
          input: expect.objectContaining({
            distributionMethod: 'OTHER_LOCATION',
          }),
          window: null,
        }),
      }),
    );
  });

  it('distribution SHIPPING thiếu recipientPhone trả 400 trước storage', async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    await expect(
      new CreateCharityCampaignUseCase(
        repository,
        makeEntitlements(true),
        makeAdmin(true),
        storage,
      ).handle({
        ...writeInput({
          submit: false,
          distribution: {
            method: 'SHIPPING',
            contributionTypes: ['MATERIAL'],
            location: { address: 'Địa chỉ kín' },
            scheduledStart: '2026-12-20T01:00:00Z',
            scheduledEnd: '2026-12-20T09:00:00Z',
            recipientName: 'Người nhận',
            carrier: 'Nhà xe',
            shippingFeePayer: 'ORGANIZER',
            estimatedShippingFee: 10000,
          },
        }),
        actorUserId: ActorId,
        asAdmin: false,
      } as never),
    ).rejects.toThrow(CharityDistributionFieldRequiredException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it('distribution BANK_TRANSFER không có MONEY trả mã method mismatch', async () => {
    await expect(
      create(makeRepository(), {
        submit: false,
        distribution: {
          method: 'BANK_TRANSFER',
          contributionTypes: ['MATERIAL'],
          scheduledStart: '2026-12-20T01:00:00Z',
          scheduledEnd: '2026-12-20T09:00:00Z',
          transferContent: 'Ung ho bep an',
        },
      }),
    ).rejects.toThrow(CharityDistributionMethodMismatchException);
  });

  it('distribution 400 thắng submit requirements 409 và không gọi storage', async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    await expect(
      new CreateCharityCampaignUseCase(
        repository,
        makeEntitlements(true),
        makeAdmin(true),
        storage,
      ).handle({
        ...writeInput({
          acceptedContributionTypes: ['SERVICE'],
          distribution: {
            method: 'BANK_TRANSFER',
            contributionTypes: ['MATERIAL'],
            scheduledStart: '2026-12-20T01:00:00Z',
            scheduledEnd: '2026-12-20T09:00:00Z',
            transferContent: 'Ung ho bep an',
          },
        }),
        actorUserId: ActorId,
        asAdmin: false,
      } as never),
    ).rejects.toThrow(CharityDistributionMethodMismatchException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it('tạo submit mặc định bật SERVICE không có otherSupportNeeds → 409, không gọi storage', async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    await expect(
      new CreateCharityCampaignUseCase(
        repository,
        makeEntitlements(true),
        makeAdmin(true),
        storage,
      ).handle({
        ...writeInput({ acceptedContributionTypes: ['SERVICE'] }),
        actorUserId: ActorId,
        asAdmin: false,
      }),
    ).rejects.toThrow(CharitySubmitRequirementsUnmetException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('tạo nháp submit:false bật SERVICE rỗng → tạo được', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    await create(repository, {
      submit: false,
      acceptedContributionTypes: ['SERVICE'],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ submitted: false }),
    );
  });

  const adminCreate = (
    repository: ReturnType<typeof makeRepository>,
    storage: ReturnType<typeof makeStorage>,
    extra: Record<string, unknown>,
  ) =>
    new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
      storage,
    ).handle({
      ...writeInput(extra),
      actorUserId: ActorId,
      asAdmin: true,
    } as never);

  it('Admin tạo, bật MONEY, có fundingNeeds → tạo được (tài khoản nhận thêm sau)', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    await adminCreate(repository, makeStorage(), {
      acceptedContributionTypes: ['MONEY'],
      fundingNeeds: [{ title: 'Viện phí', targetAmount: 100_000 }],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedContributionTypes: ['MONEY'] }),
    );
  });

  it('Admin tạo bật MONEY không có fundingNeeds → vẫn 409 (thiếu nhu cầu tiền)', async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    const failure = adminCreate(repository, storage, {
      acceptedContributionTypes: ['MONEY'],
    }).catch((error: unknown) => error);
    await expect(failure).resolves.toBeInstanceOf(
      CharitySubmitRequirementsUnmetException,
    );
    const message = ((await failure) as Error).message;
    expect(message).toContain('nhu cầu tiền');
    expect(message).not.toContain('tài khoản');
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it('thành viên tạo + gửi duyệt bật MONEY có fundingNeeds → vẫn 409 (chưa có tài khoản nhận)', async () => {
    const repository = makeRepository();
    await expect(
      create(repository, {
        acceptedContributionTypes: ['MONEY'],
        fundingNeeds: [{ title: 'Viện phí', targetAmount: 100_000 }],
      }),
    ).rejects.toThrow('tài khoản nhận');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('distribution BANK_TRANSFER khi dự án không nhận MONEY → method mismatch', async () => {
    const repository = makeRepository();
    await expect(
      create(repository, {
        submit: false,
        acceptedContributionTypes: ['MATERIAL'],
        distribution: {
          method: 'BANK_TRANSFER',
          contributionTypes: ['MONEY'],
          scheduledStart: '2026-12-20T01:00:00Z',
          scheduledEnd: '2026-12-20T09:00:00Z',
          transferContent: 'Ung ho bep an',
        },
      }),
    ).rejects.toThrow(CharityDistributionMethodMismatchException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('không gửi acceptedContributionTypes + có needs → MATERIAL', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    await create(repository, {
      needs: [{ itemName: 'Gạo', unit: 'kg', targetQuantity: 1 }],
      locationLabel: 'Chùa Vĩnh Nghiêm',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedContributionTypes: ['MATERIAL'] }),
    );
  });
  it('gửi SERVICE, MATERIAL, SERVICE → MATERIAL, SERVICE', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    await create(repository, {
      submit: false,
      acceptedContributionTypes: ['SERVICE', 'MATERIAL', 'SERVICE'],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedContributionTypes: ['MATERIAL', 'SERVICE'],
      }),
    );
  });
  it('fundingNeeds khi chưa bật MONEY → CharityContributionTypeDisabledException', async () => {
    const repository = makeRepository();
    await expect(
      create(repository, {
        acceptedContributionTypes: ['MATERIAL'],
        fundingNeeds: [{ title: 'Viện phí', targetAmount: 100_000 }],
      }),
    ).rejects.toThrow(CharityContributionTypeDisabledException);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['bankAccountId', 'beneficiaryPartyId'] as const)(
    'fundingNeeds có %s → ValidationFailedException',
    async (field) => {
      const repository = makeRepository();
      await expect(
        create(repository, {
          fundingNeeds: [
            {
              title: 'Viện phí',
              targetAmount: 100_000,
              [field]: '10000000-0000-4000-8000-000000000004',
            },
          ],
        }),
      ).rejects.toThrow(`fundingNeeds[0].${field}:`);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
  it('fundingNeeds và otherSupportNeeds được trim, sortOrder theo thứ tự', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    await create(repository, {
      submit: false,
      fundingNeeds: [
        {
          title: '  Viện phí  ',
          description: '  Khám  ',
          targetAmount: 100_000,
        },
        { title: ' Thuốc ', targetAmount: 200_000 },
      ],
      otherSupportNeeds: [
        {
          supportType: 'TRANSPORT',
          title: '  Chở đồ ',
          unit: ' chuyến ',
          targetQuantity: 2,
        },
      ],
    });
    const params = repository.create.mock.calls[0][0];
    expect(params.fundingNeeds[0]).toMatchObject({
      title: 'Viện phí',
      description: 'Khám',
      sortOrder: 0,
    });
    expect(params.fundingNeeds[1].sortOrder).toBe(1);
    expect(params.supportNeeds[0]).toMatchObject({
      title: 'Chở đồ',
      unit: 'chuyến',
      sortOrder: 0,
    });
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
  function activeCampaign(overrides: Partial<ICharityCampaign> = {}) {
    return campaign({
      approvalStatus: 'APPROVED' as const,
      isActive: true,
      endTime: new Date(Date.now() + 7 * 24 * Hour),
      acceptedContributionTypes: ['MATERIAL'],
      ...overrides,
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

  it('đóng góp hiện vật vào chiến dịch không bật MATERIAL → 409, không gọi createContribution', async () => {
    const repository = makeSubmitRepo({
      findByGlobalId: jest
        .fn()
        .mockResolvedValue(activeCampaign({ acceptedContributionTypes: [] })),
    });
    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: Need, offeredQuantity: 50 }],
      }),
    ).rejects.toBeInstanceOf(CharityContributionTypeDisabledException);
    expect(repository.createContribution).not.toHaveBeenCalled();
  });

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
    repository.findByGlobalId.mockResolvedValue(campaign());
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

  it('rút đề nghị vẫn được khi đã tắt MATERIAL', async () => {
    const repository = makeUpdateRepo();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ acceptedContributionTypes: [] }),
    );
    await expect(
      new UpdateCharityContributionUseCase(repository).handle({
        contributionId: ContributionId,
        contributorId: ActorId,
        action: 'WITHDRAW',
      }),
    ).resolves.toMatchObject({ status: 'WITHDRAWN' });
  });

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

describe('GetCharityContributionUseCase (đích của thông báo đóng góp)', () => {
  const ContributionId = 'contribution-1';
  const contribution = {
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
  };

  it('người đóng góp và người điều phối đều đọc được', async () => {
    const repository = makeRepository();
    repository.findContributionByGlobalId.mockResolvedValue(
      contribution as never,
    );
    repository.isCampaignManager.mockImplementation(
      async (_campaignId: string, userId: string) => userId === OrganizerId,
    );

    for (const viewer of [ActorId, OrganizerId])
      await expect(
        new GetCharityContributionUseCase(repository).handle({
          contributionId: ContributionId,
          viewerUserId: viewer,
        }),
      ).resolves.toMatchObject({
        globalId: ContributionId,
        campaignId: CampaignId,
      });
    expect(repository.isCampaignManager).toHaveBeenCalledWith(
      CampaignId,
      OrganizerId,
    );
  });

  it('người NGOÀI nhận cùng lỗi với lượt không tồn tại', async () => {
    // Phân biệt hai cái là để lộ ai đang đóng góp cho hoạt động nào.
    const repository = makeRepository();
    repository.findContributionByGlobalId.mockResolvedValue(
      contribution as never,
    );

    await expect(
      new GetCharityContributionUseCase(repository).handle({
        contributionId: ContributionId,
        viewerUserId: 'nguoi-ngoai',
      }),
    ).rejects.toBeInstanceOf(CharityContributionNotFoundException);
  });

  it('không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.findContributionByGlobalId.mockResolvedValue(null);

    await expect(
      new GetCharityContributionUseCase(repository).handle({
        contributionId: ContributionId,
        viewerUserId: ActorId,
      }),
    ).rejects.toBeInstanceOf(CharityContributionNotFoundException);
  });
});

describe('Lát D — ngoài app và đóng chiến dịch (F65b §7–§8)', () => {
  const Need = '99999999-9999-4999-8999-99999999aaaa';

  it('người tổ chức đóng được chiến dịch của mình mà không cần quyền Admin', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId, summaryPublishedAt: new Date() }),
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
      campaign({ createdBy: 'nguoi-khac', summaryPublishedAt: new Date() }),
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

  it('đóng khi chưa công khai tổng kết → 409 0x13_65, closeCampaign không gọi', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId, summaryPublishedAt: null }),
    );
    await expect(
      new CloseCharityCampaignUseCase(
        repository,
        makeAdmin(false),
        makeNotifier(),
      ).handle({ campaignId: CampaignId, actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(CharityCampaignSummaryNotPublishedException);
    expect(repository.closeCampaign).not.toHaveBeenCalled();
  });

  it('Admin không force cũng cần tổng kết đã công khai', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-khac', summaryPublishedAt: null }),
    );
    await expect(
      new CloseCharityCampaignUseCase(
        repository,
        makeAdmin(true),
        makeNotifier(),
      ).handle({ campaignId: CampaignId, actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(CharityCampaignSummaryNotPublishedException);
    expect(repository.closeCampaign).not.toHaveBeenCalled();
  });

  it('Admin force không lý do → 400', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-khac', summaryPublishedAt: null }),
    );
    const admin = makeAdmin(true);
    admin.appendAudit = jest.fn();
    await expect(
      new CloseCharityCampaignUseCase(repository, admin, makeNotifier()).handle(
        {
          campaignId: CampaignId,
          actorUserId: ActorId,
          force: true,
          reason: '   ',
        },
      ),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.closeCampaign).not.toHaveBeenCalled();
    expect(admin.appendAudit).not.toHaveBeenCalled();
  });

  it('Admin force có lý do → đóng + appendAudit', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: 'nguoi-khac', summaryPublishedAt: null }),
    );
    repository.closeCampaign.mockResolvedValue({
      campaignId: CampaignId,
      rejectedContributions: 0,
      openDeliveries: 0,
      rejected: [],
    });
    const admin = makeAdmin(true);
    admin.appendAudit = jest.fn().mockResolvedValue(undefined);
    await new CloseCharityCampaignUseCase(
      repository,
      admin,
      makeNotifier(),
    ).handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
      force: true,
      reason: ' Ban tổ chức bỏ dở ',
    });
    expect(repository.closeCampaign).toHaveBeenCalled();
    expect(admin.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ActorId,
        action: 'CHARITY_CAMPAIGN_FORCE_CLOSE',
        resourceType: 'CHARITY_CAMPAIGN',
        resourceId: CampaignId,
        reason: 'Ban tổ chức bỏ dở',
      }),
    );
  });

  it('chủ dự án gửi force không có tác dụng (force chỉ dành cho Admin)', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId, summaryPublishedAt: null }),
    );
    await expect(
      new CloseCharityCampaignUseCase(
        repository,
        makeAdmin(false),
        makeNotifier(),
      ).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        force: true,
        reason: 'muốn đóng',
      }),
    ).rejects.toBeInstanceOf(CharityCampaignSummaryNotPublishedException);
  });

  it('đã công khai → đóng được', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId, summaryPublishedAt: new Date() }),
    );
    repository.closeCampaign.mockResolvedValue({
      campaignId: CampaignId,
      rejectedContributions: 0,
      openDeliveries: 0,
      rejected: [],
    });
    await new CloseCharityCampaignUseCase(
      repository,
      makeAdmin(false),
      makeNotifier(),
    ).handle({ campaignId: CampaignId, actorUserId: ActorId });
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
      campaign({ createdBy: ActorId, summaryPublishedAt: new Date() }),
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
      makeStorage(),
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
      makeStorage(),
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
      makeStorage(),
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
        makeStorage(),
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

describe('CreateCharityCampaignUseCase · media (spec 12/10)', () => {
  const create = (
    repository: ReturnType<typeof makeRepository>,
    storage: ReturnType<typeof makeStorage>,
    overrides: Record<string, unknown> = {},
  ) =>
    new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
      storage,
    ).handle({
      ...writeInput(overrides),
      actorUserId: ActorId,
      asAdmin: false,
    });

  it('xác nhận TỪNG key với đúng người gọi, rồi ghi media + banner từ ảnh bìa', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const storage = makeStorage();
    const video = 'users/actor/campaign-media/b.mp4';

    await create(repository, storage, {
      media: [video, MediaKey],
      coverKey: MediaKey,
    });

    expect(storage.confirmCampaignMediaUpload.mock.calls).toEqual([
      [ActorId, video],
      [ActorId, MediaKey],
    ]);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerUrl: `https://cdn.chantam.test/${MediaKey}`,
        media: [
          expect.objectContaining({
            storageKey: video,
            mediaType: 'VIDEO',
            sortOrder: 0,
            isCover: false,
          }),
          expect.objectContaining({
            storageKey: MediaKey,
            mediaType: 'IMAGE',
            sortOrder: 1,
            isCover: true,
          }),
        ],
      }),
    );
  });

  it('hình dạng sai thì KHÔNG gọi kho lưu trữ', async () => {
    const storage = makeStorage();

    await expect(
      create(makeRepository(), storage, {
        media: [MediaKey, MediaKey],
        coverKey: MediaKey,
      }),
    ).rejects.toThrow(CharityMediaInvalidException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it('bìa là video thì CharityMediaInvalidException và không ghi gì', async () => {
    const repository = makeRepository();
    const video = 'users/actor/campaign-media/b.mp4';

    await expect(
      create(repository, makeStorage(), {
        media: [MediaKey, video],
        coverKey: video,
      }),
    ).rejects.toThrow(CharityMediaInvalidException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('lỗi chính sách kho lưu trữ thành ValidationFailedException (400), không lọt 500', async () => {
    const storage = makeStorage();
    storage.confirmCampaignMediaUpload.mockRejectedValueOnce(
      new StorageValidationError('Không tìm thấy object'),
    );

    await expect(create(makeRepository(), storage)).rejects.toThrow(
      ValidationFailedException,
    );
  });

  it('không đủ quyền tạo thì KHÔNG gọi kho lưu trữ', async () => {
    const storage = makeStorage();

    await expect(
      new CreateCharityCampaignUseCase(
        makeRepository(),
        makeEntitlements(null),
        makeAdmin(true),
        storage,
      ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false }),
    ).rejects.toThrow(CharityCampaignCreateNotAllowedException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });
});

describe('RequestCharityMediaUploadUseCase', () => {
  it('xin URL dưới namespace của chính người gọi', async () => {
    const storage = makeStorage();
    storage.createCampaignMediaUpload.mockResolvedValue({ key: 'k' });

    await new RequestCharityMediaUploadUseCase(storage).handle({
      userId: ActorId,
      contentType: 'image/webp',
      contentLength: 10,
    });

    expect(storage.createCampaignMediaUpload).toHaveBeenCalledWith({
      userId: ActorId,
      contentType: 'image/webp',
      contentLength: 10,
    });
  });

  it('lỗi chính sách thành ValidationFailedException', async () => {
    const storage = makeStorage();
    storage.createCampaignMediaUpload.mockRejectedValue(
      new StorageValidationError('PDF'),
    );

    await expect(
      new RequestCharityMediaUploadUseCase(storage).handle({
        userId: ActorId,
        contentType: 'application/pdf',
        contentLength: 10,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });
});

describe('ReplaceCharityMediaUseCase', () => {
  const pending = () =>
    campaign({
      approvalStatus: 'PENDING_APPROVAL',
      approvedAt: null,
      approvedBy: null,
      createdBy: ActorId,
    });
  const command = {
    campaignId: 'campaign-1',
    actorUserId: ActorId,
    media: [MediaKey],
    coverKey: MediaKey,
  };

  it('người tạo + chờ duyệt: xác nhận key rồi gọi replaceMedia', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(pending());
    repository.replaceMedia.mockResolvedValue(pending());

    await new ReplaceCharityMediaUseCase(repository, makeStorage()).handle(
      command,
    );

    expect(repository.replaceMedia).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      actorUserId: ActorId,
      bannerUrl: `https://cdn.chantam.test/${MediaKey}`,
      media: [
        expect.objectContaining({
          storageKey: MediaKey,
          isCover: true,
          sortOrder: 0,
        }),
      ],
    });
  });

  it('không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(null);

    await expect(
      new ReplaceCharityMediaUseCase(repository, makeStorage()).handle(command),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });

  it('không phải người tạo (kể cả coordinator) thì NotOrganizer, không gọi kho lưu trữ', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue({
      ...pending(),
      createdBy: 'someone-else',
    });
    repository.isCampaignManager.mockResolvedValue(true);
    const storage = makeStorage();

    await expect(
      new ReplaceCharityMediaUseCase(repository, storage).handle(command),
    ).rejects.toThrow(CharityNotOrganizerException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'hồ sơ %s thì NotEditable',
    async (status) => {
      const repository = makeRepository();
      repository.findByGlobalId.mockResolvedValue({
        ...pending(),
        approvalStatus: status,
      });

      await expect(
        new ReplaceCharityMediaUseCase(repository, makeStorage()).handle(
          command,
        ),
      ).rejects.toThrow(CharityMediaNotEditableException);
      expect(repository.replaceMedia).not.toHaveBeenCalled();
    },
  );
});

describe('GetAdminCharityCampaignUseCase (CMS A4)', () => {
  it('đòi campaign.read', async () => {
    const repository = makeRepository();
    await expect(
      new GetAdminCharityCampaignUseCase(repository, makeAdmin(false)).handle({
        actorUserId: ActorId,
        campaignId: CampaignId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.findByGlobalId).not.toHaveBeenCalled();
  });

  it('đọc được hồ sơ CHƯA duyệt — đường công khai thì không', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        approvalStatus: 'PENDING_APPROVAL',
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'OTHER',
      }),
    );

    const result = await new GetAdminCharityCampaignUseCase(
      repository,
      makeAdmin(true),
    ).handle({ actorUserId: ActorId, campaignId: CampaignId });

    expect(repository.findByGlobalId).toHaveBeenCalledWith(CampaignId);
    expect(result.campaign).toMatchObject({
      approvalStatus: 'PENDING_APPROVAL',
      campaignType: 'INDIVIDUAL_APPEAL',
      beneficiaryRelation: 'OTHER',
      isJoined: null,
    });
  });

  it('không có thì 404', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(null);

    await expect(
      new GetAdminCharityCampaignUseCase(repository, makeAdmin(true)).handle({
        actorUserId: ActorId,
        campaignId: CampaignId,
      }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });
});

describe('GetAdminCampaignNeedsUseCase', () => {
  it('đòi campaign.read và không đọc gì khi thiếu', async () => {
    const repository = makeRepository();
    await expect(
      new GetAdminCampaignNeedsUseCase(repository, makeAdmin(false)).handle({
        actorUserId: ActorId,
        campaignId: CampaignId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.findByGlobalId).not.toHaveBeenCalled();
    expect(repository.listNeeds).not.toHaveBeenCalled();
  });

  it('đọc được nhu cầu của hồ sơ CHƯA duyệt — để Admin xem trước khi duyệt', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ approvalStatus: 'PENDING_APPROVAL' }),
    );

    const result = await new GetAdminCampaignNeedsUseCase(
      repository,
      makeAdmin(true),
    ).handle({ actorUserId: ActorId, campaignId: CampaignId });

    expect(repository.listNeeds).toHaveBeenCalledWith(CampaignId);
    expect(result).toMatchObject({
      campaignId: CampaignId,
      progressSource: 'LEGACY_DECLARED',
    });
  });

  it('không có thì 404', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(null);

    await expect(
      new GetAdminCampaignNeedsUseCase(repository, makeAdmin(true)).handle({
        actorUserId: ActorId,
        campaignId: CampaignId,
      }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });
});

describe('DeleteCharityCampaignUseCase', () => {
  const remove = (
    repository: ReturnType<typeof makeRepository>,
    admin: ReturnType<typeof makeAdmin>,
  ) =>
    new DeleteCharityCampaignUseCase(repository, admin).handle({
      actorUserId: ActorId,
      campaignId: CampaignId,
      reason: '  Hồ sơ tạo trùng  ',
    });

  it('đòi campaign.manage', async () => {
    const repository = makeRepository();
    await expect(remove(repository, makeAdmin(false))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('đã có người tham gia thì 409 — đóng hoặc tắt thay vì xoá', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    (
      repository as unknown as { softDeleteIfUnused: jest.Mock }
    ).softDeleteIfUnused = jest.fn().mockResolvedValue('HAS_ACTIVITY');
    const admin = {
      ...makeAdmin(true),
      appendAudit: jest.fn(),
    } as unknown as ReturnType<typeof makeAdmin>;

    await expect(remove(repository, admin)).rejects.toThrow(
      CharityCampaignHasActivityException,
    );
    expect(
      (admin as unknown as { appendAudit: jest.Mock }).appendAudit,
    ).not.toHaveBeenCalled();
  });

  it('xoá được thì audit kèm lý do đã cắt trắng', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    (
      repository as unknown as { softDeleteIfUnused: jest.Mock }
    ).softDeleteIfUnused = jest.fn().mockResolvedValue('DELETED');
    const appendAudit = jest.fn();
    const admin = {
      ...makeAdmin(true),
      appendAudit,
    } as unknown as ReturnType<typeof makeAdmin>;

    await expect(remove(repository, admin)).resolves.toEqual({
      campaignId: CampaignId,
    });
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE_CHARITY_CAMPAIGN',
        resourceId: CampaignId,
        reason: 'Hồ sơ tạo trùng',
      }),
    );
  });

  it('không tồn tại thì 404', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(null);
    await expect(remove(repository, makeAdmin(true))).rejects.toThrow(
      CharityCampaignNotFoundException,
    );
  });
});

describe('UpdateAdminCharityCampaignUseCase', () => {
  function setup(granted = true) {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ lat: 10.77, lng: 106.69, locationLabel: 'Quận 1' }),
    );
    const updateContent = jest.fn(async (params: Record<string, unknown>) =>
      campaign(params as never),
    );
    (repository as unknown as { updateContent: jest.Mock }).updateContent =
      updateContent;
    const appendAudit = jest.fn();
    const admin = {
      ...makeAdmin(granted),
      appendAudit,
    } as unknown as ReturnType<typeof makeAdmin>;
    const useCase = new UpdateAdminCharityCampaignUseCase(repository, admin);
    return { useCase, updateContent, appendAudit };
  }
  const base = { actorUserId: ActorId, campaignId: CampaignId, reason: 'Sửa' };

  it('đòi campaign.manage', async () => {
    const { useCase, updateContent } = setup(false);
    await expect(useCase.handle({ ...base, title: 'Mới' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(updateContent).not.toHaveBeenCalled();
  });

  it('trường bỏ trống giữ nguyên; audit chỉ ghi trường đổi', async () => {
    const { useCase, updateContent, appendAudit } = setup();
    await useCase.handle({ ...base, title: '  Áo ấm vùng cao 2026  ' });

    expect(updateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Áo ấm vùng cao 2026',
        lat: 10.77,
        lng: 106.69,
        locationLabel: 'Quận 1',
      }),
    );
    const [[audit]] = appendAudit.mock.calls as unknown as [
      [{ before: Record<string, unknown>; after: Record<string, unknown> }],
    ];
    expect(Object.keys(audit.after)).toEqual(['title']);
  });

  it('cặp lat/lng null là xoá vị trí; gửi lẻ một vế là 400', async () => {
    const { useCase, updateContent } = setup();
    await useCase.handle({ ...base, lat: null, lng: null });
    expect(updateContent).toHaveBeenCalledWith(
      expect.objectContaining({ lat: null, lng: null }),
    );

    await expect(useCase.handle({ ...base, lat: 10.8 })).rejects.toThrow(
      ValidationFailedException,
    );
  });

  it('luật của đường tạo vẫn áp: mô tả quá ngắn bị từ chối', async () => {
    const { useCase, updateContent } = setup();
    await expect(
      useCase.handle({ ...base, description: 'ngắn' }),
    ).rejects.toThrow(ValidationFailedException);
    expect(updateContent).not.toHaveBeenCalled();
  });
});

describe('UpdateAdminCharityCampaignUseCase · loại tiếp nhận', () => {
  it('acceptedContributionTypes undefined giữ nguyên', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ acceptedContributionTypes: ['MONEY'] }),
    );
    (repository as unknown as { updateContent: jest.Mock }).updateContent =
      jest.fn(async (params) => campaign(params));
    const admin = { ...makeAdmin(true), appendAudit: jest.fn() } as never;
    await new UpdateAdminCharityCampaignUseCase(repository, admin).handle({
      actorUserId: ActorId,
      campaignId: CampaignId,
      reason: 'Sửa',
    });
    expect(repository.updateContent).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedContributionTypes: ['MONEY'] }),
    );
  });

  it('gửi lại cùng các loại (khác thứ tự) → audit không ghi là đổi; đổi thật thì ghi', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ acceptedContributionTypes: ['MATERIAL', 'MONEY'] }),
    );
    (repository as unknown as { updateContent: jest.Mock }).updateContent =
      jest.fn(async (params) => campaign(params));
    const appendAudit = jest.fn();
    const useCase = new UpdateAdminCharityCampaignUseCase(repository, {
      ...makeAdmin(true),
      appendAudit,
    } as never);
    const changedKeys = (call: number) =>
      Object.keys(
        (
          appendAudit.mock.calls[call] as [{ after: Record<string, unknown> }]
        )[0].after,
      );
    await useCase.handle({
      actorUserId: ActorId,
      campaignId: CampaignId,
      reason: 'Sửa',
      acceptedContributionTypes: ['MONEY', 'MATERIAL'],
    });
    expect(changedKeys(0)).not.toContain('acceptedContributionTypes');
    await useCase.handle({
      actorUserId: ActorId,
      campaignId: CampaignId,
      reason: 'Sửa',
      acceptedContributionTypes: ['MATERIAL'],
    });
    expect(changedKeys(1)).toEqual(['acceptedContributionTypes']);
  });
});

describe('Điều kiện tham gia chiến dịch (PR #54)', () => {
  describe('CreateCharityCampaignUseCase', () => {
    const create = (
      repository: ReturnType<typeof makeRepository>,
      extra: Record<string, unknown> = {},
    ) =>
      new CreateCharityCampaignUseCase(
        repository,
        makeEntitlements(true),
        makeAdmin(true),
        makeStorage(),
      ).handle({
        ...writeInput(extra),
        actorUserId: ActorId,
        asAdmin: false,
      } as never);

    it('không gửi thì giữ hành vi cũ: 0 người tối thiểu, không giới hạn hạng', async () => {
      const repository = makeRepository();
      repository.create.mockResolvedValue(campaign());
      await create(repository);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          minimumSupervisors: 0,
          minimumSupervisorRank: null,
        }),
      );
    });

    it('gửi kèm thì lưu đúng giá trị', async () => {
      const repository = makeRepository();
      repository.create.mockResolvedValue(campaign());
      await create(repository, {
        minimumSupervisors: 20,
        minimumSupervisorRank: UserRanks.SILVER,
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          minimumSupervisors: 20,
          minimumSupervisorRank: UserRanks.SILVER,
        }),
      );
    });

    it.each([
      [{ minimumSupervisors: -1 }],
      [{ minimumSupervisorRank: 'PLATINUM' }],
    ])('giá trị sai %p -> 400, không ghi', async (extra) => {
      const repository = makeRepository();
      await expect(create(repository, extra)).rejects.toThrow(
        ValidationFailedException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('UpdateAdminCharityCampaignUseCase', () => {
    function setup(existing: Partial<ICharityCampaign> = {}) {
      const repository = makeRepository();
      repository.findByGlobalId.mockResolvedValue(campaign(existing));
      const updateContent = jest.fn(async (params: Record<string, unknown>) =>
        campaign(params as never),
      );
      (repository as unknown as { updateContent: jest.Mock }).updateContent =
        updateContent;
      const appendAudit = jest.fn();
      const admin = {
        ...makeAdmin(true),
        appendAudit,
      } as unknown as ReturnType<typeof makeAdmin>;
      return {
        useCase: new UpdateAdminCharityCampaignUseCase(repository, admin),
        updateContent,
        appendAudit,
      };
    }
    const base = {
      actorUserId: ActorId,
      campaignId: CampaignId,
      reason: 'Sửa',
    };

    it('Admin đặt điều kiện mới; audit ghi đúng hai trường đổi', async () => {
      const { useCase, updateContent, appendAudit } = setup();
      await useCase.handle({
        ...base,
        minimumSupervisors: 30,
        minimumSupervisorRank: UserRanks.GOLD,
      } as never);
      expect(updateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          minimumSupervisors: 30,
          minimumSupervisorRank: UserRanks.GOLD,
        }),
      );
      const [[audit]] = appendAudit.mock.calls as unknown as [
        [{ after: Record<string, unknown> }],
      ];
      expect(Object.keys(audit.after).sort()).toEqual([
        'minimumSupervisorRank',
        'minimumSupervisors',
      ]);
    });

    it('bỏ trống thì giữ nguyên; gửi null là bỏ giới hạn hạng', async () => {
      const { useCase, updateContent } = setup({
        minimumSupervisors: 10,
        minimumSupervisorRank: UserRanks.SILVER,
      });
      await useCase.handle({ ...base, title: 'Tên mới đủ dài' } as never);
      expect(updateContent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          minimumSupervisors: 10,
          minimumSupervisorRank: UserRanks.SILVER,
        }),
      );

      await useCase.handle({ ...base, minimumSupervisorRank: null } as never);
      expect(updateContent).toHaveBeenLastCalledWith(
        expect.objectContaining({ minimumSupervisorRank: null }),
      );
    });

    it.each([
      [{ minimumSupervisors: 100_001 }],
      [{ minimumSupervisorRank: 'silver' }],
    ])('giá trị sai %p -> 400', async (extra) => {
      const { useCase, updateContent } = setup();
      await expect(
        useCase.handle({ ...base, ...extra } as never),
      ).rejects.toThrow(ValidationFailedException);
      expect(updateContent).not.toHaveBeenCalled();
    });
  });

  describe('JoinCharityCampaignUseCase', () => {
    function setup(
      minimumSupervisorRank: UserRanks | null,
      currentRank: UserRanks | null,
    ) {
      const repository = makeRepository();
      repository.findByGlobalId.mockResolvedValue(
        campaign({
          minimumSupervisorRank,
          endTime: new Date(Date.now() + 24 * Hour),
        }),
      );
      repository.register.mockResolvedValue({ created: true } as never);
      const users = {
        findOneBy: jest.fn(async () =>
          currentRank === null
            ? null
            : { globalId: ActorId, rank: currentRank, deletedAt: null },
        ),
      };
      return {
        useCase: new JoinCharityCampaignUseCase(
          repository,
          users as unknown as IUserRepository,
        ),
        repository,
        users,
      };
    }
    // Cổng hạng chỉ áp cho vai giám sát viên (CR 22/11/2026 §6).
    const join = (useCase: JoinCharityCampaignUseCase) =>
      useCase.handle({
        actorUserId: ActorId,
        campaignId: CampaignId,
        role: 'SUPERVISOR',
      });

    it('không giới hạn hạng thì đăng ký được, không cần tra hạng', async () => {
      const { useCase, repository, users } = setup(null, UserRanks.VIEWER);
      await join(useCase);
      expect(repository.register).toHaveBeenCalled();
      expect(users.findOneBy).not.toHaveBeenCalled();
    });

    it.each([UserRanks.SILVER, UserRanks.DIAMOND])(
      'đủ hạng (%s ≥ SILVER) thì đăng ký vào REGISTERED như cũ',
      async (rank) => {
        const { useCase, repository } = setup(UserRanks.SILVER, rank);
        await join(useCase);
        expect(repository.register).toHaveBeenCalledWith({
          campaignId: CampaignId,
          userId: ActorId,
          role: 'SUPERVISOR',
        });
      },
    );

    it('thiếu hạng -> 403 CHARITY_PARTICIPANT_RANK_TOO_LOW, không ghi', async () => {
      const { useCase, repository } = setup(UserRanks.SILVER, UserRanks.MEMBER);
      await expect(join(useCase)).rejects.toThrow(
        CharityParticipantRankTooLowException,
      );
      expect(repository.register).not.toHaveBeenCalled();
    });

    it('đọc hạng HIỆN TẠI từ database theo người gọi — lệnh không mang hạng nào từ token', async () => {
      // Token cũ có thể vẫn ghi GOLD sau khi người dùng bị hạ xuống MEMBER; use case
      // không có đường nào nhận hạng ngoài lượt đọc này.
      const { useCase, users, repository } = setup(
        UserRanks.GOLD,
        UserRanks.MEMBER,
      );
      await expect(join(useCase)).rejects.toThrow(
        CharityParticipantRankTooLowException,
      );
      expect(users.findOneBy).toHaveBeenCalledWith({ globalId: ActorId });
      expect(repository.register).not.toHaveBeenCalled();
    });

    it('đã đăng ký và còn hiệu lực -> 409 đã đăng ký, KHÔNG báo thiếu hạng sau khi Admin nâng hạng', async () => {
      // Admin nâng hạng tối thiểu sau khi người này đã đăng ký: lượt bấm lại phải nói "bạn
      // đã đăng ký", không được nói "bạn không đủ điều kiện" với một người vẫn hợp lệ.
      const { useCase, repository, users } = setup(
        UserRanks.DIAMOND,
        UserRanks.MEMBER,
      );
      repository.findParticipation.mockResolvedValue({
        status: 'REGISTERED',
        role: 'SUPERVISOR',
        checkedInAt: null,
      });
      repository.register.mockResolvedValue({ created: false } as never);
      await expect(join(useCase)).rejects.toThrow(
        CharityAlreadyRegisteredException,
      );
      expect(users.findOneBy).not.toHaveBeenCalled();
    });

    it('đã huỷ rồi đăng ký lại thì vẫn phải qua cổng hạng', async () => {
      const { useCase, repository } = setup(UserRanks.GOLD, UserRanks.MEMBER);
      repository.findParticipation.mockResolvedValue({
        status: 'CANCELLED',
        role: 'SUPERVISOR',
        checkedInAt: null,
      });
      await expect(join(useCase)).rejects.toThrow(
        CharityParticipantRankTooLowException,
      );
      expect(repository.register).not.toHaveBeenCalled();
    });

    it('không tìm thấy tài khoản thì chặn (fail-closed)', async () => {
      const { useCase, repository } = setup(UserRanks.MEMBER, null);
      await expect(join(useCase)).rejects.toThrow(
        CharityParticipantRankTooLowException,
      );
      expect(repository.register).not.toHaveBeenCalled();
    });
  });
});

describe('CreateCharityCampaignUseCase · đơn vị nhận và sàn suất (CR 22/11/2026)', () => {
  const unit = (
    name: string,
    estimatedPortions: number,
    estimatedAmount = 0,
  ) => ({
    name,
    beneficiaryKind: 'GROUP' as const,
    estimatedPortions,
    estimatedAmount,
    address: `${name} — thôn 1`,
  });
  const adminWithMax = (max: number) => {
    const admin = makeAdmin(false);
    (admin as unknown as { getConfigValue: jest.Mock }).getConfigValue = jest
      .fn()
      .mockResolvedValue(max);
    return admin;
  };
  const run = (overrides: Record<string, unknown>, max = 20) => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const promise = new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      adminWithMax(max),
      makeStorage(),
    ).handle({
      ...writeInput({ submit: false, ...overrides }),
      actorUserId: ActorId,
      asAdmin: false,
    } as never);
    return { repository, promise };
  };

  it('ORGANIZED_CAMPAIGN gửi beneficiaries[] → tạo, không ném NotApplicable', async () => {
    const { repository, promise } = run({
      beneficiaries: [unit('Xã A', 200), unit('Xã B', 100)],
    });
    await promise;
    const params = repository.create.mock.calls[0][0] as unknown as {
      beneficiaries: { name: string; estimatedPortions: number }[];
    };
    expect(params.beneficiaries.map((row) => row.name)).toEqual([
      'Xã A',
      'Xã B',
    ]);
  });

  it('vượt charity.max_beneficiaries_per_campaign (cấu hình 2, gửi 3) → 400', async () => {
    const { repository, promise } = run(
      { beneficiaries: [unit('A', 1), unit('B', 1), unit('C', 1)] },
      2,
    );
    await expect(promise).rejects.toThrow(ValidationFailedException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('A 200 + B 100, áo quantityPerPortion 1 target 299 → 400 0x13_5d details.items[0].minimumQuantity = 300', async () => {
    const { repository, promise } = run({
      beneficiaries: [unit('A', 200), unit('B', 100)],
      needs: [
        {
          itemName: 'Áo ấm',
          unit: 'cái',
          targetQuantity: 299,
          quantityPerPortion: 1,
        },
      ],
    });
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CharityNeedBelowEstimatedPortionsException);
    expect(
      (error as { details: { items: { minimumQuantity: number }[] } }).details
        .items[0].minimumQuantity,
    ).toBe(300);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('300 → tạo', async () => {
    const { repository, promise } = run({
      beneficiaries: [unit('A', 200), unit('B', 100)],
      needs: [
        {
          itemName: 'Áo ấm',
          unit: 'cái',
          targetQuantity: 300,
          quantityPerPortion: 1,
        },
      ],
    });
    await promise;
    expect(repository.create).toHaveBeenCalled();
  });

  it('tổng tiền mục tiêu < tổng ước tính → 400 0x13_5e', async () => {
    const { promise } = run({
      acceptedContributionTypes: ['MONEY'],
      beneficiaries: [unit('A', 0, 3_000_000)],
      fundingNeeds: [{ title: 'Tiền gạo', targetAmount: 2_000_000 }],
    });
    await expect(promise).rejects.toBeInstanceOf(
      CharityFundingBelowEstimatedAmountException,
    );
  });
});

describe('CreateCharityCampaignUseCase · điểm tiếp nhận và ba khung (CR 22/11/2026)', () => {
  const at = (day: number) => new Date(Date.UTC(2027, 0, day)).toISOString();
  const adminWithMax = (max: number) => {
    const admin = makeAdmin(false);
    (admin as unknown as { getConfigValue: jest.Mock }).getConfigValue = jest
      .fn()
      .mockResolvedValue(max);
    return admin;
  };
  const point = (label: string, lat?: number, lng?: number) => ({
    label,
    ...(lat === undefined ? {} : { lat, lng }),
  });
  const run = (overrides: Record<string, unknown>, max = 10) => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const promise = new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      adminWithMax(max),
      makeStorage(),
    ).handle({
      ...writeInput({
        submit: false,
        startTime: at(1),
        endTime: at(20),
        ...overrides,
      }),
      actorUserId: ActorId,
      asAdmin: false,
    } as never);
    return { repository, promise };
  };
  const params = (repository: ReturnType<typeof makeRepository>) =>
    repository.create.mock.calls[0][0] as unknown as {
      intakeLocations: { label: string; lat: number | null }[];
      intakeEndsAt: Date | null;
      distributionWindow: { startsAt: Date; endsAt: Date } | null;
      beneficiaries: unknown[];
    };

  it('tạo với 3 intakeLocations + ba khung + 3 đơn vị trong một lần gọi → repository.create nhận đủ', async () => {
    const { repository, promise } = run({
      intakeLocations: [
        point('Chùa A', 10.8, 106.7),
        point('Nhà B'),
        point('Kho C'),
      ],
      intakeEndsAt: at(10),
      distributionStartsAt: at(12),
      distributionEndsAt: at(13),
      beneficiaries: ['A', 'B', 'C'].map((name) => ({
        name,
        beneficiaryKind: 'GROUP',
        estimatedPortions: 1,
        estimatedAmount: 0,
        distributionAt: at(12),
      })),
    });
    await promise;
    const sent = params(repository);
    expect(sent.intakeLocations.map((row) => row.label)).toEqual([
      'Chùa A',
      'Nhà B',
      'Kho C',
    ]);
    expect(sent.intakeEndsAt?.toISOString()).toBe(at(10));
    expect(sent.distributionWindow?.startsAt.toISOString()).toBe(at(12));
    expect(sent.beneficiaries).toHaveLength(3);
  });

  it('intakeEndsAt > distributionStartsAt → 400 0x13_62', async () => {
    const { promise } = run({
      intakeLocations: [point('Chùa A')],
      intakeEndsAt: at(14),
      distributionStartsAt: at(12),
      distributionEndsAt: at(13),
    });
    await expect(promise).rejects.toBeInstanceOf(
      CharityScheduleInvalidException,
    );
  });

  it('đơn vị distributionAt ngoài khung trao → 400 0x13_5c details.beneficiaries[0].name', async () => {
    const { promise } = run({
      intakeLocations: [point('Chùa A')],
      intakeEndsAt: at(10),
      distributionStartsAt: at(12),
      distributionEndsAt: at(13),
      beneficiaries: [
        {
          name: 'Xã Trễ',
          beneficiaryKind: 'GROUP',
          estimatedPortions: 0,
          estimatedAmount: 0,
          distributionAt: at(15),
        },
      ],
    });
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(
      CharityBeneficiaryDistributionTimeOutOfRangeException,
    );
    expect(
      (error as { details: { beneficiaries: { name: string }[] } }).details
        .beneficiaries[0].name,
    ).toBe('Xã Trễ');
  });

  it('không gửi intakeLocations nhưng có lat/lng/locationLabel → một điểm', async () => {
    const { repository, promise } = run({
      lat: 10.78,
      lng: 106.69,
      locationLabel: 'Chùa Vĩnh Nghiêm',
    });
    await promise;
    expect(params(repository).intakeLocations).toEqual([
      expect.objectContaining({ label: 'Chùa Vĩnh Nghiêm', lat: 10.78 }),
    ]);
  });

  it('không có gì → 400 (chiến dịch nhận hiện vật, gửi duyệt)', async () => {
    const { repository, promise } = run({
      submit: true,
      needs: [{ itemName: 'Gạo', unit: 'kg', targetQuantity: 10 }],
    });
    await expect(promise).rejects.toThrow(ValidationFailedException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('intakeLocations 11 với cấu hình 10 → 400', async () => {
    const { repository, promise } = run({
      intakeLocations: Array.from({ length: 11 }, (_, index) =>
        point(`Điểm ${index}`),
      ),
    });
    await expect(promise).rejects.toThrow(ValidationFailedException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('Hết tiếp nhận và điều kiện gửi duyệt của đơn vị nhận (CR 22/11/2026 §3.9, §5.4)', () => {
  const Need = '99999999-9999-4999-8999-99999999aaaa';
  const closed = { intakeEndsAt: new Date(Date.now() - 60_000) };

  it('sau intakeEndsAt: đóng góp mới → 409 0x13_60, không ghi', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        approvalStatus: 'APPROVED',
        isActive: true,
        endTime: new Date(Date.now() + 7 * 24 * Hour),
        acceptedContributionTypes: ['MATERIAL'],
        ...closed,
      }),
    );
    repository.listNeeds.mockResolvedValue([
      { globalId: Need, isActive: true } as never,
    ]);
    await expect(
      new SubmitCharityContributionUseCase(repository, makeNotifier()).handle({
        campaignId: CampaignId,
        contributorId: ActorId,
        items: [{ needItemId: Need, offeredQuantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(CharityIntakeClosedException);
    expect(repository.createContribution).not.toHaveBeenCalled();
  });

  it('sau intakeEndsAt: rút đóng góp → được', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign(closed));
    repository.findContributionByGlobalId.mockResolvedValue({
      globalId: 'contribution-1',
      campaignId: CampaignId,
      contributorId: ActorId,
      status: 'PENDING_REVIEW',
      items: [],
    } as never);
    repository.withdrawContribution.mockResolvedValue({
      status: 'WITHDRAWN',
    } as never);
    await expect(
      new UpdateCharityContributionUseCase(repository).handle({
        contributionId: 'contribution-1',
        contributorId: ActorId,
        action: 'WITHDRAW',
      }),
    ).resolves.toMatchObject({ status: 'WITHDRAWN' });
  });

  it('sau intakeEndsAt: đăng ký tham gia → 409 0x13_60', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ endTime: new Date(Date.now() + 24 * Hour), ...closed }),
    );
    repository.register.mockResolvedValue({ created: true } as never);
    await expect(
      new JoinCharityCampaignUseCase(repository, {
        findOneBy: jest.fn(),
      } as unknown as IUserRepository).handle({
        actorUserId: ActorId,
        campaignId: CampaignId,
      }),
    ).rejects.toBeInstanceOf(CharityIntakeClosedException);
    expect(repository.register).not.toHaveBeenCalled();
  });

  const at = (day: number) => new Date(Date.UTC(2027, 0, day)).toISOString();
  const create = (overrides: Record<string, unknown>, asAdmin = false) => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const admin = makeAdmin(asAdmin);
    (admin as unknown as { getConfigValue: jest.Mock }).getConfigValue = jest
      .fn()
      .mockResolvedValue(20);
    const promise = new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      admin,
      makeStorage(),
    ).handle({
      ...writeInput({
        startTime: at(1),
        endTime: at(20),
        acceptedContributionTypes: ['SERVICE'],
        otherSupportNeeds: [
          {
            supportType: 'TRANSPORT',
            title: 'Chở đồ',
            unit: 'chuyến',
            targetQuantity: 1,
          },
        ],
        beneficiaries: [
          {
            name: 'Xã A',
            beneficiaryKind: 'GROUP',
            estimatedPortions: 0,
            estimatedAmount: 0,
            address: 'Thôn 1',
          },
        ],
        ...overrides,
      }),
      actorUserId: ActorId,
      asAdmin,
    } as never);
    return { repository, promise };
  };

  it.each([
    ['tạo kèm gửi duyệt', { submit: true }, false],
    ['Admin tạo', {}, true],
  ])(
    '%s khi đơn vị thiếu distributionAt → 409 0x13_56 beneficiaries[0].distributionAt',
    async (_label, overrides, asAdmin) => {
      const { repository, promise } = create(overrides, asAdmin);
      const error = await promise.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CharitySubmitRequirementsUnmetException);
      expect((error as Error).message).toContain(
        'beneficiaries[0].distributionAt',
      );
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it('nháp submit:false không kiểm', async () => {
    const { repository, promise } = create({ submit: false });
    await promise;
    expect(repository.create).toHaveBeenCalled();
  });
});

describe('Giám sát viên trong luồng tham gia (CR 22/11/2026 §6)', () => {
  const Coordinator = '99999999-9999-4999-8999-99999999c00d';
  const distributionStartsAt = new Date(Date.now() + 2 * 24 * Hour);
  function setup(
    overrides: Partial<ICharityCampaign> = {},
    rank: UserRanks = UserRanks.MEMBER,
  ) {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        createdBy: 'nguoi-tao',
        endTime: new Date(Date.now() + 5 * 24 * Hour),
        distribution: {
          startsAt: distributionStartsAt,
          endsAt: new Date(distributionStartsAt.getTime() + Hour),
        },
        ...overrides,
      }),
    );
    repository.register.mockResolvedValue({ created: true } as never);
    const users = {
      findOneBy: jest.fn(async () => ({
        globalId: ActorId,
        rank,
        deletedAt: null,
      })),
    };
    const useCase = new JoinCharityCampaignUseCase(
      repository,
      users as unknown as IUserRepository,
    );
    return { repository, users, useCase };
  }
  const join = (
    useCase: JoinCharityCampaignUseCase,
    role?: 'PARTICIPANT' | 'SUPERVISOR',
  ) =>
    useCase.handle({
      actorUserId: ActorId,
      campaignId: CampaignId,
      ...(role ? { role } : {}),
    });

  it('SUPERVISOR hạng thấp hơn minimumSupervisorRank (đọc DB) → 403 0x13_54', async () => {
    const { useCase, repository, users } = setup(
      { minimumSupervisorRank: UserRanks.GOLD },
      UserRanks.SILVER,
    );
    await expect(join(useCase, 'SUPERVISOR')).rejects.toThrow(
      CharityParticipantRankTooLowException,
    );
    expect(users.findOneBy).toHaveBeenCalledWith({ globalId: ActorId });
    expect(repository.register).not.toHaveBeenCalled();
  });

  it('PARTICIPANT không bị chặn hạng', async () => {
    const { useCase, repository, users } = setup(
      { minimumSupervisorRank: UserRanks.DIAMOND },
      UserRanks.VIEWER,
    );
    await join(useCase);
    expect(users.findOneBy).not.toHaveBeenCalled();
    expect(repository.register).toHaveBeenCalledWith({
      campaignId: CampaignId,
      userId: ActorId,
      role: 'PARTICIPANT',
    });
  });

  it('owner đăng ký SUPERVISOR → 409 0x13_61', async () => {
    const { useCase, repository } = setup({ createdBy: ActorId });
    await expect(join(useCase, 'SUPERVISOR')).rejects.toThrow(
      CharitySupervisorConflictException,
    );
    expect(repository.register).not.toHaveBeenCalled();
  });

  it('coordinator → 409 0x13_61', async () => {
    const { useCase, repository } = setup();
    repository.isCampaignManager.mockResolvedValue(true);
    await expect(join(useCase, 'SUPERVISOR')).rejects.toThrow(
      CharitySupervisorConflictException,
    );
    expect(repository.register).not.toHaveBeenCalled();
  });

  it('thêm coordinator là giám sát viên đang hiệu lực → 409 0x13_61', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId, campaignType: 'ORGANIZED_CAMPAIGN' }),
    );
    repository.findParticipation.mockResolvedValue({
      status: 'CONFIRMED',
      role: 'SUPERVISOR',
      checkedInAt: null,
    });
    await expect(
      new ManageCharityCoordinatorsUseCase(repository).handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        action: 'GRANT',
        userId: Coordinator,
      }),
    ).rejects.toThrow(CharitySupervisorConflictException);
    expect(repository.grantCoordinator).not.toHaveBeenCalled();
  });

  it('thêm coordinator từng là giám sát viên nhưng đã huỷ → được', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({ createdBy: ActorId, campaignType: 'ORGANIZED_CAMPAIGN' }),
    );
    repository.findParticipation.mockResolvedValue({
      status: 'CANCELLED',
      role: 'SUPERVISOR',
      checkedInAt: null,
    });
    await new ManageCharityCoordinatorsUseCase(repository).handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
      action: 'GRANT',
      userId: Coordinator,
    });
    expect(repository.grantCoordinator).toHaveBeenCalled();
  });

  describe('sau intakeEndsAt', () => {
    const closed = { intakeEndsAt: new Date(Date.now() - 60_000) };

    it('PARTICIPANT → 409 0x13_60', async () => {
      const { useCase } = setup(closed);
      await expect(join(useCase, 'PARTICIPANT')).rejects.toThrow(
        CharityIntakeClosedException,
      );
    });

    it('SUPERVISOR trước distributionStartsAt → được', async () => {
      const { useCase, repository } = setup(closed);
      await join(useCase, 'SUPERVISOR');
      expect(repository.register).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'SUPERVISOR' }),
      );
    });

    it('SUPERVISOR sau distributionStartsAt → 409 0x13_60', async () => {
      const { useCase, repository } = setup({
        ...closed,
        distribution: {
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + Hour),
        },
      });
      await expect(join(useCase, 'SUPERVISOR')).rejects.toThrow(
        CharityIntakeClosedException,
      );
      expect(repository.register).not.toHaveBeenCalled();
    });

    it('SUPERVISOR khi chưa có khung trao: đóng theo endTime (còn hạn → được)', async () => {
      const { useCase, repository } = setup({ ...closed, distribution: null });
      await join(useCase, 'SUPERVISOR');
      expect(repository.register).toHaveBeenCalled();
    });
  });

  it('đang là PARTICIPANT đăng ký SUPERVISOR → 409 đã đăng ký', async () => {
    const { useCase, repository } = setup();
    repository.findParticipation.mockResolvedValue({
      status: 'CONFIRMED',
      role: 'PARTICIPANT',
      checkedInAt: null,
    });
    repository.register.mockResolvedValue({ created: false } as never);
    await expect(join(useCase, 'SUPERVISOR')).rejects.toThrow(
      CharityAlreadyRegisteredException,
    );
  });

  it('đổi vai sau khi lượt cũ đã check-in rồi huỷ → 409 trạng thái lượt tham gia', async () => {
    const { useCase, repository } = setup();
    repository.findParticipation.mockResolvedValue({
      status: 'CANCELLED',
      role: 'PARTICIPANT',
      checkedInAt: new Date(),
    });
    await expect(join(useCase, 'SUPERVISOR')).rejects.toThrow(
      CharityParticipationInvalidStateException,
    );
    expect(repository.register).not.toHaveBeenCalled();
  });
});

describe('GetPublicCharityCampaignUseCase · organizer (CR 22/11/2026)', () => {
  it('organizer có userId, displayName = fullName, không có phone/email', async () => {
    const repository = makeRepository();
    repository.findPublicByIdOrSlug.mockResolvedValue(campaign());
    repository.listReviews.mockResolvedValue({ items: [], total: 0 } as never);
    repository.findOrganizerProfile.mockResolvedValue({
      globalId: ActorId,
      username: 'chu-du-an',
      fullName: 'Chủ Dự Án',
      avatarUrl: null,
      rank: UserRanks.GOLD,
      email: 'owner@private.test',
      phone: '0900000001',
    } as never);
    const result = await new GetPublicCharityCampaignUseCase(repository).handle(
      { idOrSlug: CampaignId },
    );
    expect(result.organizer).toEqual({
      userId: ActorId,
      username: 'chu-du-an',
      displayName: 'Chủ Dự Án',
      avatarUrl: null,
      rank: UserRanks.GOLD,
    });
    expect(JSON.stringify(result)).not.toMatch(/owner@private|0900000001/);
  });

  it('người tổ chức đã xoá tài khoản → organizer null', async () => {
    const repository = makeRepository();
    repository.findPublicByIdOrSlug.mockResolvedValue(campaign());
    repository.listReviews.mockResolvedValue({ items: [], total: 0 } as never);
    const result = await new GetPublicCharityCampaignUseCase(repository).handle(
      { idOrSlug: CampaignId },
    );
    expect(result.organizer).toBeNull();
  });
});

describe('Hệ số tăng điểm chiến dịch (CR 22/11/2026)', () => {
  const create = (
    overrides: Record<string, unknown>,
    options: { asAdmin?: boolean; publishNow?: boolean } = {},
  ) => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const promise = new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true, options.publishNow ?? false),
      makeAdmin(options.asAdmin ?? false),
      makeStorage(),
    ).handle({
      ...writeInput({ submit: false, ...overrides }),
      actorUserId: ActorId,
      asAdmin: options.asAdmin ?? false,
    } as never);
    const sent = () =>
      repository.create.mock.calls[0][0] as unknown as {
        requestedPointBonusPercent: number;
        pointBonusPercent: number;
        badgeName: string | null;
      };
    return { repository, promise, sent };
  };

  it('owner đề xuất 50 → requested 50, hiệu lực 0', async () => {
    const { promise, sent } = create({ requestedPointBonusPercent: 50 });
    await promise;
    expect(sent()).toMatchObject({
      requestedPointBonusPercent: 50,
      pointBonusPercent: 0,
    });
  });

  it('owner có quyền đăng không cần duyệt đề xuất 50 → hiệu lực vẫn 0', async () => {
    const { promise, sent } = create(
      { requestedPointBonusPercent: 50 },
      { publishNow: true },
    );
    await promise;
    expect(sent().pointBonusPercent).toBe(0);
  });

  it('Admin tạo 100 → hiệu lực 100', async () => {
    const { promise, sent } = create(
      { requestedPointBonusPercent: 100 },
      { asAdmin: true },
    );
    await promise;
    expect(sent()).toMatchObject({
      requestedPointBonusPercent: 100,
      pointBonusPercent: 100,
    });
  });

  it('pointBonusPercent 30 → 400 validate', async () => {
    const { promise, repository } = create({ requestedPointBonusPercent: 30 });
    await expect(promise).rejects.toThrow(ValidationFailedException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('tạo không gửi badgeName → được, ghi null', async () => {
    const { promise, sent } = create({ badgeName: undefined });
    await promise;
    expect(sent().badgeName).toBeNull();
  });

  const decide = (requested: number, pointBonusPercent?: number) => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      campaign({
        approvalStatus: 'PENDING_APPROVAL',
        requestedPointBonusPercent: requested,
        pointBonusPercent: 0,
      } as never),
    );
    repository.decideApproval.mockResolvedValue(campaign());
    const promise = new DecideCharityApprovalUseCase(
      repository,
      makeAdmin(true),
    ).handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
      approve: true,
      ...(pointBonusPercent === undefined ? {} : { pointBonusPercent }),
    } as never);
    return { repository, promise };
  };

  it('Admin duyệt không gửi pointBonusPercent → hiệu lực = requested', async () => {
    const { repository, promise } = decide(50);
    await promise;
    expect(repository.decideApproval).toHaveBeenCalledWith(
      expect.objectContaining({ pointBonusPercent: 50 }),
    );
  });

  it('Admin duyệt hạ 20 → 20', async () => {
    const { repository, promise } = decide(50, 20);
    await promise;
    expect(repository.decideApproval).toHaveBeenCalledWith(
      expect.objectContaining({ pointBonusPercent: 20 }),
    );
  });

  it('Admin duyệt 100 khi requested 50 → 400', async () => {
    const { repository, promise } = decide(50, 100);
    await expect(promise).rejects.toThrow(ValidationFailedException);
    expect(repository.decideApproval).not.toHaveBeenCalled();
  });

  it('Admin PATCH pointBonusPercent 100 → ghi 100; 30 → 400', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(campaign());
    const updateContent = jest.fn(async (params: Record<string, unknown>) =>
      campaign(params as never),
    );
    (repository as unknown as { updateContent: jest.Mock }).updateContent =
      updateContent;
    const useCase = new UpdateAdminCharityCampaignUseCase(repository, {
      ...makeAdmin(true),
      appendAudit: jest.fn(),
    } as unknown as ReturnType<typeof makeAdmin>);
    await useCase.handle({
      campaignId: CampaignId,
      actorUserId: ActorId,
      reason: 'Chốt hệ số',
      pointBonusPercent: 100,
    } as never);
    expect(updateContent).toHaveBeenCalledWith(
      expect.objectContaining({ pointBonusPercent: 100 }),
    );
    await expect(
      useCase.handle({
        campaignId: CampaignId,
        actorUserId: ActorId,
        reason: 'Chốt hệ số',
        pointBonusPercent: 30,
      } as never),
    ).rejects.toThrow(ValidationFailedException);
  });
});
