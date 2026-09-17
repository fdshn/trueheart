import {
  CategoryNotFoundException,
  PostQuotaExceededException,
  ProfileIncompleteException,
} from '@/domain/exceptions';
import {
  ICategoryRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiftPostConditions,
  GiftPostStatuses,
  PostTypes,
  UserRanks,
  UserStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICategoryEntity,
  IUserEntity,
} from '@chantam.vn/chantam.core-lib/entities';
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
    suspendedUntil: null,
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
    isActive: true,
    parentId: null,
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
      createOfferWithinQuota: jest.fn().mockResolvedValue(created),
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue({ globalId: 'created-post' }),
    } as unknown as jest.Mocked<IPostRepository>;
    const categories = {
      findOneBy: jest.fn().mockResolvedValue(category),
    } as unknown as jest.Mocked<ICategoryRepository>;
    const users = {
      findOneBy: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<IUserRepository>;

    return { posts, categories, users };
  }

  it('lấy author từ userId và khởi tạo canonical OFFER pending review', async () => {
    const { posts, categories, users } = makeRepositories();
    const useCase = new CreatePostUseCase(posts, categories, users);

    await useCase.handle(command());

    expect(posts.createOfferWithinQuota).toHaveBeenCalledWith(
      UserId,
      3,
      expect.objectContaining({
        authorId: UserId,
        categoryId: CategoryId,
        postType: PostTypes.OFFER,
        status: GiftPostStatuses.PENDING_REVIEW,
        totalQuantity: 1,
        remainingQuantity: 1,
        details: {
          condition: GiftPostConditions.USED,
          estimatedValue: 1_500_000,
        },
      }),
    );
  });

  it('chặn user có hồ sơ chưa hoàn tất trước khi kiểm tra category hoặc quota', async () => {
    const { posts, categories, users } = makeRepositories(
      makeUser({ avatarUrl: null }),
    );

    await expect(
      new CreatePostUseCase(posts, categories, users).handle(command()),
    ).rejects.toBeInstanceOf(ProfileIncompleteException);
    expect(categories.findOneBy).not.toHaveBeenCalled();
    expect(posts.createOfferWithinQuota).not.toHaveBeenCalled();
  });

  it('từ chối category inactive hoặc deleted', async () => {
    const { posts, categories, users } = makeRepositories(
      makeUser(),
      makeCategory({ isActive: false }),
    );

    await expect(
      new CreatePostUseCase(posts, categories, users).handle(command()),
    ).rejects.toBeInstanceOf(CategoryNotFoundException);
    expect(posts.createOfferWithinQuota).not.toHaveBeenCalled();
  });

  it('trả quota exception khi transaction lock từ chối request vượt trần', async () => {
    const { posts, categories, users } = makeRepositories(
      makeUser({ rank: UserRanks.VIEWER }),
      makeCategory(),
      false,
    );

    await expect(
      new CreatePostUseCase(posts, categories, users).handle(command()),
    ).rejects.toBeInstanceOf(PostQuotaExceededException);
    expect(posts.createOfferWithinQuota).toHaveBeenCalledWith(
      UserId,
      0,
      expect.any(Object),
    );
  });
});
