import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  IDeletePostCommand,
  IDeletePostResult,
  IDeletePostUseCase,
} from '@/application/contracts/post';
import { CloseOpenRequestsService } from '@/application/implementations/gift-request/close-open-requests.service';
import {
  PostHasLiveTransactionException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftTransactionRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  LiveTransactionGiftPostStatuses,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DeletePostUseCase implements IDeletePostUseCase {
  private readonly logger = new Logger(DeletePostUseCase.name);

  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotificationUseCase: IDispatchNotificationUseCase,
    private readonly closeOpenRequests: CloseOpenRequestsService,
  ) {}

  public async handle(command: IDeletePostCommand): Promise<IDeletePostResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    // Chặn TRƯỚC khi ghi gì: xoá tài khoản cũng chặn y hệt bằng
    // `countOpenForUser`, và hậu kiểm của Admin cũng từ chối đúng hai trạng
    // thái này. Chỉ riêng đường gỡ bài của tác giả trước đây không canh gì —
    // mà đó lại là nút dễ bấm nhất.
    if (
      LiveTransactionGiftPostStatuses.includes(post.status as GiftPostStatuses)
    )
      throw new PostHasLiveTransactionException();

    await this.postRepository.update(
      { globalId: command.postId },
      { deletedAt: new Date(), status: GiftPostStatuses.CANCELLED },
    );

    // Đóng nốt những yêu cầu còn treo. Không đóng thì người xin không bao giờ
    // nhận được câu trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần
    // "yêu cầu đang mở" của họ — tức gỡ một bài là khoá bớt chỗ của người khác.
    const closed = await this.transactions.closeOpenRequestsForPost({
      postId: command.postId,
      closedBy: command.userId,
      reason: 'Người đăng đã gỡ bài',
    });

    for (const request of closed) await this.notify(request, post.title);

    // `closeOpenRequestsForPost` ở trên chỉ đụng `gift_transactions`. Yêu cầu
    // đang ở PENDING/STANDBY chưa có lượt trao nào nên không rơi vào đó — và
    // trước 28/09 không gì đóng chúng lại, khiến mỗi bài gỡ đi là khoá bớt
    // suất trong trần của những người đã xin.
    await this.closeOpenRequests.closeFor({
      postIds: [command.postId],
      reason: 'Người đăng đã gỡ bài,',
    });

    return {};
  }

  /**
   * Báo cho người xin, và KHÔNG để lỗi đẩy làm hỏng việc gỡ bài.
   *
   * Bài đã gỡ xong rồi; ném ở đây chỉ khiến client tưởng thao tác thất bại và
   * bấm lại — lần hai sẽ nhận 404 vì bài không còn.
   */
  private async notify(
    request: { transactionId: string; receiverId: string },
    postTitle: string,
  ): Promise<void> {
    try {
      await this.dispatchNotificationUseCase.handle({
        userId: request.receiverId,
        type: NotificationTypes.GIFT_TRANSACTION_CLOSED,
        title: 'Bài đăng đã được gỡ',
        body: `Người đăng đã gỡ bài "${postTitle}", nên yêu cầu xin nhận của bạn được đóng lại.`,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: request.transactionId,
        idempotencyKey: `POST_DELETED:${request.transactionId}`,
      });
    } catch (error) {
      this.logger.warn(
        `Không báo được cho người xin ${request.receiverId}: ${String(error)}`,
      );
    }
  }
}
