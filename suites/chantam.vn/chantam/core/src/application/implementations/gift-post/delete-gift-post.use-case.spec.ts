import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { DeleteGiftPostUseCase } from './delete-gift-post.use-case';

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
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
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
    ...overrides,
  };
}

describe('DeleteGiftPostUseCase compatibility', () => {
  it('xoá mềm canonical OFFER và giữ legacy response shape', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new DeleteGiftPostUseCase(posts).handle({
      giftPostId: GiftPostId,
      userId: UserId,
    });

    expect(posts.update).toHaveBeenCalledWith(
      { globalId: GiftPostId },
      expect.objectContaining({ status: GiftPostStatuses.CANCELLED }),
    );
    expect(result.giftPostId).toBe(GiftPostId);
    expect(result.deletedAt).toBeInstanceOf(Date);
  });

  it('từ chối non-owner và missing canonical post', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost({ authorId: 'other' })),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new DeleteGiftPostUseCase(posts).handle({
        giftPostId: GiftPostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    posts.findOneBy.mockResolvedValue(null);
    await expect(
      new DeleteGiftPostUseCase(posts).handle({
        giftPostId: GiftPostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });
});
