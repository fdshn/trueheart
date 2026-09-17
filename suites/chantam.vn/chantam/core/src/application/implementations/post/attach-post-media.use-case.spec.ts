import { IPostRepository } from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { AttachPostMediaUseCase } from './attach-post-media.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const OwnerId = '22222222-2222-2222-2222-222222222222';
const Key = `users/${OwnerId}/posts/${PostId}/media/image.webp`;

describe('AttachPostMediaUseCase', () => {
  it('xác minh object owner-scoped trước khi gắn media', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = {
      attach: jest.fn().mockResolvedValue({
        id: 1,
        postId: PostId,
        r2Key: Key,
        sortOrder: 0,
        createdAt: new Date(),
      }),
    };
    const storage = {
      confirmPostMediaUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IObjectStorage>;

    const result = await new AttachPostMediaUseCase(
      posts,
      media as never,
      storage,
    ).handle({
      postId: PostId,
      userId: OwnerId,
      media: { key: Key },
    });

    expect(storage.confirmPostMediaUpload).toHaveBeenCalledWith(
      OwnerId,
      PostId,
      Key,
    );
    expect(media.attach).toHaveBeenCalledWith(PostId, Key);
    expect(result.media.r2Key).toBe(Key);
  });

  it('từ chối người không phải owner trước khi xác minh object', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = { attach: jest.fn() };
    const storage = {
      confirmPostMediaUpload: jest.fn(),
    } as unknown as jest.Mocked<IObjectStorage>;

    await expect(
      new AttachPostMediaUseCase(posts, media as never, storage).handle({
        postId: PostId,
        userId: '33333333-3333-3333-3333-333333333333',
        media: { key: Key },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.confirmPostMediaUpload).not.toHaveBeenCalled();
    expect(media.attach).not.toHaveBeenCalled();
  });
});
