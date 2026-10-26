import {
  IBatchAcceptRequestsCommand,
  IBatchAcceptRequestsResult,
  IBatchAcceptRequestsUseCase,
} from '@/application/contracts/gift-request';
import {
  PostNotFoundException,
  SelectRequesterNotAllowedException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IEntitlementRepository,
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { MaxBatchAcceptRequests } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { assertClassifiedTransactionsAllowed } from '../shared/classified-guard';
import { AcceptedRequestNotifier } from './accepted-request.notifier';

/** Cùng mã capability mà `AcceptGiftRequestUseCase` đọc — xem docblock ở đó. */
const SelectRequesterCapability = 'SELECT_REQUESTER';

/**
 * Duyệt nhiều người nhận trên một bài trong MỘT lượt (UC-TRANS-05).
 *
 * Toàn bộ phần khó nằm ở `acceptRequestsBatch`: nó là một transaction duy nhất,
 * và chú thích ở port giải thích vì sao một vòng lặp gọi `acceptRequest` KHÔNG
 * thay được nó. Use case này còn bốn việc: kiểm quyền chọn tay, chuẩn hoá danh
 * sách, chặn lô quá dài, và báo cho từng người được chọn sau khi đã ghi xong.
 *
 * Quyền chọn tay thêm 11/10 (CHỐT-10), và phải có ở **cả hai** đường duyệt tay.
 * Chặn `accept` mà bỏ `batch-accept` thì cổng thành vô nghĩa: chọn một người qua
 * một lô một phần tử cho ra đúng kết quả mà cổng vừa từ chối.
 */
@Injectable()
export class BatchAcceptRequestsUseCase implements IBatchAcceptRequestsUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
    private readonly acceptedNotifier: AcceptedRequestNotifier,
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Optional()
    @Inject(IAdminConfigRepository)
    private readonly adminConfig?: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IBatchAcceptRequestsCommand,
  ): Promise<IBatchAcceptRequestsResult> {
    // Kiểm quyền TRƯỚC mọi phép kiểm hình dữ liệu. Thứ tự này có nghĩa: người không
    // có quyền chọn tay thì nhận cùng một câu trả lời dù họ gửi lô hợp lệ hay lô
    // rỗng, nên họ không dò được gì từ thông điệp lỗi.
    const selectCapability = await this.entitlementRepository.getCapability(
      command.userId,
      SelectRequesterCapability,
    );
    if (!selectCapability?.allowed) {
      throw new SelectRequesterNotAllowedException();
    }

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

    // Cùng luật với duyệt từng cái: Rao vặt không tạo lượt trao mới (PR #46 §8). Repository
    // còn chặn lần nữa dưới khoá hàng; ở đây để trả đúng mã lỗi trước khi mở transaction.
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    await assertClassifiedTransactionsAllowed(post, this.adminConfig);

    const outcome = await this.giftRequestRepository.acceptRequestsBatch({
      postId: command.postId,
      actorUserId: command.userId,
      requestIds,
      allowClassified: true,
    });

    // SAU khi lô đã commit. `announce` không bao giờ ném (xem chú thích của nó),
    // nên một người không nhận được thông báo không làm cả lô trông như thất bại
    // — lượt trao và phòng chat của họ đã có thật.
    for (const item of outcome.accepted)
      await this.acceptedNotifier.announce({
        // Vai lấy từ KẾT QUẢ của lô, không đoán lại từ người bấm: với bài Muốn
        // Nhận, người bấm là tác giả — tức người NHẬN, không phải người cho.
        receiverId: item.receiverId,
        giverId: item.giverId,
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
