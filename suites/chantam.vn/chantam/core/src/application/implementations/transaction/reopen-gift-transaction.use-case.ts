import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  IReopenGiftTransactionCommand,
  IReopenGiftTransactionResult,
  IReopenGiftTransactionUseCase,
} from '@/application/contracts/transaction';
import {
  IAdminConfigRepository,
  IGiftTransactionRepository,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Quyền dùng chung với quản lý người dùng.
 *
 * Mở lại một lượt trao là đụng vào tồn kho, thứ hạng và lịch sử của hai người
 * thật, nên nó thuộc nhóm thao tác nặng của Admin chứ không phải nhóm kiểm
 * duyệt nội dung (`post.moderate`).
 */
const ReopenPermission = 'admin.manage';

/**
 * Mở lại một lượt trao đã đóng nhầm.
 *
 * Cần có vì hai đường đóng đều có thể sai: tự hoàn tất sau 5 ngày khép một lượt
 * mà hàng chưa tới, hoặc một bên bấm huỷ nhầm. Trước 28/09 không có đường nào
 * sửa — và từ khi tự hoàn tất biết gửi thông báo, người dùng sẽ THẤY lượt trao
 * bị khép rồi hỏi lại, nên càng cần.
 */
@Injectable()
export class ReopenGiftTransactionUseCase implements IReopenGiftTransactionUseCase {
  private readonly logger = new Logger(ReopenGiftTransactionUseCase.name);

  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: IReopenGiftTransactionCommand,
  ): Promise<IReopenGiftTransactionResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        ReopenPermission,
      ))
    )
      throw new ForbiddenException();

    const reason = command.reason?.trim();
    if (!reason)
      throw new ValidationFailedException(['reason không được để trống']);

    const transaction = await this.transactions.reopen({
      transactionId: command.transactionId,
      actorUserId: command.actorUserId,
      reason,
    });

    // Sau khi commit. Hai bên đã nhận thông báo "đã hoàn tất" hoặc "đã huỷ" rồi,
    // nên im lặng mở lại là để họ tin vào một trạng thái không còn đúng.
    for (const userId of [transaction.giverId, transaction.receiverId])
      try {
        await this.dispatchNotification.handle({
          userId,
          type: NotificationTypes.GIFT_TRANSACTION_REOPENED,
          title: 'Lượt trao được mở lại',
          body: 'Quản trị viên đã mở lại lượt trao này. Cuộc trò chuyện cũng mở lại để hai bên tiếp tục.',
          referenceType: 'GIFT_TRANSACTION',
          referenceId: transaction.globalId,
          // KHÔNG khoá theo lượt trao thôi: một lượt có thể bị đóng nhầm rồi mở
          // lại nhiều lần, và lần thứ hai cũng cần báo. Gắn thêm mốc thời gian.
          idempotencyKey: `GIFT_TRANSACTION_REOPENED:${transaction.globalId}:${userId}:${Date.now()}`,
        });
      } catch (error) {
        this.logger.warn(
          `Không báo được lượt trao mở lại cho ${userId}: ${String(error)}`,
        );
      }

    return {
      transaction: {
        transactionId: transaction.globalId,
        postId: transaction.postId,
        giverId: transaction.giverId,
        receiverId: transaction.receiverId,
        quantity: transaction.quantity,
        status: transaction.status,
        requestedAt: transaction.requestedAt,
        acceptedAt: transaction.acceptedAt,
        handedOverAt: transaction.handedOverAt,
        completedAt: transaction.completedAt,
      },
    };
  }
}
