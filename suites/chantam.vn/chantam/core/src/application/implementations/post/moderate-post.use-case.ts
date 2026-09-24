import {
  IModeratePostCommand,
  IModeratePostResult,
  IModeratePostUseCase,
} from '@/application/contracts/post';
import { PostInvalidStateException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { postExpiryDate } from '@chantam.vn/chantam.core-lib/models';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ModeratePostUseCase implements IModeratePostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IModeratePostCommand,
  ): Promise<IModeratePostResult> {
    // Quyền đọc từ RBAC chứ không phải biến môi trường: gỡ quyền trong CMS
    // phải có tác dụng ngay, không cần deploy lại để đổi một danh sách tên.
    if (!(await this.admin.hasPermission(command.userId, 'post.moderate')))
      throw new ForbiddenException();

    const status = command.post.status;
    const publishedAt =
      status === GiftPostStatuses.PUBLISHED ? new Date() : null;
    const post = await this.postRepository.transitionPendingReview(
      command.postId,
      status,
      publishedAt ? postExpiryDate(publishedAt) : null,
    );

    if (!post) throw new PostInvalidStateException();

    return { post };
  }
}
