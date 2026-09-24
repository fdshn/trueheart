import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  PointDailyCapReachedException,
  PointRuleUnavailableException,
} from '@/domain/exceptions';
import {
  PostCommentedRuleCode,
  PostReactedRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';
import { awardCommentPoint, awardReactionPoint } from './feed-points';

const PostId = '11111111-1111-1111-1111-111111111111';
const CommentId = '22222222-2222-2222-2222-222222222222';
const PostAuthorId = '33333333-3333-3333-3333-333333333333';
const ActorId = '44444444-4444-4444-4444-444444444444';

function makePoints(): jest.Mocked<IAppendPointEntryUseCase> {
  return {
    handle: jest.fn().mockResolvedValue({ applied: true }),
  } as unknown as jest.Mocked<IAppendPointEntryUseCase>;
}

describe('awardCommentPoint', () => {
  const params = (overrides = {}) => ({
    commentId: CommentId,
    postId: PostId,
    authorId: ActorId,
    postAuthorId: PostAuthorId,
    isVisible: true,
    ...overrides,
  });

  it('thưởng đúng rule và khoá chống trùng theo bình luận', async () => {
    const points = makePoints();

    await awardCommentPoint(points, params());

    expect(points.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ActorId,
        ruleCode: PostCommentedRuleCode,
        referenceType: 'CONTENT_COMMENT',
        referenceId: CommentId,
        idempotencyKey: `${PostCommentedRuleCode}:${CommentId}`,
        actor: 'SYSTEM',
        source: 'FEED',
      }),
    );
  });

  it('không thưởng khi bình luận vào bài của CHÍNH MÌNH', async () => {
    // Tự bình luận bài mình để lấy điểm là thứ ai cũng nghĩ ra trong năm phút.
    const points = makePoints();

    await awardCommentPoint(points, params({ authorId: PostAuthorId }));

    expect(points.handle).not.toHaveBeenCalled();
  });

  it('không thưởng bình luận đang chờ duyệt', async () => {
    const points = makePoints();

    await awardCommentPoint(points, params({ isVisible: false }));

    expect(points.handle).not.toHaveBeenCalled();
  });

  it('rule đang TẮT thì nuốt lỗi, không làm hỏng việc bình luận', async () => {
    // Hai rule F41 seed tắt sẵn, nên đây là đường chạy MẶC ĐỊNH cho tới khi
    // Admin bật. Ném ra đây là không ai bình luận được.
    const points = makePoints();
    points.handle.mockRejectedValue(
      new PointRuleUnavailableException(PostCommentedRuleCode),
    );

    await expect(awardCommentPoint(points, params())).resolves.toBeUndefined();
  });

  it('đạt trần ngày cũng nuốt', async () => {
    const points = makePoints();
    points.handle.mockRejectedValue(
      new PointDailyCapReachedException(PostCommentedRuleCode, 10),
    );

    await expect(awardCommentPoint(points, params())).resolves.toBeUndefined();
  });

  it('nhưng lỗi database thật thì NỔI LÊN', async () => {
    // Nuốt tất là che mất hỏng hóc thật cho tới khi số liệu đã sai từ lâu.
    const points = makePoints();
    points.handle.mockRejectedValue(new Error('connection terminated'));

    await expect(awardCommentPoint(points, params())).rejects.toThrow(
      'connection terminated',
    );
  });
});

describe('awardReactionPoint', () => {
  const params = (overrides = {}) => ({
    postId: PostId,
    actorId: ActorId,
    postAuthorId: PostAuthorId,
    isNewReaction: true,
    ...overrides,
  });

  it('khoá chống trùng theo BÀI và NGƯỜI, không theo lần bấm', async () => {
    // Gỡ cảm xúc rồi thả lại không được thưởng thêm, nếu không thì bấm đi bấm
    // lại là ra điểm vô hạn trong phạm vi trần ngày.
    const points = makePoints();

    await awardReactionPoint(points, params());

    expect(points.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleCode: PostReactedRuleCode,
        idempotencyKey: `${PostReactedRuleCode}:${PostId}:${ActorId}`,
      }),
    );
  });

  it('chỉ ĐỔI loại cảm xúc thì không thưởng', async () => {
    const points = makePoints();

    await awardReactionPoint(points, params({ isNewReaction: false }));

    expect(points.handle).not.toHaveBeenCalled();
  });

  it('không thưởng khi thả cảm xúc lên bài của chính mình', async () => {
    const points = makePoints();

    await awardReactionPoint(points, params({ actorId: PostAuthorId }));

    expect(points.handle).not.toHaveBeenCalled();
  });

  it('rule tắt thì nuốt, lỗi thật thì nổi lên', async () => {
    const points = makePoints();
    points.handle.mockRejectedValue(
      new PointRuleUnavailableException(PostReactedRuleCode),
    );
    await expect(awardReactionPoint(points, params())).resolves.toBeUndefined();

    points.handle.mockRejectedValue(new Error('deadlock detected'));
    await expect(awardReactionPoint(points, params())).rejects.toThrow(
      'deadlock detected',
    );
  });
});
