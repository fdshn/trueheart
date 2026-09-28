import {
  CategoryNotFoundException,
  PostHasLiveTransactionException,
  PostInvalidStateException,
  PostSosNotAllowedException,
} from '@/domain/exceptions';
import {
  ICategoryRepository,
  IEntitlementRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  DeliveryMethods,
  GiftPostConditions,
  PostSelectionModes,
  PostTypes,
  ShipPayers,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { UpdatePostUseCase } from './update-post.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const AuthorId = '22222222-2222-2222-2222-222222222222';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: AuthorId,
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
    status: 'PUBLISHED' as never,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: { condition: 'USED', estimatedValue: 1_500_000 },
    expiresAt: null,
    renewedCount: 0,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function setup(overrides: Partial<IPostEntity> = {}) {
  const post = makePost(overrides);
  const posts = {
    findOneBy: jest.fn(async () => post),
    updateOwnedContent: jest.fn(
      async (params: { changes: Partial<IPostEntity> }) => ({
        ...post,
        ...params.changes,
      }),
    ),
  };
  const categories = {
    findOneBy: jest.fn(async () => ({ isActive: true, deletedAt: null })),
  };
  const entitlements = {
    getCapability: jest.fn(async () => ({ allowed: true })),
  };
  const useCase = new UpdatePostUseCase(
    posts as unknown as IPostRepository,
    categories as unknown as ICategoryRepository,
    entitlements as unknown as IEntitlementRepository,
  );
  return { post, posts, categories, entitlements, useCase };
}

describe('UpdatePostUseCase', () => {
  it('updates full content without changing type/status/expiry or pending requests', async () => {
    const { useCase, posts, post } = setup();
    const result = await useCase.handle({
      postId: PostId,
      userId: AuthorId,
      post: {
        title: 'Xe mới',
        categoryId: '30000000-0000-4000-8000-000000000002',
        totalQuantity: 5,
        isSos: true,
        deliveryMethod: DeliveryMethods.GIVER_SHIPS,
        shipPayer: ShipPayers.GIVER,
        condition: GiftPostConditions.NEW,
        estimatedValue: 20,
      },
    });
    expect(posts.updateOwnedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: AuthorId,
        expectedUpdatedAt: post.updatedAt,
        changes: expect.objectContaining({
          totalQuantity: 5,
          remainingQuantity: 5,
          isSos: true,
        }),
      }),
    );
    const changes = posts.updateOwnedContent.mock.calls[0][0].changes;
    expect(changes).not.toHaveProperty('status');
    expect(changes).not.toHaveProperty('postType');
    expect(changes).not.toHaveProperty('expiresAt');
    expect(changes).not.toHaveProperty('authorId');
    expect(result.post.title).toBe('Xe mới');
  });

  it.each(['REJECTED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'ARCHIVED'])(
    'blocks terminal/removed state %s',
    async (status) => {
      const { useCase, posts } = setup({ status: status as never });
      await expect(
        useCase.handle({
          postId: PostId,
          userId: AuthorId,
          post: { title: 'Xe mới' },
        }),
      ).rejects.toBeInstanceOf(PostInvalidStateException);
      expect(posts.updateOwnedContent).not.toHaveBeenCalled();
    },
  );
  it.each(['RESERVED', 'DELIVERING'])(
    'blocks live state %s',
    async (status) => {
      const { useCase } = setup({ status: status as never });
      await expect(
        useCase.handle({
          postId: PostId,
          userId: AuthorId,
          post: { title: 'Xe mới' },
        }),
      ).rejects.toBeInstanceOf(PostHasLiveTransactionException);
    },
  );
  it('checks ownership before writing', async () => {
    const { useCase, posts } = setup();
    await expect(
      useCase.handle({
        postId: PostId,
        userId: 'other',
        post: { title: 'Xe mới' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(posts.updateOwnedContent).not.toHaveBeenCalled();
  });
  it('preserves allocated stock while changing quantity', async () => {
    const { useCase, posts } = setup({
      totalQuantity: 5,
      remainingQuantity: 3,
    });
    await useCase.handle({
      postId: PostId,
      userId: AuthorId,
      post: { totalQuantity: 4 },
    });
    expect(posts.updateOwnedContent.mock.calls[0][0].changes).toMatchObject({
      totalQuantity: 4,
      remainingQuantity: 2,
    });
    await expect(
      useCase.handle({
        postId: PostId,
        userId: AuthorId,
        post: { totalQuantity: 2 },
      }),
    ).rejects.toThrow();
  });
  it('validates changed category and SOS permission', async () => {
    const { useCase, categories, entitlements } = setup();
    categories.findOneBy.mockResolvedValueOnce({
      isActive: false,
      deletedAt: null,
    });
    await expect(
      useCase.handle({
        postId: PostId,
        userId: AuthorId,
        post: { categoryId: 'other' },
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundException);
    entitlements.getCapability.mockResolvedValueOnce({ allowed: false });
    await expect(
      useCase.handle({
        postId: PostId,
        userId: AuthorId,
        post: { isSos: true },
      }),
    ).rejects.toBeInstanceOf(PostSosNotAllowedException);
  });
  it('supports CLASSIFIED condition/price/negotiable but rejects OFFER-only value', async () => {
    const { useCase, posts } = setup({ postType: PostTypes.CLASSIFIED });
    await useCase.handle({
      postId: PostId,
      userId: AuthorId,
      post: {
        price: 100,
        negotiable: true,
        condition: GiftPostConditions.USED,
      },
    });
    expect(
      posts.updateOwnedContent.mock.calls[0][0].changes.details,
    ).toMatchObject({ price: 100, negotiable: true });
    await expect(
      useCase.handle({
        postId: PostId,
        userId: AuthorId,
        post: { estimatedValue: 100 },
      }),
    ).rejects.toThrow();
  });
  it('WANTED supports quantity and content but not condition/price', async () => {
    const { useCase } = setup({ postType: PostTypes.WANTED });
    await expect(
      useCase.handle({
        postId: PostId,
        userId: AuthorId,
        post: { totalQuantity: 3 },
      }),
    ).resolves.toBeDefined();
    await expect(
      useCase.handle({
        postId: PostId,
        userId: AuthorId,
        post: { condition: GiftPostConditions.USED },
      }),
    ).rejects.toThrow();
    await expect(
      useCase.handle({ postId: PostId, userId: AuthorId, post: { price: 1 } }),
    ).rejects.toThrow();
  });
  it('changing ship delivery to pickup or negotiation clears payer', async () => {
    const { useCase, posts } = setup({
      deliveryMethod: DeliveryMethods.GIVER_SHIPS,
      shipPayer: ShipPayers.GIVER,
    });
    await useCase.handle({
      postId: PostId,
      userId: AuthorId,
      post: { deliveryMethod: null },
    });
    expect(posts.updateOwnedContent.mock.calls[0][0].changes).toMatchObject({
      deliveryMethod: null,
      shipPayer: null,
    });
    await useCase.handle({
      postId: PostId,
      userId: AuthorId,
      post: { deliveryMethod: DeliveryMethods.SELF_PICKUP },
    });
    expect(
      posts.updateOwnedContent.mock.calls[1][0].changes.shipPayer,
    ).toBeNull();
    await expect(
      useCase.handle({
        postId: PostId,
        userId: AuthorId,
        post: { deliveryMethod: null, shipPayer: ShipPayers.GIVER },
      }),
    ).rejects.toThrow();
  });
});
