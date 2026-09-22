import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostConditions,
  GiftPostStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { UpdatePostUseCase } from './update-post.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';

function makePost(postType = PostTypes.OFFER): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType,
    authorId: '22222222-2222-2222-2222-222222222222',
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PENDING_REVIEW,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: { condition: GiftPostConditions.USED, estimatedValue: 1_500_000 },
    expiresAt: null,
    renewedCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
    likeCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe('UpdatePostUseCase OFFER parity', () => {
  it('merges typed OFFER details into canonical details', async () => {
    const posts = {
      findOneBy: jest.fn(async () => makePost()),
      update: jest.fn(async () => undefined),
      findOneByOrFail: jest.fn(async () => makePost()),
    } as unknown as jest.Mocked<IPostRepository>;

    await new UpdatePostUseCase(posts).handle({
      userId: '22222222-2222-2222-2222-222222222222',
      postId: PostId,
      post: {
        condition: GiftPostConditions.LIKE_NEW,
        estimatedValue: 2_000_000,
      },
    });

    expect(posts.update).toHaveBeenCalledWith(
      { globalId: PostId },
      expect.objectContaining({
        details: {
          condition: GiftPostConditions.LIKE_NEW,
          estimatedValue: 2_000_000,
        },
      }),
    );
  });

  it('rejects OFFER details for non-OFFER posts', async () => {
    const posts = {
      findOneBy: jest.fn(async () => makePost(PostTypes.CHARITY)),
      update: jest.fn(),
      findOneByOrFail: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new UpdatePostUseCase(posts).handle({
        userId: '22222222-2222-2222-2222-222222222222',
        postId: PostId,
        post: { condition: GiftPostConditions.LIKE_NEW },
      }),
    ).rejects.toThrow();
    expect(posts.update).not.toHaveBeenCalled();
  });
});
