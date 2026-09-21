import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { DeletePostUseCase } from './delete-post.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const OwnerId = '22222222-2222-2222-2222-222222222222';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: OwnerId,
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
    status: 'PENDING_REVIEW' as never,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
    expiresAt: null,
    renewedCount: 0,
    isSos: false,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('DeletePostUseCase', () => {
  it('owner xoá mềm post và chuyển trạng thái cancelled', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await new DeletePostUseCase(posts).handle({
      postId: PostId,
      userId: OwnerId,
    });

    expect(posts.update).toHaveBeenCalledWith(
      { globalId: PostId },
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    expect(posts.update.mock.calls[0][1].deletedAt).toBeInstanceOf(Date);
  });

  it('từ chối non-owner và post không tồn tại', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new DeletePostUseCase(posts).handle({
        postId: PostId,
        userId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    posts.findOneBy.mockResolvedValue(null);
    await expect(
      new DeletePostUseCase(posts).handle({ postId: PostId, userId: OwnerId }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });
});
