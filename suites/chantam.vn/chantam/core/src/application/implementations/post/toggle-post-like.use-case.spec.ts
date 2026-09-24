import { PostNotFoundException } from '@/domain/exceptions';
import {
  IContentReactionRepository,
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

function makeDeps(
  post: IPostEntity | null,
  toggleResult = { liked: true, likeCount: 1 },
) {
  return {
    posts: {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>,
    reactions: {
      toggleLike: jest.fn().mockResolvedValue(toggleResult),
    } as unknown as jest.Mocked<IContentReactionRepository>,
  };
}

describe('TogglePostLikeUseCase', () => {
  it('thích thì uỷ thác cho bảng cảm xúc, không có bảng like riêng', async () => {
    // Nút thích chỉ là lối tắt cho cảm xúc LIKE. Hai bảng song song thì
    // GET /posts/:id trả hai con số thích khác nhau cho cùng một bài.
    const deps = makeDeps(makePost(), { liked: true, likeCount: 1 });

    const result = await new TogglePostLikeUseCase(
      deps.posts,
      deps.reactions,
    ).handle({ postId: PostId, userId: UserId });

    expect(deps.reactions.toggleLike).toHaveBeenCalledWith(PostId, UserId);
    expect(result).toEqual({ liked: true, likeCount: 1 });
  });

  it('bỏ thích trả trạng thái và số đếm mới', async () => {
    const deps = makeDeps(makePost({ likeCount: 1 }), {
      liked: false,
      likeCount: 0,
    });

    const result = await new TogglePostLikeUseCase(
      deps.posts,
      deps.reactions,
    ).handle({ postId: PostId, userId: UserId });

    expect(result).toEqual({ liked: false, likeCount: 0 });
  });

  it('bấm hai lần liên tiếp không ném lỗi — thao tác là bình thái', async () => {
    // Bản cũ đọc trạng thái rồi mới ghi nên hai request song song lọt qua
    // được và ném "đã thích rồi" vào mặt người dùng. Nay trạng thái được đọc
    // và ghi trong cùng một transaction dưới repository.
    const deps = makeDeps(makePost());
    deps.reactions.toggleLike
      .mockResolvedValueOnce({ liked: true, likeCount: 1 })
      .mockResolvedValueOnce({ liked: false, likeCount: 0 });

    const useCase = new TogglePostLikeUseCase(deps.posts, deps.reactions);
    const first = await useCase.handle({ postId: PostId, userId: UserId });
    const second = await useCase.handle({ postId: PostId, userId: UserId });

    expect(first.liked).toBe(true);
    expect(second.liked).toBe(false);
  });

  it('bài không tồn tại thì báo lỗi, không đụng tới cảm xúc', async () => {
    const deps = makeDeps(null);

    await expect(
      new TogglePostLikeUseCase(deps.posts, deps.reactions).handle({
        postId: PostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);

    expect(deps.reactions.toggleLike).not.toHaveBeenCalled();
  });

  it('bài đã xoá mềm cũng coi như không tồn tại', async () => {
    // Khoá ngoại đa hình không tồn tại nên database không chặn được một cảm
    // xúc trỏ vào bài đã xoá — phép kiểm này là thứ duy nhất giữ chỗ đó.
    const deps = makeDeps(makePost({ deletedAt: new Date() }));

    await expect(
      new TogglePostLikeUseCase(deps.posts, deps.reactions).handle({
        postId: PostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);

    expect(deps.reactions.toggleLike).not.toHaveBeenCalled();
  });
});
