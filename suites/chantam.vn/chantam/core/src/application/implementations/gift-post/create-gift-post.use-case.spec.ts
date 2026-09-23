import { ICreatePostUseCase } from '@/application/contracts/post';
import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { CreateGiftPostUseCase } from './create-gift-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';
const GiftPost = {
  title: 'Xe đạp cũ',
  description: 'Còn dùng tốt',
  category: GiftPostCategories.VEHICLE,
  condition: GiftPostConditions.USED,
  estimatedValue: 1_500_000,
  location: { lat: 10.7724, lng: 106.698 },
  areaLabel: 'Quận 1, TP.HCM',
};

function makeCanonicalPost(): IPostEntity {
  return {
    id: 1,
    globalId: '11111111-1111-1111-1111-111111111111',
    postType: PostTypes.OFFER,
    authorId: UserId,
    categoryId: '30000000-0000-4000-8000-000000000006',
    title: GiftPost.title,
    description: GiftPost.description,
    location: GiftPost.location,
    areaLabel: GiftPost.areaLabel,
    status: GiftPostStatuses.PENDING_REVIEW,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {
      condition: GiftPost.condition,
      estimatedValue: GiftPost.estimatedValue,
    },
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
    likeCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe('CreateGiftPostUseCase compatibility', () => {
  it('delegates legacy create to canonical OFFER use case without gift_posts write', async () => {
    const createPost = {
      handle: jest.fn().mockResolvedValue({ post: makeCanonicalPost() }),
    } as unknown as jest.Mocked<ICreatePostUseCase>;

    const result = await new CreateGiftPostUseCase(createPost).handle({
      userId: UserId,
      giftPost: GiftPost,
    });

    expect(createPost.handle).toHaveBeenCalledWith({
      userId: UserId,
      post: {
        postType: PostTypes.OFFER,
        title: GiftPost.title,
        description: GiftPost.description,
        categoryId: '30000000-0000-4000-8000-000000000006',
        condition: GiftPost.condition,
        estimatedValue: GiftPost.estimatedValue,
        location: GiftPost.location,
        areaLabel: GiftPost.areaLabel,
        totalQuantity: undefined,
      },
    });
    expect(result.giftPost).toMatchObject({
      giverId: UserId,
      category: GiftPostCategories.VEHICLE,
      condition: GiftPostConditions.USED,
    });
  });
});
