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
      removeByPostId: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IPostMediaRepository>;

    await new RemovePostMediaUseCase(posts, media).handle({
      postId: PostId,
      mediaId: 1,
      userId: OwnerId,
    });

    expect(media.removeByPostId).toHaveBeenCalledWith(PostId, 1);
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

    await expect(
      new RemovePostMediaUseCase(posts, media).handle({
        postId: PostId,
        mediaId: 1,
        userId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(media.removeByPostId).not.toHaveBeenCalled();
  });
});
