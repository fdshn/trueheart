import {
  IListPostRequestsCommand,
  IListPostRequestsResult,
  IListPostRequestsUseCase,
} from '@/application/contracts/gift-request';
import { PostNotFoundException } from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ListPostRequestsUseCase implements IListPostRequestsUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
  ) {}

  public async handle(
    command: IListPostRequestsCommand,
  ): Promise<IListPostRequestsResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });

    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);

    // Chỉ tác giả. Trước đây có thêm nhánh admin/moderator đọc từ
    // `currentUserRole`, nhưng controller không bao giờ truyền trường đó nên nó
    // là code chết — và role trong token là ảnh chụp cũ, muốn mở cho admin thì
    // phải đọc lại quyền từ database chứ không tin token.
    if (post.authorId !== command.currentUserId) throw new ForbiddenException();

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.giftRequestRepository.listByPostId(
      command.postId,
      skip,
      take,
    );

    // `total` là tổng thật trong database, không phải số phần tử của trang này.
    return { requests: items, total };
  }
}
