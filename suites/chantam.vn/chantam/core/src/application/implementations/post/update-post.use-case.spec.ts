import { IPostRepository } from '@/domain/ports/repository';
import {
  PostSelectionModes,
  PostTypes,
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
    status: 'PENDING_REVIEW' as never,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: { condition: 'USED', estimatedValue: 1_500_000 },
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
    ...overrides,
  };
}

describe('UpdatePostUseCase', () => {
  it('chỉ owner cập nhật nội dung canonical post', async () => {
    const postRepository = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue(makePost({ title: 'Xe mới' })),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new UpdatePostUseCase(postRepository).handle({
      postId: PostId,
      userId: AuthorId,
      post: { title: 'Xe mới' },
    });

    expect(postRepository.update).toHaveBeenCalledWith(
      { globalId: PostId },
      { title: 'Xe mới' },
    );
    expect(result.post.title).toBe('Xe mới');
  });

  it('bài REJECTED khi được author cập nhật thì tự động chuyển về PENDING_REVIEW để duyệt lại', async () => {
    const postRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(makePost({ status: 'REJECTED' as never })),
      update: jest.fn(),
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue(
          makePost({ title: 'Xe sửa lại', status: 'PENDING_REVIEW' as never }),
        ),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new UpdatePostUseCase(postRepository).handle({
      postId: PostId,
      userId: AuthorId,
      post: { title: 'Xe sửa lại' },
    });

    expect(postRepository.update).toHaveBeenCalledWith(
      { globalId: PostId },
      { title: 'Xe sửa lại', status: 'PENDING_REVIEW' },
    );
    expect(result.post.status).toBe('PENDING_REVIEW');
  });

  it('từ chối người không phải owner trước khi update', async () => {
    const postRepository = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new UpdatePostUseCase(postRepository).handle({
        postId: PostId,
        userId: '33333333-3333-3333-3333-333333333333',
        post: { title: 'Không được phép' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(postRepository.update).not.toHaveBeenCalled();
  });
});
