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
  GiftPostStatuses,
  PostTypes,
  UserRanks,
  UserStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICategoryEntity,
  IUserEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { CreateWantedPostUseCase } from './create-wanted-post.use-case';

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
      title: 'Cần xe đạp đi học',
      description: 'Học sinh cần xe đạp còn sử dụng tốt để đi học mỗi ngày.',
      categoryId: CategoryId,
      location: { lat: 10.7724, lng: 106.698 },
      areaLabel: 'Quận 1, TP.HCM',
    },
  };
}

describe('CreateWantedPostUseCase', () => {
  function makeRepositories(
    user: IUserEntity | null = makeUser(),
    category: ICategoryEntity | null = makeCategory(),
    created = true,
  ) {
    const posts = {
      createPostWithinQuota: jest.fn().mockResolvedValue(created),
      findOneByOrFail: jest.fn().mockResolvedValue({ globalId: 'wanted-post' }),
    } as unknown as jest.Mocked<IPostRepository>;
    const categories = {
      findOneBy: jest.fn().mockResolvedValue(category),
    } as unknown as jest.Mocked<ICategoryRepository>;
    const users = {
      findOneBy: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<IUserRepository>;

    return { posts, categories, users };
  }

  it('tạo WANTED pending review với details rỗng', async () => {
    const { posts, categories, users } = makeRepositories();

    await new CreateWantedPostUseCase(posts, categories, users).handle(
      command(),
    );

    expect(posts.createPostWithinQuota).toHaveBeenCalledWith(
      UserId,
      3,
      expect.objectContaining({
        postType: PostTypes.WANTED,
        status: GiftPostStatuses.PENDING_REVIEW,
        details: {},
        authorId: UserId,
        categoryId: CategoryId,
      }),
    );
  });

  it('áp profile/category/quota gate như OFFER', async () => {
    const { posts, categories, users } = makeRepositories(
      makeUser({ avatarUrl: null }),
    );

    await expect(
      new CreateWantedPostUseCase(posts, categories, users).handle(command()),
    ).rejects.toBeInstanceOf(ProfileIncompleteException);
    expect(categories.findOneBy).not.toHaveBeenCalled();

    const invalid = makeRepositories(
      makeUser(),
      makeCategory({ isActive: false }),
    );
    await expect(
      new CreateWantedPostUseCase(
        invalid.posts,
        invalid.categories,
        invalid.users,
      ).handle(command()),
    ).rejects.toBeInstanceOf(CategoryNotFoundException);

    const quota = makeRepositories(makeUser(), makeCategory(), false);
    await expect(
      new CreateWantedPostUseCase(
        quota.posts,
        quota.categories,
        quota.users,
      ).handle(command()),
    ).rejects.toBeInstanceOf(PostQuotaExceededException);
  });
});
