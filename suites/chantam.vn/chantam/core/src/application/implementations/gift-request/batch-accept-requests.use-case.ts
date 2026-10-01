import {
  IBatchAcceptRequestsCommand,
  IBatchAcceptRequestsResult,
  IBatchAcceptRequestsUseCase,
} from '@/application/contracts/gift-request';
import { IGiftRequestRepository } from '@/domain/ports/repository';
import { MaxBatchAcceptRequests } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { AcceptedRequestNotifier } from './accepted-request.notifier';

/**
 * Duyệt nhiều người nhận trên một bài trong MỘT lượt (UC-TRANS-05).
 *
 * Toàn bộ phần khó nằm ở `acceptRequestsBatch`: nó là một transaction duy nhất,
 * và chú thích ở port giải thích vì sao một vòng lặp gọi `acceptRequest` KHÔNG
 * thay được nó. Use case này chỉ còn ba việc: chuẩn hoá danh sách, chặn lô quá
 * dài, và báo cho từng người được chọn sau khi đã ghi xong.
 */
@Injectable()
export class BatchAcceptRequestsUseCase implements IBatchAcceptRequestsUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    private readonly acceptedNotifier: AcceptedRequestNotifier,
  ) {}

  public async handle(
    command: IBatchAcceptRequestsCommand,
  ): Promise<IBatchAcceptRequestsResult> {
    const requestIds = command.requestIds ?? [];

    if (requestIds.length === 0)
      throw new ValidationFailedException([
        'requestIds: phải có ít nhất một yêu cầu',
      ]);

    if (requestIds.length > MaxBatchAcceptRequests)
      throw new ValidationFailedException([
        `requestIds: tối đa ${MaxBatchAcceptRequests} yêu cầu mỗi lô`,
      ]);

    // TỪ CHỐI id trùng, không âm thầm khử trùng. Một lô gửi cùng một id hai lần
    // là client đang nhầm, và khử hộ sẽ trả về "đã duyệt 4" cho một lần bấm chọn
    // 5 người — chủ bài đếm lại rồi không hiểu người thứ năm đi đâu.
    const unique = new Set(requestIds);
    if (unique.size !== requestIds.length)
      throw new ValidationFailedException([
        'requestIds: không được trùng nhau',
      ]);

    const outcome = await this.giftRequestRepository.acceptRequestsBatch({
      postId: command.postId,
      giverId: command.userId,
      requestIds,
    });

    // SAU khi lô đã commit. `announce` không bao giờ ném (xem chú thích của nó),
    // nên một người không nhận được thông báo không làm cả lô trông như thất bại
    // — lượt trao và phòng chat của họ đã có thật.
    for (const item of outcome.accepted)
      await this.acceptedNotifier.announce({
        receiverId: item.requesterId,
        giverId: command.userId,
        postId: command.postId,
        transactionId: item.transactionId,
        // Chủ bài tự bấm, y như duyệt từng cái — nên KHÔNG báo lại cho họ.
        trigger: 'MANUAL',
      });

    return {
      postId: command.postId,
      accepted: outcome.accepted,
      remainingQuantity: outcome.remainingQuantity,
      standbyCount: outcome.standbyCount,
    };
  }
}
