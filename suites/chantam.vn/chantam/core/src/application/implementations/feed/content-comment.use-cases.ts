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
} from '@/application/contracts/feed';
import {
  ContentBlockedTermsException,
  ContentCommentNotFoundException,
  ContentEditWindowClosedException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IContentComment,
  IContentCommentRepository,
  IEntitlementRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  CommentContentCapability,
  CommentEditWindowMinutes,
  CommentStatuses,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IContentCommentDto } from '@chantam.vn/chantam.core-lib/dto';
import {
  clampChatMessageLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
  ModerationTermsConfigKey,
  ModerationVerdicts,
  normalizeBlockedTerms,
  screenText,
} from '@chantam.vn/chantam.core-lib/models';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

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

@Injectable()
export class CreateCommentUseCase implements ICreateCommentUseCase {
  public constructor(
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateCommentCommand,
  ): Promise<ICreateCommentResult> {
    const capability = await this.entitlements.getCapability(
      command.userId,
      CommentContentCapability,
    );
    if (!capability?.allowed) throw new ForbiddenException();

    if (command.subjectType === ContentSubjectTypes.POST) {
      const post = await this.posts.findOneBy({
        globalId: command.subjectId,
      });
      if (!post || post.deletedAt)
        throw new PostNotFoundException(command.subjectId);
    }

    // Trả lời phải trỏ vào một bình luận CÓ THẬT của ĐÚNG chủ thể này. Thiếu
    // phép kiểm thứ hai thì trả lời được xuyên bài: bình luận hiện dưới bài A
    // trong khi cha nó nằm ở bài B.
    if (command.parentId) {
      const parent = await this.comments.findByGlobalId(command.parentId);
      if (
        !parent ||
        parent.subjectId !== command.subjectId ||
        parent.subjectType !== command.subjectType
      )
        throw new ContentCommentNotFoundException();
    }

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
