import {
  ICategoryRepository,
  IEntitlementRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GenericMvpPostTypes,
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
    suspendedUntil: null,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeCategory(): ICategoryEntity {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

function makeCommand(postType: PostTypes) {
  const common = {
    userId: UserId,
    post: {
      postType,
      title: 'Bài đăng canonical dùng chung',
      description: 'Mô tả đủ dài cho Generic MVP của mọi loại bài đăng.',
      categoryId: CategoryId,
      location: { lat: 10.7724, lng: 106.698 },
      areaLabel: 'Quận 1, TP.HCM',
    },
  };

  if (postType === PostTypes.OFFER)
    return {
      ...common,
      post: {
        ...common.post,
        postType: PostTypes.OFFER,
        condition: GiftPostConditions.USED,
        estimatedValue: 1_500_000,
        totalQuantity: 2,
      },
    };

  // Tin rao vặt bắt buộc có giá và tình trạng món đồ.
  if (postType === PostTypes.CLASSIFIED)
    return {
      ...common,
      post: {
        ...common.post,
        postType: PostTypes.CLASSIFIED,
        price: 5_200_000,
        condition: GiftPostConditions.USED,
      },
    } as never;

  return common as {
    userId: string;
    post: {
      postType:
        | PostTypes.WANTED
        | PostTypes.CHARITY
        | PostTypes.CLASSIFIED
        | PostTypes.MERIT;
      title: string;
      description: string;
      categoryId: string;
      location: { lat: number; lng: number };
      areaLabel: string;
    };
  };
}

/** Mỗi loại bài chỉ mang đúng phần nội dung riêng của nó trong `details`. */
function expectedDetails(postType: PostTypes): Record<string, unknown> {
  if (postType === PostTypes.OFFER)
    return {
      condition: GiftPostConditions.USED,
      estimatedValue: 1_500_000,
    };

  if (postType === PostTypes.CLASSIFIED)
    return {
      price: 5_200_000,
      condition: GiftPostConditions.USED,
      negotiable: false,
    };

  return {};
}

describe('CreatePostUseCase Generic MVP', () => {
  it.each([
    PostTypes.OFFER,
    PostTypes.WANTED,
    PostTypes.CHARITY,
    PostTypes.CLASSIFIED,
    PostTypes.MERIT,
  ])(
    'creates %s under the common member moderation policy',
    async (postType) => {
      const posts = {
        createPostWithinQuota: jest.fn(async () => true),
        findOneByOrFail: jest.fn(async () => ({ globalId: 'created-post' })),
      } as unknown as jest.Mocked<IPostRepository>;
      const categories = {
        findOneBy: jest.fn(async () => makeCategory()),
      } as unknown as jest.Mocked<ICategoryRepository>;
      const users = {
        findOneBy: jest.fn(async () => makeUser()),
      } as unknown as jest.Mocked<IUserRepository>;
      const entitlements = {
        getCapability: jest.fn(async () => ({
          code: 'POST_OFFER',
          allowed: true,
          limit: 3,
          used: 0,
          remaining: 3,
          reasonCode: null,
        })),
      } as unknown as jest.Mocked<IEntitlementRepository>;

      await new CreatePostUseCase(
        posts,
        categories,
        entitlements,
        new ProfileGate(users),
      ).handle(makeCommand(postType));

      expect(posts.createPostWithinQuota).toHaveBeenCalledWith(
        UserId,
        3,
        expect.objectContaining({
          authorId: UserId,
          postType,
          status: GiftPostStatuses.PENDING_REVIEW,
          details: expectedDetails(postType),
          totalQuantity: postType === PostTypes.OFFER ? 2 : 1,
          remainingQuantity: postType === PostTypes.OFFER ? 2 : 1,
        }),
      );
    },
  );

  it('rejects OFFER details for a non-OFFER type before persistence', async () => {
    const posts = {
      createPostWithinQuota: jest.fn(),
      findOneByOrFail: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;
    const categories = {
      findOneBy: jest.fn(async () => makeCategory()),
    } as unknown as jest.Mocked<ICategoryRepository>;
    const users = {
      findOneBy: jest.fn(async () => makeUser()),
    } as unknown as jest.Mocked<IUserRepository>;
    const entitlements = {
      getCapability: jest.fn(async () => ({
        code: 'POST_OFFER',
        allowed: true,
        limit: 3,
        used: 0,
        remaining: 3,
        reasonCode: null,
      })),
    } as unknown as jest.Mocked<IEntitlementRepository>;
    const charity = makeCommand(PostTypes.CHARITY);

    await expect(
      new CreatePostUseCase(
        posts,
        categories,
        entitlements,
        new ProfileGate(users),
      ).handle({
        ...charity,
        post: {
          ...charity.post,
          condition: GiftPostConditions.USED,
          estimatedValue: 1_500_000,
        },
      }),
    ).rejects.toThrow();
    expect(posts.createPostWithinQuota).not.toHaveBeenCalled();
  });
});
