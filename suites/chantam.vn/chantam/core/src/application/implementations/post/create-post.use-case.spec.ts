import {
  CategoryNotFoundException,
  OnboardingIncompleteException,
  PostQuotaExceededException,
  PostSosNotAllowedException,
  ProfileIncompleteException,
} from '@/domain/exceptions';
import {
  ICategoryRepository,
  IEntitlementRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  ContactVisibilities,
  GenericMvpPostTypes,
  GiftPostConditions,
  GiftPostStatuses,
  PostSelectionModes,
  PostTypes,
  UserRanks,
  UserStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICategoryEntity,
  IUserEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { ProfileGate } from '../profile/profile-gate';
import { CreatePostUseCase } from './create-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';
const CategoryId = '30000000-0000-4000-8000-000000000001';

function makeUser(overrides: Partial<IUserEntity> = {}): IUserEntity {
  return {
    id: 1,
    globalId: UserId,
    username: 'member',
    passwordHash: 'hash',
    email: 'member@example.com',
    phone: '0900000000',
    fullName: 'Member',
    avatarUrl: 'https://media.example/avatar.webp',
    defaultLocation: null,
    rank: UserRanks.MEMBER,
    status: UserStatuses.ACTIVE,
    phoneVerifiedAt: null,
    emailVerifiedAt: null,
    suspendedUntil: null,
    lastActiveAt: new Date(),
    leaderboardAnonymous: false,
    slogan: null,
    todayThought: null,
    todayThoughtUpdatedAt: null,
    introVideoUrl: null,
    introVideoThumbnailUrl: null,
    emailVisibility: ContactVisibilities.PRIVATE,
    phoneVisibility: ContactVisibilities.PRIVATE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeCategory(
  overrides: Partial<ICategoryEntity> = {},
): ICategoryEntity {
  return {
    id: 1,
    globalId: CategoryId,
    name: 'Đồ dùng gia đình',
    slug: 'do-dung-gia-dinh',
    icon: null,
    sortOrder: 0,
    postTypes: [...GenericMvpPostTypes],
    isActive: true,
    parentId: null,
    mergedIntoId: null,
    mergeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function command() {
  return {
    userId: UserId,
    post: {
      postType: PostTypes.OFFER,
      title: 'Xe đạp cũ còn dùng tốt',
      description: 'Xe còn dùng tốt, cần thay yên.',
      categoryId: CategoryId,
      condition: GiftPostConditions.USED,
      estimatedValue: 1_500_000,
      location: { lat: 10.7724, lng: 106.698 },
      areaLabel: 'Quận 1, TP.HCM',
    },
  };
}

describe('CreatePostUseCase', () => {
  function makeRepositories(
    user: IUserEntity | null = makeUser(),
    category: ICategoryEntity | null = makeCategory(),
    created = true,
  ) {
    const posts = {
      createPostWithinQuota: jest.fn().mockResolvedValue(created),
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue({ globalId: 'created-post' }),
    } as unknown as jest.Mocked<IPostRepository>;
    const categories = {
      findOneBy: jest.fn().mockResolvedValue(category),
      // Chuoi to tien mac dinh: chinh no, dang bat. Ca "to tien da tat" duoc thu
      // rieng trong category-guards.spec.ts.
      findAncestorChain: jest.fn(async () => [
        { categoryId: category?.globalId ?? 'c', isActive: true },
      ]),
    } as unknown as jest.Mocked<ICategoryRepository>;
    const users = {
      findOneBy: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<IUserRepository>;
    const entitlements = {
      getCapability: jest.fn().mockResolvedValue({
        code: 'POST_OPEN',
        allowed: true,
        limit: user?.rank === UserRanks.MEMBER ? 3 : 10,
        used: 0,
        remaining: user?.rank === UserRanks.MEMBER ? 3 : 10,
        reasonCode: null,
      }),
    } as unknown as jest.Mocked<IEntitlementRepository>;

    return { posts, categories, users, entitlements };
  }

  it('lấy author từ userId và tạo bài OFFER LÊN THẲNG, kèm hạn 37 ngày', async () => {
    const { posts, categories, users, entitlements } = makeRepositories();
    const useCase = new CreatePostUseCase(
      posts,
      categories,
      entitlements,
      new ProfileGate(users),
    );

    await useCase.handle(command());

    expect(posts.createPostWithinQuota).toHaveBeenCalledWith(
      UserId,
      3,
      expect.objectContaining({
        authorId: UserId,
        categoryId: CategoryId,
        postType: PostTypes.OFFER,
        status: GiftPostStatuses.PUBLISHED,
        expiresAt: expect.any(Date),
        totalQuantity: 1,
        remainingQuantity: 1,
        details: {
          condition: GiftPostConditions.USED,
          estimatedValue: 1_500_000,
        },
      }),
    );
  });

  it('bài thường KHÔNG tốn một truy vấn entitlement cho POST_SOS', async () => {
    const { posts, categories, users, entitlements } = makeRepositories();

    await new CreatePostUseCase(
      posts,
      categories,
      entitlements,
      new ProfileGate(users),
    ).handle(command());

    expect(entitlements.getCapability).not.toHaveBeenCalledWith(
      UserId,
      'POST_SOS',
    );
    expect(posts.createPostWithinQuota).toHaveBeenCalledWith(
      UserId,
      3,
      expect.objectContaining({ isSos: false }),
    );
  });

  it('bật SOS khi Rank được phép thì ghi cờ vào bài', async () => {
    const { posts, categories, users, entitlements } = makeRepositories();

    await new CreatePostUseCase(
      posts,
      categories,
      entitlements,
      new ProfileGate(users),
    ).handle({
      ...command(),
      post: { ...command().post, isSos: true },
    });

    expect(entitlements.getCapability).toHaveBeenCalledWith(UserId, 'POST_SOS');
    expect(posts.createPostWithinQuota).toHaveBeenCalledWith(
      UserId,
      3,
      expect.objectContaining({ isSos: true }),
    );
  });

  it('bật SOS khi Rank chưa được phép thì bị chặn', async () => {
    // Capability tồn tại nhưng `allowed: false` — đúng hình dạng mà Admin tắt
    // SOS cho một Rank tạo ra.
    const { posts, categories, users } = makeRepositories();
    const entitlements = {
      getCapability: jest.fn(async (_userId: string, code: string) =>
        code === 'POST_SOS'
          ? { code, allowed: false, limit: 0, used: 0, remaining: 0 }
          : { code, allowed: true, limit: 3, used: 0, remaining: 3 },
      ),
    } as unknown as jest.Mocked<IEntitlementRepository>;

    await expect(
      new CreatePostUseCase(
        posts,
        categories,
        entitlements,
        new ProfileGate(users),
      ).handle({
        ...command(),
        post: { ...command().post, isSos: true },
      }),
    ).rejects.toBeInstanceOf(PostSosNotAllowedException);

    expect(posts.createPostWithinQuota).not.toHaveBeenCalled();
  });

  it('chặn user có hồ sơ chưa hoàn tất trước khi kiểm tra category hoặc quota', async () => {
    const { posts, categories, users, entitlements } = makeRepositories(
      makeUser({ avatarUrl: null }),
    );

    await expect(
      new CreatePostUseCase(
        posts,
        categories,
        entitlements,
        new ProfileGate(users),
      ).handle(command()),
    ).rejects.toBeInstanceOf(ProfileIncompleteException);
    expect(categories.findOneBy).not.toHaveBeenCalled();
    expect(posts.createPostWithinQuota).not.toHaveBeenCalled();
  });

  it('từ chối category inactive hoặc deleted', async () => {
    const { posts, categories, users, entitlements } = makeRepositories(
      makeUser(),
      makeCategory({ isActive: false }),
    );

    await expect(
      new CreatePostUseCase(
        posts,
        categories,
        entitlements,
        new ProfileGate(users),
      ).handle(command()),
    ).rejects.toBeInstanceOf(CategoryNotFoundException);
    expect(posts.createPostWithinQuota).not.toHaveBeenCalled();
  });

  it('chặn Viewer có hồ sơ đầy đủ bằng onboarding exception trước category hoặc quota', async () => {
    const { posts, categories, users, entitlements } = makeRepositories(
      makeUser({ rank: UserRanks.VIEWER }),
    );

    await expect(
      new CreatePostUseCase(
        posts,
        categories,
        entitlements,
        new ProfileGate(users),
      ).handle(command()),
    ).rejects.toBeInstanceOf(OnboardingIncompleteException);
    expect(categories.findOneBy).not.toHaveBeenCalled();
    expect(posts.createPostWithinQuota).not.toHaveBeenCalled();
  });

  it('trả quota exception khi transaction lock từ chối request vượt trần', async () => {
    const { posts, categories, users, entitlements } = makeRepositories(
      makeUser({ rank: UserRanks.MEMBER }),
      makeCategory(),
      false,
    );

    await expect(
      new CreatePostUseCase(
        posts,
        categories,
        entitlements,
        new ProfileGate(users),
      ).handle(command()),
    ).rejects.toBeInstanceOf(PostQuotaExceededException);
    expect(posts.createPostWithinQuota).toHaveBeenCalledWith(
      UserId,
      3,
      expect.any(Object),
    );
  });
});

describe('CreatePostUseCase — tin rao vặt CLASSIFIED', () => {
  function classified(overrides: Record<string, unknown> = {}) {
    return {
      userId: UserId,
      post: {
        postType: PostTypes.CLASSIFIED,
        title: 'iPhone 12 64GB',
        description: 'Máy còn bảo hành tới tháng 12.',
        categoryId: CategoryId,
        price: 5_200_000,
        condition: GiftPostConditions.USED,
        location: { lat: 10.7724, lng: 106.698 },
        areaLabel: 'Quận 1, TP.HCM',
        ...overrides,
      },
    };
  }

  function makeDeps() {
    const posts = {
      // Khai báo tham số để `mock.calls` có kiểu; thiếu nó thì TypeScript coi
      // đây là tuple rỗng và không đọc được đối số nào.
      createPostWithinQuota: jest.fn(
        async (
          _authorId: string,
          _quota: number,
          _post: { details: Record<string, unknown> },
        ) => true,
      ),
      findOneByOrFail: jest.fn(async () => ({ globalId: 'post' })),
    };
    const categories = {
      findOneBy: jest.fn(async () => makeCategory()),
      findAncestorChain: jest.fn(async () => [
        { categoryId: CategoryId, isActive: true },
      ]),
    };
    const users = {
      findOneBy: jest.fn(async () => makeUser({ rank: UserRanks.MEMBER })),
    };
    const entitlements = {
      getCapability: jest.fn(async () => ({ allowed: true, limit: 3 })),
    };

    return { posts, categories, users, entitlements };
  }

  function run(deps: ReturnType<typeof makeDeps>, cmd: unknown) {
    return new CreatePostUseCase(
      deps.posts as never,
      deps.categories as never,
      deps.entitlements as never,
      new ProfileGate(deps.users as never),
    ).handle(cmd as never);
  }

  it('lưu giá, tình trạng và cờ thương lượng vào details', async () => {
    const deps = makeDeps();

    await run(deps, classified({ negotiable: true }));

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    expect(saved.details).toEqual({
      price: 5_200_000,
      condition: GiftPostConditions.USED,
      negotiable: true,
      // Khóa CÓ MẶT với giá trị `null` khi người bán không khai giá thị trường.
      // `details` là `jsonb` không có lược đồ, nên một khóa VẮNG MẶT không nói được
      // là "chưa khai" hay "phiên bản cũ chưa có trường này".
      marketPrice: null,
    });
  });

  it('lưu giá thị trường khi người bán có khai (CHỐT-05)', async () => {
    const deps = makeDeps();

    await run(deps, classified({ marketPrice: 8_000_000 }));

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    expect(saved.details.marketPrice).toBe(8_000_000);
  });

  it('giá tham khảo THẤP hơn giá bán vẫn được lưu', async () => {
    // CHỐT-05: hệ thống không ép mức giảm tối thiểu nào. Chặn ca này là âm thầm ép
    // mức giảm tối thiểu bằng 0.
    const deps = makeDeps();

    await run(deps, classified({ marketPrice: 1_000_000 }));

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    expect(saved.details.marketPrice).toBe(1_000_000);
    expect(saved.details.price).toBe(5_200_000);
  });

  it('mặc định không thương lượng khi không nói gì', async () => {
    // Im lặng mà hiểu thành "có thương lượng" là hứa hộ người bán một điều họ
    // không hề nói.
    const deps = makeDeps();

    await run(deps, classified());

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    expect(saved.details.negotiable).toBe(false);
  });

  it('từ chối tin rao vặt thiếu giá', async () => {
    // Thiếu giá thì không sắp xếp được, không lọc khoảng giá được, và người mua
    // phải hỏi mới biết.
    const deps = makeDeps();

    await expect(
      run(deps, classified({ price: undefined })),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.posts.createPostWithinQuota).not.toHaveBeenCalled();
  });

  it('từ chối tin rao vặt thiếu tình trạng món đồ', async () => {
    const deps = makeDeps();

    await expect(
      run(deps, classified({ condition: undefined })),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('không cho gắn giá vào bài đem tặng', async () => {
    // Lọt sang bài tặng là biến món quà thành món hàng ngay trên giao diện.
    const deps = makeDeps();

    await expect(
      run(deps, {
        userId: UserId,
        post: {
          ...classified().post,
          postType: PostTypes.OFFER,
          price: 5_000_000,
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.posts.createPostWithinQuota).not.toHaveBeenCalled();
  });

  it('không cho gắn estimatedValue vào tin rao vặt', async () => {
    const deps = makeDeps();

    await expect(
      run(deps, classified({ estimatedValue: 1_000_000 })),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('bài WANTED vẫn không được mang condition', async () => {
    const deps = makeDeps();

    await expect(
      run(deps, {
        userId: UserId,
        post: {
          ...classified().post,
          postType: PostTypes.WANTED,
          price: undefined,
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});

describe('CreatePostUseCase · đồng hồ 7 + 30 ngày (CHỐT-10)', () => {
  interface ISavedPost {
    selectionDeadline: Date | null;
    expiresAt: Date;
  }

  function makeDeps() {
    const posts = {
      // Khai tham số để `mock.calls` có kiểu — cùng lý do như khối CLASSIFIED.
      createPostWithinQuota: jest.fn(
        async (_authorId: string, _quota: number, _post: ISavedPost) => true,
      ),
      findOneByOrFail: jest.fn(async () => ({ globalId: 'post' })),
    };
    const categories = {
      findOneBy: jest.fn(async () => makeCategory()),
      findAncestorChain: jest.fn(async () => [
        { categoryId: CategoryId, isActive: true },
      ]),
    };
    const users = {
      findOneBy: jest.fn(async () => makeUser({ rank: UserRanks.MEMBER })),
    };
    const entitlements = {
      getCapability: jest.fn(async () => ({ allowed: true, limit: 3 })),
    };
    return { posts, categories, users, entitlements };
  }

  function run(deps: ReturnType<typeof makeDeps>, cmd: unknown) {
    return new CreatePostUseCase(
      deps.posts as never,
      deps.categories as never,
      deps.entitlements as never,
      new ProfileGate(deps.users as never),
    ).handle(cmd as never);
  }

  function postOfType(
    postType: PostTypes,
    extra: Record<string, unknown> = {},
  ) {
    // `condition` và `estimatedValue` của `command()` chỉ hợp lệ cho `OFFER` /
    // `CLASSIFIED`; use case từ chối chúng ở loại khác. Nên base ở đây là phần
    // CHUNG, và mỗi ca tự thêm trường của loại mình — kéo nguyên `command().post`
    // sang sẽ đỏ vì một lý do chẳng liên quan tới đồng hồ.
    const { condition, estimatedValue, ...base } = command().post as Record<
      string,
      unknown
    >;
    void condition;
    void estimatedValue;
    return { userId: UserId, post: { ...base, postType, ...extra } };
  }

  function days(from: Date): number {
    return Math.round((from.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }

  it('OFFER nhận hạn xét NGAY lúc đăng, không chờ phản hồi đầu tiên', async () => {
    // Tới 06/10 cột này vào database là `null` và chỉ được đặt khi có người xin
    // đầu tiên. Hệ quả đo được: bài không ai xin thì không bao giờ tới hạn, nên
    // auto-select không bao giờ xét tới nó, và nó chỉ chết ở mốc ba tháng.
    const deps = makeDeps();

    await run(
      deps,
      postOfType(PostTypes.OFFER, {
        condition: GiftPostConditions.USED,
      }),
    );

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    expect(saved.selectionDeadline).toBeInstanceOf(Date);
    expect(days(saved.selectionDeadline as Date)).toBe(7);
  });

  it('OFFER hết hạn sau 37 ngày, và ĐÚNG BẰNG hạn xét + 30 ngày', async () => {
    const deps = makeDeps();

    await run(
      deps,
      postOfType(PostTypes.OFFER, { condition: GiftPostConditions.USED }),
    );

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    // Hai mốc phải CÙNG GỐC. Gọi `new Date()` hai lần cho hai mốc thì chúng lệch
    // vài milli giây và phép trừ này ra số không chẵn — đó là lý do use case dùng
    // một biến `publishedAt` duy nhất. Và giai đoạn mở rộng 30 ngày không có cột
    // trạng thái nào: nó CHÍNH LÀ khoảng giữa hai mốc này.
    expect(
      saved.expiresAt.getTime() - (saved.selectionDeadline as Date).getTime(),
    ).toBe(30 * 24 * 60 * 60 * 1000);
    expect(days(saved.expiresAt)).toBe(37);
  });

  it('WANTED cũng nhận hạn xét ngay lúc đăng, và cũng 37 ngày', async () => {
    // Bản trước khẳng định `selectionDeadline` là `null` và hạn sống > 80 ngày,
    // đúng với trạng thái lúc đó: vai chưa đảo nên bật `WANTED` là để job dựng
    // giao dịch với người cần đồ làm người tặng. Vai nay suy từ
    // `giftTransactionRoles`, nên `WANTED` đi cùng vòng đời với `OFFER`.
    const deps = makeDeps();

    await run(deps, postOfType(PostTypes.WANTED));

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    expect(saved.selectionDeadline).toBeInstanceOf(Date);
    expect(days(saved.selectionDeadline as Date)).toBe(7);
    expect(days(saved.expiresAt)).toBe(37);
  });

  it('WANTED NHẬN được selectionMode — không còn là cái núm không làm gì', async () => {
    // Bản trước đòi use case TỪ CHỐI cờ này cho `WANTED`, vì nhận một cờ rồi
    // không dùng là tạo một cái núm không làm gì. Nay nó được dùng thật: nhánh
    // `INSTANT` của `create-gift-request` chạy cho cả hai loại bài.
    const deps = makeDeps();

    await run(
      deps,
      postOfType(PostTypes.WANTED, {
        selectionMode: PostSelectionModes.INSTANT,
      }),
    );

    expect(deps.posts.createPostWithinQuota.mock.calls[0][2]).toMatchObject({
      selectionMode: PostSelectionModes.INSTANT,
    });
  });

  it('loại bài KHÁC gửi kèm selectionMode thì vẫn bị TỪ CHỐI', async () => {
    // Cổng vẫn phải còn: `CLASSIFIED` không có cơ chế ghép đối tác nào, nên nhận
    // cờ đó là tạo một cái núm không làm gì.
    const deps = makeDeps();

    await expect(
      run(
        deps,
        postOfType(PostTypes.CLASSIFIED, {
          price: 5_200_000,
          condition: GiftPostConditions.USED,
          selectionMode: PostSelectionModes.INSTANT,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('CLASSIFIED không có hạn xét, giữ ba tháng', async () => {
    const deps = makeDeps();

    await run(
      deps,
      postOfType(PostTypes.CLASSIFIED, {
        price: 5_200_000,
        condition: GiftPostConditions.USED,
      }),
    );

    const saved = deps.posts.createPostWithinQuota.mock.calls[0][2];
    expect(saved.selectionDeadline).toBeNull();
    expect(days(saved.expiresAt)).toBeGreaterThan(80);
  });
});
