import {
  IListContentReactionsCommand,
  IListContentReactionsResult,
  IListContentReactionsUseCase,
  IRemoveContentReactionCommand,
  IRemoveContentReactionResult,
  IRemoveContentReactionUseCase,
  ISetContentReactionCommand,
  ISetContentReactionResult,
  ISetContentReactionUseCase,
} from '@/application/contracts/feed';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import { PostNotFoundException } from '@/domain/exceptions';
import {
  IContentReactionRepository,
  IEntitlementRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  ContentSubjectTypes,
  ReactContentCapability,
} from '@chantam.vn/chantam.core-lib/consts';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { notifyFirstReactionOfDay } from './feed-notifications';
import { awardReactionPoint } from './feed-points';

/**
 * Chủ thể phải CÓ THẬT trước khi nhận cảm xúc.
 *
 * Khoá ngoại đa hình không tồn tại (xem migration `CreateFeedInteractions`), nên
 * database không chặn được một cảm xúc trỏ vào bài không có. Phép kiểm này là
 * thứ duy nhất giữ chỗ đó — bỏ nó đi thì bảng cảm xúc sẽ tích rác mà không ai
 * biết, và số đếm trên bài sẽ đếm những lượt trỏ vào hư không.
 */
@Injectable()
class SubjectGuard {
  public constructor(
    @Inject(IPostRepository) private readonly posts: IPostRepository,
  ) {}

  /** Trả chủ bài để bên gọi khỏi nạp lại bài lần nữa chỉ để gửi thông báo. */
  public async assertExists(
    subjectType: ContentSubjectTypes,
    subjectId: string,
  ): Promise<{ authorId: string | null }> {
    if (subjectType !== ContentSubjectTypes.POST) return { authorId: null };

    const post = await this.posts.findOneBy({ globalId: subjectId });
    if (!post || post.deletedAt) throw new PostNotFoundException(subjectId);
    return { authorId: post.authorId ?? null };
  }
}

@Injectable()
export class SetContentReactionUseCase implements ISetContentReactionUseCase {
  public constructor(
    @Inject(IContentReactionRepository)
    private readonly reactions: IContentReactionRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
    @Inject(IAppendPointEntryUseCase)
    private readonly points: IAppendPointEntryUseCase,
  ) {}

  public async handle(
    command: ISetContentReactionCommand,
  ): Promise<ISetContentReactionResult> {
    // Quyền đọc từ chính sách Admin cấu hình, không hard-code theo hạng. VIEWER
    // chỉ đọc là một giá trị trong bảng, không phải một dòng `if` trong code.
    const capability = await this.entitlements.getCapability(
      command.userId,
      ReactContentCapability,
    );
    if (!capability?.allowed) throw new ForbiddenException();

    const { authorId } = await new SubjectGuard(this.posts).assertExists(
      command.subjectType,
      command.subjectId,
    );

    // `created` chỉ đúng khi đây là lượt bày tỏ MỚI. Đổi LIKE sang LOVE không
    // đáng một thông báo — vẫn là người đó, vẫn là sự quan tâm đó.
    const { created } = await this.reactions.setReaction({
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      userId: command.userId,
      kind: command.kind,
    });

    if (command.subjectType === ContentSubjectTypes.POST) {
      await notifyFirstReactionOfDay(this.dispatchNotification, {
        postId: command.subjectId,
        postAuthorId: authorId,
        actorId: command.userId,
        isNewReaction: created,
      });

      await awardReactionPoint(this.points, {
        postId: command.subjectId,
        postAuthorId: authorId,
        actorId: command.userId,
        isNewReaction: created,
      });
    }

    return {
      reaction: await this.reactions.summarize(
        { subjectType: command.subjectType, subjectId: command.subjectId },
        command.userId,
      ),
    };
  }
}

@Injectable()
export class RemoveContentReactionUseCase implements IRemoveContentReactionUseCase {
  public constructor(
    @Inject(IContentReactionRepository)
    private readonly reactions: IContentReactionRepository,
  ) {}

  public async handle(
    command: IRemoveContentReactionCommand,
  ): Promise<IRemoveContentReactionResult> {
    // Không kiểm quyền khi GỠ: người đã bày tỏ rồi thì luôn rút lại được, kể cả
    // khi Admin vừa tắt quyền hoặc hạng của họ vừa tụt. Giữ người ta ở lại với
    // một cảm xúc họ muốn rút là sai.
    await this.reactions.removeReaction({
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      userId: command.userId,
    });

    return {
      reaction: await this.reactions.summarize(
        { subjectType: command.subjectType, subjectId: command.subjectId },
        command.userId,
      ),
    };
  }
}

@Injectable()
export class ListContentReactionsUseCase implements IListContentReactionsUseCase {
  public constructor(
    @Inject(IContentReactionRepository)
    private readonly reactions: IContentReactionRepository,
  ) {}

  public async handle(
    command: IListContentReactionsCommand,
  ): Promise<IListContentReactionsResult> {
    const { skip, take } = toSkipTake(command);
    const subject = {
      subjectType: command.subjectType,
      subjectId: command.subjectId,
    };

    const [summary, page] = await Promise.all([
      this.reactions.summarize(subject, command.viewerId),
      this.reactions.listActors({
        subject,
        kind: command.kind ?? null,
        skip,
        take,
      }),
    ]);

    return {
      summary,
      actors: page.items,
      meta: new PaginationMetaDto(
        Math.floor(skip / take) + 1,
        take,
        page.total,
      ),
    };
  }
}
