import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { RemovePostMediaUseCase } from './remove-post-media.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const OwnerId = '22222222-2222-2222-2222-222222222222';

describe('RemovePostMediaUseCase', () => {
  it('owner xoá media của đúng post', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = {
      removeByPostId: jest
        .fn()
        .mockResolvedValue('users/u/posts/p/media/a.webp'),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const storage = { deleteObjects: jest.fn(async () => 1) };

    await new RemovePostMediaUseCase(posts, media, storage as never).handle({
      postId: PostId,
      mediaId: 1,
      userId: OwnerId,
    });

    expect(media.removeByPostId).toHaveBeenCalledWith(PostId, 1);
    // Thiếu bước này thì ảnh nằm lại trong bucket vĩnh viễn: bản ghi đã mất
    // nên không còn gì trỏ tới nó nữa.
    expect(storage.deleteObjects).toHaveBeenCalledWith([
      'users/u/posts/p/media/a.webp',
    ]);
  });

  it('từ chối non-owner trước khi xoá media', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = {
      removeByPostId: jest.fn(),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const storage = { deleteObjects: jest.fn() };

    await expect(
      new RemovePostMediaUseCase(posts, media, storage as never).handle({
        postId: PostId,
        mediaId: 1,
        userId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(media.removeByPostId).not.toHaveBeenCalled();
    expect(storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('không có gì để gỡ thì KHÔNG gọi xoá object', async () => {
    // `removeByPostId` trả null nghĩa là mediaId không thuộc bài này. Gọi xoá
    // với `null` là ném một key rỗng vào S3.
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = {
      removeByPostId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const storage = { deleteObjects: jest.fn() };

    await expect(
      new RemovePostMediaUseCase(posts, media, storage as never).handle({
        postId: PostId,
        mediaId: 99,
        userId: OwnerId,
      }),
    ).rejects.toThrow();
    expect(storage.deleteObjects).not.toHaveBeenCalled();
  });
});
