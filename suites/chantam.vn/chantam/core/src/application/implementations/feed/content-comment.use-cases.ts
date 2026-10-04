import {
  ICreateCommentCommand,
  ICreateCommentResult,
  ICreateCommentUseCase,
  IEditCommentCommand,
  IEditCommentResult,
  IEditCommentUseCase,
  IListCommentRepliesCommand,
  IListCommentRepliesResult,
  IListCommentRepliesUseCase,
  IListCommentsCommand,
  IListCommentsResult,
  IListCommentsUseCase,
  IRemoveCommentCommand,
  IRemoveCommentResult,
  IRemoveCommentUseCase,
  IRequestCommentMediaUploadCommand,
  IRequestCommentMediaUploadResult,
  IRequestCommentMediaUploadUseCase,
} from '@/application/contracts/feed';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  ContentBlockedTermsException,
  ContentCommentNotFoundException,
  ContentEditWindowClosedException,
  DharmaThreadLockedException,
  DharmaThreadNotFoundException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IContentComment,
  IContentCommentRepository,
  IDharmaRepository,
  IEntitlementRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  CommentContentCapability,
  CommentEditWindowMinutes,
  CommentStatuses,
  ContentSubjectTypes,
  MaxContentMediaPerItem,
} from '@chantam.vn/chantam.core-lib/consts';
import { IContentCommentDto } from '@chantam.vn/chantam.core-lib/dto';
import {
  acceptsThreadComments,
  clampChatMessageLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
  isPubliclyVisibleThread,
  ModerationTermsConfigKey,
  ModerationVerdicts,
  normalizeBlockedTerms,
  screenText,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { withStorageValidation } from '../shared/storage-error';
import { notifyComment } from './feed-notifications';
import { awardCommentPoint } from './feed-points';

function toDto(
  comment: IContentComment,
  viewerId: string | null,
): IContentCommentDto {
  const removed =
    comment.status === CommentStatuses.REMOVED ||
    comment.status === CommentStatuses.HIDDEN;

  return {
    commentId: comment.globalId,
    parentId: comment.parentId,
    authorId: comment.authorId,
    authorUsername: comment.authorUsername,
    authorFullName: comment.authorFullName,
    // Bình luận đã gỡ giữ chỗ trong cây để chuỗi trả lời bên dưới không mất ngữ
    // cảnh, nhưng nội dung thì không được trả ra nữa.
    body: removed ? '' : comment.body,
    status: comment.status,
    replyCount: comment.replyCount,
    reactionCount: comment.reactionCount,
    isMine: comment.authorId === viewerId,
    // Bình luận đã gỡ không trả ảnh nữa — giữ chỗ trong cây là một chuyện, còn
    // để ảnh vẫn mở được bằng đường dẫn công khai là chuyện khác hẳn.
    mediaKeys: removed ? [] : comment.mediaKeys,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
  };
}

/**
 * Sàng nội dung qua danh sách từ cấm Admin cấu hình.
 *
 * Dùng chung cho tạo và sửa: hai đường ghi mà sàng bằng hai đoạn code thì sớm
 * muộn một đường bị quên cập nhật.
 */
@Injectable()
class CommentScreening {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async screen(
    body: string,
  ): Promise<{ status: CommentStatuses; flaggedTerms: string | null }> {
    const terms = normalizeBlockedTerms(
      await this.adminConfig.getConfigValue(ModerationTermsConfigKey),
    );
    const result = screenText(body, terms);

    if (result.verdict === ModerationVerdicts.BLOCK)
      throw new ContentBlockedTermsException();

    return {
      status:
        result.verdict === ModerationVerdicts.REVIEW
          ? CommentStatuses.PENDING_REVIEW
          : CommentStatuses.VISIBLE,
      flaggedTerms: result.matched.length ? result.matched.join(',') : null,
    };
  }
}

/**
 * Trần bình luận theo phút — chặn TỐC ĐỘ.
 *
 * Cổng quyền `COMMENT_CONTENT` là boolean và không mang hạn mức, nên trước đây
 * không gì chặn một người gõ liên tục. Rule điểm `POST_COMMENTED` nay đã BẬT,
 * nên đây không còn chỉ là chuyện bảng tin bẩn mà là một đường farm điểm.
 *
 * Mười cái một phút rộng hơn hẳn tốc độ người thật gõ, nên người dùng bình
 * thường không bao giờ chạm tới.
 */
const MaxCommentsPerMinute = 10;

/**
 * Trần bình luận theo NGÀY — chặn TỔNG.
 *
 * Trần theo phút một mình không đủ: gõ đều mười cái mỗi phút suốt ngày vẫn ra
 * 14.400 bình luận, và mỗi cái là một dòng thật trên bảng tin của người khác.
 * Trần ngày của rule điểm chỉ chặn phần ĐIỂM, không chặn phần làm bẩn.
 *
 * Hai trăm rộng gấp nhiều lần một người dùng chăm chỉ nhất — nhưng hạ trần spam
 * từ 14.400 xuống 200, tức bảy mươi hai lần.
 */
const MaxCommentsPerDay = 200;

/** Cửa sổ tính từ bình luận ĐẦU TIÊN của đợt, không phải từ 0 giờ. */
const DayWindowSeconds = 86_400;

@Injectable()
export class CreateCommentUseCase implements ICreateCommentUseCase {
  public constructor(
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    // Cần cho nhánh `DHARMA_THREAD`: chủ đề phải có thật, đang hiện, và chưa khoá (F73).
    @Inject(IDharmaRepository) private readonly dharma: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
    @Inject(IRequestThrottle)
    private readonly throttle: IRequestThrottle,
    @Inject(IAppendPointEntryUseCase)
    private readonly points: IAppendPointEntryUseCase,
  ) {}

  public async handle(
    command: ICreateCommentCommand,
  ): Promise<ICreateCommentResult> {
    const capability = await this.entitlements.getCapability(
      command.userId,
      CommentContentCapability,
    );
    if (!capability?.allowed) throw new ForbiddenException();

    // Kiểm trần NGÀY trước trần PHÚT: chạm cả hai mà báo "thử lại sau 57 giây"
    // là nói sai — thật ra còn phải chờ nhiều giờ nữa.
    await this.throttle.assertWithinLimit({
      bucket: 'comment:day',
      key: command.userId,
      limit: MaxCommentsPerDay,
    });
    await this.throttle.assertWithinLimit({
      bucket: 'comment',
      key: command.userId,
      limit: MaxCommentsPerMinute,
    });

    // Giữ lại chủ bài: đằng nào cũng phải nạp bài để kiểm tra nó có thật, và
    // thông báo cần đúng người này. Hỏi lại lần nữa là thừa một vòng.
    let postAuthorId: string | null = null;
    if (command.subjectType === ContentSubjectTypes.POST) {
      const post = await this.posts.findOneBy({
        globalId: command.subjectId,
      });
      if (!post || post.deletedAt)
        throw new PostNotFoundException(command.subjectId);
      postAuthorId = post.authorId ?? null;
    }

    // Chủ đề Diễn đàn Phật Pháp (F73, UC-DHARMA-03).
    //
    // Hai phép kiểm, và phép thứ hai là một yêu cầu đặc tả chứ không phải phòng xa:
    //
    // 1. Chủ đề phải CÓ THẬT và đang hiện. Trước 04/10 nhánh này không tồn tại, nên bình
    //    luận vào một `DHARMA_THREAD` bất kỳ cũng được — kể cả một UUID bịa.
    // 2. **`isLocked`** — UC-DHARMA-03 cho Admin *"khóa bình luận"*. Khoá mà vẫn nhận bình
    //    luận thì cái nút đó không làm gì, và Admin tưởng mình đã dừng được cuộc tranh luận.
    if (command.subjectType === ContentSubjectTypes.DHARMA_THREAD) {
      const thread = await this.dharma.findThreadByGlobalId(command.subjectId);
      if (!thread || !isPubliclyVisibleThread(thread.status))
        throw new DharmaThreadNotFoundException();
      if (!acceptsThreadComments(thread))
        throw new DharmaThreadLockedException();
      postAuthorId = thread.authorId;
    }

    // Trả lời phải trỏ vào một bình luận CÓ THẬT của ĐÚNG chủ thể này. Thiếu
    // phép kiểm thứ hai thì trả lời được xuyên bài: bình luận hiện dưới bài A
    // trong khi cha nó nằm ở bài B.
    let parentAuthorId: string | null = null;
    if (command.parentId) {
      const parent = await this.comments.findByGlobalId(command.parentId);
      if (
        !parent ||
        parent.subjectId !== command.subjectId ||
        parent.subjectType !== command.subjectType
      )
        throw new ContentCommentNotFoundException();
      parentAuthorId = parent.authorId;
    }

    const mediaKeys = (command.mediaKeys ?? []).slice(
      0,
      MaxContentMediaPerItem,
    );

    // Bình luận phải có CHỮ hoặc ẢNH. Database cũng chặn, nhưng chặn ở đây cho ra
    // thông báo đọc được thay vì một lỗi ràng buộc 500.
    if (!command.body.trim() && mediaKeys.length === 0)
      throw new ValidationFailedException([
        'comment.body: phải có nội dung hoặc ít nhất một ảnh',
      ]);

    // Object phải CÓ THẬT trên storage trước khi ghi vào database: một chuỗi key
    // bịa ra sẽ thành bình luận mang ảnh trỏ vào hư không, và điều đó chỉ lộ ra lúc
    // người khác mở bài.
    for (const key of mediaKeys)
      await withStorageValidation('comment.mediaKeys', () =>
        this.storage.confirmCommentMediaUpload(
          command.userId,
          command.subjectType,
          command.subjectId,
          key,
        ),
      );

    const screening = await new CommentScreening(this.adminConfig).screen(
      command.body,
    );

    const created = await this.comments.create({
      globalId: randomUUID(),
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      authorId: command.userId,
      body: command.body.trim(),
      status: screening.status,
      flaggedTerms: screening.flaggedTerms,
      parentId: command.parentId ?? null,
      mediaKeys,
    });

    // Sau khi đã ghi xong. Thông báo hỏng thì bình luận vẫn còn nguyên.
    await notifyComment(this.dispatchNotification, {
      commentId: created.globalId,
      postId: command.subjectId,
      body: created.body,
      status: created.status,
      authorId: command.userId,
      postAuthorId,
      parentAuthorId,
    });

    // Đếm SAU khi ghi xong: đếm trước là trừ mất một suất cho một bình luận bị
    // bộ lọc chặn thẳng, tức phạt người dùng vì một thứ chưa từng đăng được.
    await this.throttle.registerHit({
      bucket: 'comment',
      key: command.userId,
      windowSeconds: 60,
    });
    await this.throttle.registerHit({
      bucket: 'comment:day',
      key: command.userId,
      windowSeconds: DayWindowSeconds,
    });

    await awardCommentPoint(this.points, {
      commentId: created.globalId,
      postId: command.subjectId,
      authorId: command.userId,
      postAuthorId,
      isVisible: created.status === CommentStatuses.VISIBLE,
    });

    return { comment: toDto(created, command.userId) };
  }
}

@Injectable()
export class EditCommentUseCase implements IEditCommentUseCase {
  public constructor(
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IEditCommentCommand,
  ): Promise<IEditCommentResult> {
    const comment = await this.comments.findByGlobalId(command.commentId);
    if (!comment || comment.status === CommentStatuses.REMOVED)
      throw new ContentCommentNotFoundException();
    if (comment.authorId !== command.userId)
      throw new ContentCommentNotFoundException();

    // Cửa sổ sửa: sửa được mãi thì một bình luận hiền lành đã có 20 lượt đồng
    // tình có thể bị đổi thành thứ khác hẳn, và người đã bày tỏ không rút lại
    // được.
    const ageMinutes = (Date.now() - comment.createdAt.getTime()) / (60 * 1000);
    if (ageMinutes > CommentEditWindowMinutes)
      throw new ContentEditWindowClosedException(CommentEditWindowMinutes);

    const screening = await new CommentScreening(this.adminConfig).screen(
      command.body,
    );

    const updated = await this.comments.updateBody({
      globalId: command.commentId,
      body: command.body.trim(),
      status: screening.status,
      flaggedTerms: screening.flaggedTerms,
    });

    return { comment: toDto(updated, command.userId) };
  }
}

@Injectable()
export class RemoveCommentUseCase implements IRemoveCommentUseCase {
  public constructor(
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
    @Inject(IPostRepository) private readonly posts: IPostRepository,
  ) {}

  public async handle(
    command: IRemoveCommentCommand,
  ): Promise<IRemoveCommentResult> {
    const comment = await this.comments.findByGlobalId(command.commentId);
    if (!comment) throw new ContentCommentNotFoundException();

    // Chủ bài gỡ được bình luận trên bài mình: bài đăng là không gian của họ, và
    // bắt họ đợi Admin để xoá một câu xúc phạm là bỏ mặc họ.
    let allowed = comment.authorId === command.userId;
    if (!allowed && comment.subjectType === ContentSubjectTypes.POST) {
      const post = await this.posts.findOneBy({
        globalId: comment.subjectId,
      });
      allowed = post?.authorId === command.userId;
    }
    if (!allowed) throw new ContentCommentNotFoundException();

    const removed = await this.comments.markStatus({
      globalId: command.commentId,
      status: CommentStatuses.REMOVED,
    });

    return { comment: toDto(removed, command.userId) };
  }
}

@Injectable()
export class ListCommentsUseCase implements IListCommentsUseCase {
  public constructor(
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
  ) {}

  public async handle(
    command: IListCommentsCommand,
  ): Promise<IListCommentsResult> {
    const limit = clampChatMessageLimit(command.limit);
    const page = await this.comments.listRoots({
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      limit,
      before: decodeKeysetCursor(command.before),
      viewerId: command.viewerId,
    });

    const oldest = page.items.at(-1);
    return {
      comments: page.items.map((item) => toDto(item, command.viewerId)),
      window: {
        limit,
        oldestCursor: oldest
          ? encodeKeysetCursor({
              createdAt: oldest.createdAt,
              id: oldest.id,
            })
          : null,
        newestCursor: page.items[0]
          ? encodeKeysetCursor({
              createdAt: page.items[0].createdAt,
              id: page.items[0].id,
            })
          : null,
        hasMoreBefore: page.hasMoreBefore,
        hasMoreAfter: false,
      },
    };
  }
}

@Injectable()
export class ListCommentRepliesUseCase implements IListCommentRepliesUseCase {
  public constructor(
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
  ) {}

  public async handle(
    command: IListCommentRepliesCommand,
  ): Promise<IListCommentRepliesResult> {
    const limit = clampChatMessageLimit(command.limit);
    const page = await this.comments.listReplies({
      parentId: command.commentId,
      limit,
      after: decodeKeysetCursor(command.after),
      viewerId: command.viewerId,
    });

    const newest = page.items.at(-1);
    return {
      comments: page.items.map((item) => toDto(item, command.viewerId)),
      window: {
        limit,
        oldestCursor: page.items[0]
          ? encodeKeysetCursor({
              createdAt: page.items[0].createdAt,
              id: page.items[0].id,
            })
          : null,
        newestCursor: newest
          ? encodeKeysetCursor({ createdAt: newest.createdAt, id: newest.id })
          : null,
        hasMoreBefore: false,
        hasMoreAfter: page.hasMoreAfter,
      },
    };
  }
}

/**
 * Xin đường tải ảnh cho bình luận.
 *
 * Khoá theo CHỦ THỂ chứ không theo bình luận, vì bình luận chưa tồn tại lúc này —
 * nó được tạo cùng lúc với ảnh. Kiểm tiền tố vẫn chặt: không ai tải được vào
 * không gian người khác hay chủ thể khác.
 */
@Injectable()
export class RequestCommentMediaUploadUseCase implements IRequestCommentMediaUploadUseCase {
  public constructor(
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestCommentMediaUploadCommand,
  ): Promise<IRequestCommentMediaUploadResult> {
    const capability = await this.entitlements.getCapability(
      command.userId,
      CommentContentCapability,
    );
    if (!capability?.allowed) throw new ForbiddenException();

    return {
      upload: await this.storage.createCommentMediaUpload({
        userId: command.userId,
        subjectType: command.subjectType,
        subjectId: command.subjectId,
        contentType: command.contentType,
        contentLength: command.contentLength,
      }),
    };
  }
}
