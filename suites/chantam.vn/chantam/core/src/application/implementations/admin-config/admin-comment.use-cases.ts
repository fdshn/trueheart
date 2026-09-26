import {
  IListAdminCommentsCommand,
  IListAdminCommentsResult,
  IListAdminCommentsUseCase,
  IModerateAdminCommentCommand,
  IModerateAdminCommentResult,
  IModerateAdminCommentUseCase,
} from '@/application/contracts/admin-config';
import { ContentCommentNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IContentCommentRepository,
} from '@/domain/ports/repository';
import { CommentStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Dùng chung quyền với kiểm duyệt bài đăng.
 *
 * Gỡ một bình luận và gỡ một bài là cùng một loại quyết định về nội dung; tách
 * thành hai quyền riêng chỉ tạo ra một tổ hợp nữa để Admin cấp sót.
 */
const ModeratePermission = 'post.moderate';

async function assertCanModerate(
  permissions: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  if (!(await permissions.hasPermission(actorUserId, ModeratePermission)))
    throw new ForbiddenException();
}

@Injectable()
export class ListAdminCommentsUseCase implements IListAdminCommentsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
  ) {}

  public async handle(
    command: IListAdminCommentsCommand,
  ): Promise<IListAdminCommentsResult> {
    await assertCanModerate(this.permissions, command.actorUserId);

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.comments.findForAdmin({
      status: command.status,
      skip,
      take,
    });

    return {
      comments: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

@Injectable()
export class ModerateAdminCommentUseCase implements IModerateAdminCommentUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IContentCommentRepository)
    private readonly comments: IContentCommentRepository,
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async handle(
    command: IModerateAdminCommentCommand,
  ): Promise<IModerateAdminCommentResult> {
    await assertCanModerate(this.permissions, command.actorUserId);

    const reason = command.moderation.reason?.trim();
    if (!reason)
      throw new ValidationFailedException(['reason không được để trống']);

    const before = await this.comments.findByGlobalId(command.commentId);
    if (!before || before.status === CommentStatuses.REMOVED)
      throw new ContentCommentNotFoundException();

    // Bấm lại đúng quyết định cũ thì không ghi thêm một dòng audit nói rằng có
    // gì đó vừa đổi — cùng nếp với hậu kiểm bài đăng.
    if (before.status === command.moderation.decision)
      throw new ValidationFailedException([
        `decision: bình luận đã ở trạng thái ${command.moderation.decision}`,
      ]);

    // `markStatus` tự lo số đếm: bình luận rời khỏi công khai thì
    // `comment_count` và `reply_count` đi theo, nếu không con số nói dối.
    await this.comments.markStatus({
      globalId: command.commentId,
      status: command.moderation.decision,
    });

    await this.manager.query(
      `
        INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
        VALUES ($1, 'MODERATE_COMMENT', 'CONTENT_COMMENT', $2, $3::jsonb, $4::jsonb, $5)
      `,
      [
        command.actorUserId,
        command.commentId,
        JSON.stringify({ status: before.status }),
        JSON.stringify({ status: command.moderation.decision }),
        reason,
      ],
    );

    const { items } = await this.comments.findForAdmin({
      status: command.moderation.decision,
      skip: 0,
      take: 200,
    });
    const refreshed = items.find(
      (item) => item.commentId === command.commentId,
    );

    return {
      comment: refreshed ?? {
        commentId: before.globalId,
        subjectType: before.subjectType,
        subjectId: before.subjectId,
        subjectTitle: null,
        authorId: before.authorId,
        authorUsername: before.authorUsername,
        body: before.body,
        status: command.moderation.decision,
        flaggedTerms: null,
        createdAt: before.createdAt,
      },
    };
  }
}
