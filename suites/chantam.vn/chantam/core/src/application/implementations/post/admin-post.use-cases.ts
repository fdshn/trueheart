import {
  IGetAdminPostCommand,
  IGetAdminPostResult,
  IGetAdminPostUseCase,
  IListAdminPostsCommand,
  IListAdminPostsResult,
  IListAdminPostsUseCase,
  IModerateAdminPostCommand,
  IModerateAdminPostResult,
  IModerateAdminPostUseCase,
} from '@/application/contracts/post';
import { CloseOpenRequestsService } from '@/application/implementations/gift-request/close-open-requests.service';
import {
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAdminConfigRepository,
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { postExpiryDate } from '@chantam.vn/chantam.core-lib/models';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const ReadPermission = 'post.read';
const ModeratePermission = 'post.moderate';

async function requirePermission(
  repository: IAdminConfigRepository,
  actorUserId: string,
  permission: string,
): Promise<void> {
  if (!(await repository.hasPermission(actorUserId, permission)))
    throw new ForbiddenException();
}

@Injectable()
export class ListAdminPostsUseCase implements IListAdminPostsUseCase {
  public constructor(
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminPostsCommand,
  ): Promise<IListAdminPostsResult> {
    await requirePermission(this.admin, command.actorUserId, ReadPermission);
    const { skip, take } = toSkipTake(command);
    const result = await this.posts.findAdminPosts({
      // KHÔNG mặc định về một trạng thái nào. Từ 26/09 bài lên thẳng nên không
      // còn hàng đợi duyệt; mặc định lọc `PENDING_REVIEW` là cho Admin một màn
      // hình trống rồi để họ tự đoán là do không có bài hay do hỏng.
      status: command.status,
      postType: command.postType,
      categoryId: command.categoryId,
      authorId: command.authorId,
      keyword: command.keyword?.trim() || undefined,
      skip,
      take,
    });
    return {
      posts: result.items,
      meta: new PaginationMetaDto(
        Math.floor(skip / take) + 1,
        take,
        result.total,
      ),
    };
  }
}

@Injectable()
export class GetAdminPostUseCase implements IGetAdminPostUseCase {
  public constructor(
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly media: IPostMediaRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetAdminPostCommand,
  ): Promise<IGetAdminPostResult> {
    await requirePermission(this.admin, command.actorUserId, ReadPermission);
    const post = await this.posts.findAdminByGlobalId(command.postId);
    if (!post) throw new PostNotFoundException(command.postId);
    const baseUrl = this.config.storage.publicBaseUrl.replace(/\/$/, '');
    return {
      post,
      media: (await this.media.listByPostId(command.postId)).map((item) => ({
        id: item.id,
        url: `${baseUrl}/${item.r2Key}`,
        sortOrder: item.sortOrder,
      })),
    };
  }
}

@Injectable()
export class ModerateAdminPostUseCase implements IModerateAdminPostUseCase {
  public constructor(
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    private readonly closeOpenRequests: CloseOpenRequestsService,
  ) {}

  public async handle(
    command: IModerateAdminPostCommand,
  ): Promise<IModerateAdminPostResult> {
    await requirePermission(
      this.admin,
      command.actorUserId,
      ModeratePermission,
    );
    const reason = command.moderation.reason?.trim();
    if (!reason)
      throw new ValidationFailedException(['reason không được để trống']);
    const decision = command.moderation.decision;
    const now = new Date();
    const moderated = await this.posts.moderateByAdmin({
      actorUserId: command.actorUserId,
      postId: command.postId,
      status: decision,
      // Chỉ là hạn DỰ PHÒNG cho bài chưa có hạn; repository giữ nguyên hạn cũ
      // nếu đã có.
      expiresAt:
        decision === GiftPostStatuses.PUBLISHED ? postExpiryDate(now) : null,
      reason,
    });
    if (!moderated) throw new PostInvalidStateException();

    // Gỡ bài mà để hàng đợi nguyên thì người xin không bao giờ nhận được câu
    // trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần của họ. Trả lại
    // bài thì KHÔNG mở lại hàng đợi: những người đó đã được báo là đóng rồi,
    // dựng lại sau lưng họ là mời họ vào một cuộc chờ họ không còn biết tới.
    if (decision === GiftPostStatuses.REJECTED)
      await this.closeOpenRequests.closeFor({
        postIds: [command.postId],
        reason: 'Bài đăng đã bị gỡ,',
      });

    const post = await this.posts.findAdminByGlobalId(command.postId);
    if (!post) throw new PostNotFoundException(command.postId);
    return { post };
  }
}
