import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  PointDailyCapReachedException,
  PointRuleUnavailableException,
} from '@/domain/exceptions';
import {
  PostCommentedRuleCode,
  PostReactedRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';

/**
 * Điểm cho tương tác bảng tin (F41).
 *
 * **Hai rule này seed TẮT sẵn** (`is_enabled = false`, xem migration
 * `CreateFeedInteractions`), và `appendByRule` KHÔNG phân biệt "rule đã tắt"
 * với "rule không tồn tại" — cả hai đều ném `PointRuleUnavailableException`.
 * Nghĩa là mọi lời gọi ở đây sẽ ném cho tới khi Admin bật rule.
 *
 * **Điểm không được làm hỏng việc bình luận.** Việc một người vừa viết một câu
 * là SỰ THẬT; thưởng bao nhiêu là CHÍNH SÁCH. Để chính sách đánh đổ sự thật thì
 * người dùng không bình luận được chỉ vì họ đạt trần điểm trong ngày, hoặc vì
 * Admin chưa bật rule. Nên hai ngoại lệ chính sách bị nuốt; mọi lỗi khác — tức
 * lỗi database thật — vẫn nổi lên.
 *
 * `affects_lifetime = false` nằm ở seed chứ không ở đây: `lifetime` là sàn của
 * Rank, và cho bình luận đẩy hạng thì gõ 300 dòng "hay quá ạ" là lên Bạc, trong
 * khi tặng một món đồ thật được 56 điểm.
 */
async function awardSwallowingPolicy(
  points: IAppendPointEntryUseCase,
  command: {
    userId: string;
    ruleCode: string;
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
    source: string;
  },
): Promise<void> {
  try {
    await points.handle({ ...command, actor: 'SYSTEM' });
  } catch (error) {
    const isPolicy =
      error instanceof PointDailyCapReachedException ||
      error instanceof PointRuleUnavailableException;
    if (!isPolicy) throw error;
  }
}

export interface IAwardCommentPointParams {
  readonly commentId: string;
  readonly postId: string;
  readonly authorId: string;
  readonly postAuthorId: string | null;
  /** `false` khi bình luận bị bộ lọc từ ngữ giữ lại chờ duyệt. */
  readonly isVisible: boolean;
}

/**
 * Thưởng điểm cho người vừa bình luận.
 *
 * Không thưởng khi bình luận vào bài của CHÍNH MÌNH: tự bình luận bài mình để
 * lấy điểm là thứ ai cũng nghĩ ra trong năm phút, và trần theo ngày chỉ làm
 * chậm chứ không chặn.
 *
 * Không thưởng bình luận đang chờ duyệt — nó chưa hiện ra với ai.
 */
export async function awardCommentPoint(
  points: IAppendPointEntryUseCase,
  params: IAwardCommentPointParams,
): Promise<void> {
  if (!params.isVisible) return;
  if (!params.postAuthorId || params.postAuthorId === params.authorId) return;

  await awardSwallowingPolicy(points, {
    userId: params.authorId,
    ruleCode: PostCommentedRuleCode,
    referenceType: 'CONTENT_COMMENT',
    referenceId: params.commentId,
    idempotencyKey: `${PostCommentedRuleCode}:${params.commentId}`,
    source: 'FEED',
  });
}

export interface IAwardReactionPointParams {
  readonly postId: string;
  readonly actorId: string;
  readonly postAuthorId: string | null;
  /** `false` khi người này chỉ đổi loại cảm xúc. */
  readonly isNewReaction: boolean;
}

/**
 * Thưởng điểm cho người vừa bày tỏ cảm xúc.
 *
 * Khoá chống trùng theo **bài và người**, không theo lần bấm: gỡ cảm xúc rồi
 * thả lại không được thưởng thêm lần nữa, nếu không thì bấm đi bấm lại là ra
 * điểm vô hạn trong phạm vi trần ngày.
 */
export async function awardReactionPoint(
  points: IAppendPointEntryUseCase,
  params: IAwardReactionPointParams,
): Promise<void> {
  if (!params.isNewReaction) return;
  if (!params.postAuthorId || params.postAuthorId === params.actorId) return;

  await awardSwallowingPolicy(points, {
    userId: params.actorId,
    ruleCode: PostReactedRuleCode,
    referenceType: 'POST',
    referenceId: params.postId,
    idempotencyKey: `${PostReactedRuleCode}:${params.postId}:${params.actorId}`,
    source: 'FEED',
  });
}
