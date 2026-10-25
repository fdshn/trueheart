import {
  IUpdateClassifiedStatusCommand,
  IUpdateClassifiedStatusResult,
  IUpdateClassifiedStatusUseCase,
} from '@/application/contracts/post';
import {
  PostHasLiveTransactionException,
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftTransactionRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  ClassifiedOwnerEditableStatuses,
  ClassifiedStatusActions,
  ClassifiedStatusByAction,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Chủ bài Rao vặt tự quản trạng thái: Đang bán → Đã giữ chỗ → Đã bán, hoặc tạm ẩn (PR #46 §8).
 *
 * Hệ thống không quản lý mua bán, nên không có lượt trao nào kéo trạng thái — chủ bài là
 * nguồn duy nhất. `SOLD` là điểm cuối; bài hết hạn gia hạn qua đường gia hạn; bài Admin gỡ
 * không tự mở lại được.
 */
@Injectable()
export class UpdateClassifiedStatusUseCase implements IUpdateClassifiedStatusUseCase {
  public constructor(
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: IUpdateClassifiedStatusCommand,
  ): Promise<IUpdateClassifiedStatusResult> {
    const post = await this.posts.findOneBy({ globalId: command.postId });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();
    if (post.postType !== PostTypes.CLASSIFIED)
      throw new PostInvalidStateException();
    // Bài còn lượt trao kiểu cũ đang chạy (từ trước PR #46): trạng thái do lượt trao quyết.
    // Câu UPDATE cũng kiểm lại điều này, để một lượt trao vừa mở giữa hai bước không lọt.
    if (await this.transactions.hasLiveForPost(post.globalId))
      throw new PostHasLiveTransactionException();

    // Điều kiện "từ trạng thái nào" nằm TRONG câu UPDATE: đọc rồi ghi sẽ cho hai lượt bấm
    // song song (Đã bán và Ẩn) cùng thắng trên một bài vừa bị Admin gỡ ở giữa.
    const updated = await this.posts.updateClassifiedStatus({
      postId: post.globalId,
      to: ClassifiedStatusByAction[command.status as ClassifiedStatusActions],
      from: [...ClassifiedOwnerEditableStatuses],
    });
    if (!updated) throw new PostInvalidStateException();

    return { post: updated };
  }
}
