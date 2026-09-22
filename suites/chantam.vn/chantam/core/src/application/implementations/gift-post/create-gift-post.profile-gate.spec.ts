import { ICreatePostUseCase } from '@/application/contracts/post';
import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { CreateGiftPostUseCase } from './create-gift-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';
const Command = {
  userId: UserId,
  giftPost: {
    title: 'Xe đạp cũ còn dùng tốt',
    description:
      'Xe còn dùng tốt, tặng người cần di chuyển đi học hoặc đi làm.',
    category: GiftPostCategories.VEHICLE,
    condition: GiftPostConditions.USED,
    estimatedValue: 1_500_000,
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
  },
};

function makePost(): IPostEntity {
  return {
    id: 1,
    globalId: '11111111-1111-1111-1111-111111111111',
    postType: PostTypes.OFFER,
    authorId: UserId,
    categoryId: '30000000-0000-4000-8000-000000000006',
    title: Command.giftPost.title,
    description: Command.giftPost.description,
    location: Command.giftPost.location,
    areaLabel: Command.giftPost.areaLabel,
    status: GiftPostStatuses.PENDING_REVIEW,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {
      condition: GiftPostConditions.USED,
      estimatedValue: 1_500_000,
    },
    expiresAt: null,
    renewedCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe('CreateGiftPostUseCase compatibility profile gate', () => {
  it('chuyển userId đã xác thực vào canonical create use case', async () => {
    const createPost = {
      handle: jest.fn().mockResolvedValue({ post: makePost() }),
    } as unknown as jest.Mocked<ICreatePostUseCase>;

    await new CreateGiftPostUseCase(createPost).handle(Command);

    expect(createPost.handle).toHaveBeenCalledWith(
      expect.objectContaining({ userId: UserId }),
    );
  });
});
