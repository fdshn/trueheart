import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { ReorderPostMediaUseCase } from './reorder-post-media.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const OwnerId = '22222222-2222-2222-2222-222222222222';

describe('ReorderPostMediaUseCase', () => {
  it('chỉ owner thay thế toàn bộ thứ tự media của đúng post', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
        status: 'PUBLISHED',
        expiresAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = {
      replaceOrder: jest.fn().mockResolvedValue([
        { id: 2, postId: PostId, sortOrder: 0 },
        { id: 1, postId: PostId, sortOrder: 1 },
      ]),
    } as unknown as jest.Mocked<IPostMediaRepository>;

    const result = await new ReorderPostMediaUseCase(posts, media).handle({
      postId: PostId,
      userId: OwnerId,
      media: { mediaIds: [2, 1] },
    });

    expect(media.replaceOrder).toHaveBeenCalledWith(PostId, [2, 1]);
    expect(result.media.map((item) => item.id)).toEqual([2, 1]);
  });

  it('từ chối non-owner trước khi thay thứ tự', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
        status: 'PUBLISHED',
        expiresAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = {
      replaceOrder: jest.fn(),
    } as unknown as jest.Mocked<IPostMediaRepository>;

    await expect(
      new ReorderPostMediaUseCase(posts, media).handle({
        postId: PostId,
        userId: '33333333-3333-3333-3333-333333333333',
        media: { mediaIds: [2, 1] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(media.replaceOrder).not.toHaveBeenCalled();
  });
});
