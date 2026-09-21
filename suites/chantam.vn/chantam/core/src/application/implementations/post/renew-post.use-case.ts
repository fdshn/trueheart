import {
  IRenewPostCommand,
  IRenewPostResult,
  IRenewPostUseCase,
} from '@/application/contracts/post';
import {
  PostNotFoundException,
  PostNotRenewableException,
  PostQuotaExceededException,
  PostRenewalLimitReachedException,
} from '@/domain/exceptions';
import {
  IEntitlementRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { postExpiryDate } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Gia hạn bài chưa có người nhận: tối đa một lần, cộng thêm 3 tháng, và tính
 * quota như một bài mới (CHỐT-07).
 */
@Injectable()
export class RenewPostUseCase implements IRenewPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
  ) {}

  public async handle(command: IRenewPostCommand): Promise<IRenewPostResult> {
    // Lấy trần quota hiện tại chứ không phải trần lúc đăng: hạng của tác giả
    // có thể đã đổi từ lúc bài lên, và "tính như bài mới" nghĩa là chịu đúng
    // luật đang áp cho một bài mới.
    const capability = await this.entitlementRepository.getCapability(
      command.userId,
      'POST_OFFER',
    );
    const quota = capability?.limit ?? 0;

    const outcome = await this.postRepository.renewPost({
      postId: command.postId,
      authorId: command.userId,
      quota,
      expiresAt: postExpiryDate(new Date()),
    });

    switch (outcome.status) {
      case 'RENEWED':
        return { post: outcome.post };
      case 'LIMIT_REACHED':
        throw new PostRenewalLimitReachedException();
      case 'QUOTA_EXCEEDED':
        throw new PostQuotaExceededException(quota);
      case 'NOT_RENEWABLE':
        throw new PostNotRenewableException();
      default:
        // Gộp "không có bài" với "bài của người khác": trả lời khác nhau là
        // cho người lạ dò được id nào có thật.
        throw new PostNotFoundException(command.postId);
    }
  }
}
