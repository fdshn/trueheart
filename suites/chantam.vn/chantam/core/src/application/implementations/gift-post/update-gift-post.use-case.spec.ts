import {
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostConditions,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { UpdateGiftPostUseCase } from './update-gift-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';
const GiftPostId = '11111111-1111-1111-1111-111111111111';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: GiftPostId,
    postType: PostTypes.OFFER,
    authorId: UserId,
    categoryId: '30000000-0000-4000-8000-000000000006',
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
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('UpdateGiftPostUseCase compatibility', () => {
  it('chỉ update canonical content/details, không ghi gift_posts', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue(makePost({ title: 'Tiêu đề mới' })),
    } as unknown as jest.Mocked<IPostRepository>;

    await new UpdateGiftPostUseCase(posts).handle({
      userId: UserId,
      giftPostId: GiftPostId,
      giftPost: {
        title: 'Tiêu đề mới',
        condition: GiftPostConditions.LIKE_NEW,
      },
    });

    expect(posts.update).toHaveBeenCalledWith(
      { globalId: GiftPostId },
      {
        title: 'Tiêu đề mới',
        details: {
          condition: GiftPostConditions.LIKE_NEW,
          estimatedValue: 1_500_000,
        },
      },
    );
  });

  it('từ chối non-owner và legacy status patch', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost({ authorId: 'other' })),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new UpdateGiftPostUseCase(posts).handle({
        userId: UserId,
        giftPostId: GiftPostId,
        giftPost: { title: 'Tiêu đề mới' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    posts.findOneBy.mockResolvedValue(makePost());
    await expect(
      new UpdateGiftPostUseCase(posts).handle({
        userId: UserId,
        giftPostId: GiftPostId,
        giftPost: { status: GiftPostStatuses.PUBLISHED },
      }),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
  });

  it('ném canonical not found khi post không tồn tại', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new UpdateGiftPostUseCase(posts).handle({
        userId: UserId,
        giftPostId: GiftPostId,
        giftPost: { title: 'Tiêu đề mới' },
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });
});
