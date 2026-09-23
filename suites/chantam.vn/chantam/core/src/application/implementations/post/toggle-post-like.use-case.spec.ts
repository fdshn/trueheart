import {
  PostAlreadyLikedException,
  PostNotFoundException,
  PostNotLikedException,
} from '@/domain/exceptions';
import {
  IPostLikeRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { TogglePostLikeUseCase } from './toggle-post-like.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const UserId = '22222222-2222-2222-2222-222222222222';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: '33333333-3333-3333-3333-333333333333',
    categoryId: '44444444-4444-4444-4444-444444444444',
    title: 'Đồ chơi trẻ em',
    description: 'Bộ xếp hình lego còn mới',
    location: { lat: 10.7, lng: 106.6 },
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
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
    likeCount: 0,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('TogglePostLikeUseCase', () => {
  it('like thành công khi người dùng chưa like', async () => {
    const post = makePost({ likeCount: 0 });
    const postRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce({ ...post, likeCount: 1 }),
    } as unknown as jest.Mocked<IPostRepository>;

    const postLikeRepository = {
      hasLiked: jest.fn().mockResolvedValue(false),
      like: jest.fn().mockResolvedValue({
        id: 1,
        userId: UserId,
        postId: PostId,
        createdAt: new Date(),
      }),
      unlike: jest.fn(),
    } as unknown as jest.Mocked<IPostLikeRepository>;

    const useCase = new TogglePostLikeUseCase(
      postRepository,
      postLikeRepository,
    );

    const result = await useCase.handle({
      postId: PostId,
      userId: UserId,
    });

    expect(postLikeRepository.hasLiked).toHaveBeenCalledWith(UserId, PostId);
    expect(postLikeRepository.like).toHaveBeenCalledWith(UserId, PostId);
    expect(postLikeRepository.unlike).not.toHaveBeenCalled();
    expect(result).toEqual({ liked: true, likeCount: 1 });
  });

  it('unlike thành công khi người dùng đã like trước đó', async () => {
    const post = makePost({ likeCount: 1 });
    const postRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce({ ...post, likeCount: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;

    const postLikeRepository = {
      hasLiked: jest.fn().mockResolvedValue(true),
      like: jest.fn(),
      unlike: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IPostLikeRepository>;

    const useCase = new TogglePostLikeUseCase(
      postRepository,
      postLikeRepository,
    );

    const result = await useCase.handle({
      postId: PostId,
      userId: UserId,
    });

    expect(postLikeRepository.hasLiked).toHaveBeenCalledWith(UserId, PostId);
    expect(postLikeRepository.unlike).toHaveBeenCalledWith(UserId, PostId);
    expect(postLikeRepository.like).not.toHaveBeenCalled();
    expect(result).toEqual({ liked: false, likeCount: 0 });
  });

  it('ném PostNotFoundException khi bài không tồn tại hoặc đã bị xoá', async () => {
    const postRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;
    const postLikeRepository = {
      hasLiked: jest.fn(),
      like: jest.fn(),
      unlike: jest.fn(),
    } as unknown as jest.Mocked<IPostLikeRepository>;

    const useCase = new TogglePostLikeUseCase(
      postRepository,
      postLikeRepository,
    );

    await expect(
      useCase.handle({ postId: PostId, userId: UserId }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('ném PostAlreadyLikedException nếu repo trả null khi like', async () => {
    const post = makePost({ likeCount: 1 });
    const postRepository = {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>;

    const postLikeRepository = {
      hasLiked: jest.fn().mockResolvedValue(false),
      like: jest.fn().mockResolvedValue(null),
      unlike: jest.fn(),
    } as unknown as jest.Mocked<IPostLikeRepository>;

    const useCase = new TogglePostLikeUseCase(
      postRepository,
      postLikeRepository,
    );

    await expect(
      useCase.handle({ postId: PostId, userId: UserId }),
    ).rejects.toBeInstanceOf(PostAlreadyLikedException);
  });

  it('ném PostNotLikedException nếu repo trả false khi unlike', async () => {
    const post = makePost({ likeCount: 1 });
    const postRepository = {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>;

    const postLikeRepository = {
      hasLiked: jest.fn().mockResolvedValue(true),
      like: jest.fn(),
      unlike: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<IPostLikeRepository>;

    const useCase = new TogglePostLikeUseCase(
      postRepository,
      postLikeRepository,
    );

    await expect(
      useCase.handle({ postId: PostId, userId: UserId }),
    ).rejects.toBeInstanceOf(PostNotLikedException);
  });
});
