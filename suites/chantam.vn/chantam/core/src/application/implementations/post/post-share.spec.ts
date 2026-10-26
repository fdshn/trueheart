import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { postShareLinkOf } from '../shared/post-share-link';
import { ResolvePostShareUseCase } from './resolve-post-share.use-case';

const PostId = '11111111-1111-4111-8111-111111111111';
const Viewer = '99999999-9999-4999-8999-999999999999';

function makePosts(post: object | null) {
  return {
    findPublicByShareCode: jest.fn().mockResolvedValue(post),
  } as unknown as jest.Mocked<IPostRepository>;
}

describe('postShareLinkOf', () => {
  it('đường dẫn tương đối luôn có, URL tuyệt đối chỉ khi web công khai đã cấu hình', () => {
    expect(postShareLinkOf('', 'K7MQ2XRP9A')).toEqual({
      shareCode: 'K7MQ2XRP9A',
      sharePath: '/p/K7MQ2XRP9A',
      shareUrl: null,
    });
    expect(postShareLinkOf('https://chantam.vn/', 'K7MQ2XRP9A').shareUrl).toBe(
      'https://chantam.vn/p/K7MQ2XRP9A',
    );
  });
});

describe('ResolvePostShareUseCase', () => {
  it('trả postId, postType, status để client điều hướng; tra bằng mã viết hoa', async () => {
    const posts = makePosts({
      globalId: PostId,
      postType: PostTypes.CLASSIFIED,
      status: GiftPostStatuses.RESERVED,
    });

    const result = await new ResolvePostShareUseCase(posts).handle({
      shareCode: ' k7mq2xrp9a ',
      currentUserId: Viewer,
    });

    expect(result).toEqual({
      post: {
        postId: PostId,
        postType: PostTypes.CLASSIFIED,
        status: GiftPostStatuses.RESERVED,
      },
    });
    expect(posts.findPublicByShareCode).toHaveBeenCalledWith(
      'K7MQ2XRP9A',
      Viewer,
    );
  });

  it('mã sai dạng: 404 mà không chạm DB', async () => {
    const posts = makePosts(null);

    await expect(
      new ResolvePostShareUseCase(posts).handle({ shareCode: 'O0I1-abc' }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
    expect(posts.findPublicByShareCode).not.toHaveBeenCalled();
  });

  it('bài không có quyền xem (repository trả null): 404', async () => {
    await expect(
      new ResolvePostShareUseCase(makePosts(null)).handle({
        shareCode: 'K7MQ2XRP9A',
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('bài bị Admin gỡ không mở qua mã, kể cả với chính chủ bài', async () => {
    const posts = makePosts({
      globalId: PostId,
      postType: PostTypes.OFFER,
      status: GiftPostStatuses.REJECTED,
    });

    await expect(
      new ResolvePostShareUseCase(posts).handle({
        shareCode: 'K7MQ2XRP9A',
        currentUserId: Viewer,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });
});
