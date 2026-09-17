import { PostMediaLimitExceededException } from '@/domain/exceptions';
import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { RequestPostMediaUploadUseCase } from './request-post-media-upload.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const OwnerId = '22222222-2222-2222-2222-222222222222';

describe('RequestPostMediaUploadUseCase', () => {
  it('chỉ owner được nhận presigned key bind với post', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const storage = {
      createPostMediaUpload: jest.fn().mockResolvedValue({ key: 'key' }),
    } as unknown as jest.Mocked<IObjectStorage>;

    const media = {
      countByPostId: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<IPostMediaRepository>;

    await new RequestPostMediaUploadUseCase(posts, media, storage).handle({
      postId: PostId,
      userId: OwnerId,
      contentType: 'image/webp',
      contentLength: 123,
    });

    expect(storage.createPostMediaUpload).toHaveBeenCalledWith({
      postId: PostId,
      userId: OwnerId,
      contentType: 'image/webp',
      contentLength: 123,
    });
  });

  it('từ chối non-owner trước khi phát presigned URL', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const storage = {
      createPostMediaUpload: jest.fn(),
    } as unknown as jest.Mocked<IObjectStorage>;

    const media = {
      countByPostId: jest.fn(),
    } as unknown as jest.Mocked<IPostMediaRepository>;

    await expect(
      new RequestPostMediaUploadUseCase(posts, media, storage).handle({
        postId: PostId,
        userId: '33333333-3333-3333-3333-333333333333',
        contentType: 'image/webp',
        contentLength: 123,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.createPostMediaUpload).not.toHaveBeenCalled();
  });

  it('chặn presign khi post đã đủ 10 ảnh', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = {
      countByPostId: jest.fn().mockResolvedValue(10),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const storage = {
      createPostMediaUpload: jest.fn(),
    } as unknown as jest.Mocked<IObjectStorage>;

    await expect(
      new RequestPostMediaUploadUseCase(posts, media, storage).handle({
        postId: PostId,
        userId: OwnerId,
        contentType: 'image/webp',
        contentLength: 123,
      }),
    ).rejects.toBeInstanceOf(PostMediaLimitExceededException);
    expect(storage.createPostMediaUpload).not.toHaveBeenCalled();
  });
});
