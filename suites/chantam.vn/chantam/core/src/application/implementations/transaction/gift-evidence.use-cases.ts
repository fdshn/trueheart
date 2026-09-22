import {
  IMarkGiftHandedOverCommand,
  IMarkGiftHandedOverResult,
  IMarkGiftHandedOverUseCase,
  IRequestGiftEvidenceUploadCommand,
  IRequestGiftEvidenceUploadResult,
  IRequestGiftEvidenceUploadUseCase,
} from '@/application/contracts/transaction';
import {
  GiftTransactionNotFoundException,
  GiftTransactionNotParticipantException,
} from '@/domain/exceptions';
import { IGiftTransactionRepository } from '@/domain/ports/repository';
import { MaxEvidencePerKind } from '@chantam.vn/chantam.core-lib/consts';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Xin đường tải ảnh bằng chứng cho một lượt trao (CH-2).
 *
 * Presigned PUT như ảnh bài đăng và avatar — máy chủ không nhận file, chỉ cấp
 * quyền ghi vào đúng một khoá. Khoá mang cả `userId` lẫn `transactionId`, nên
 * không ai tải được vào không gian của người khác hay của lượt trao khác.
 *
 * Cả hai bên đều xin được: người tặng chụp lúc trao và lúc hàng hoàn, người
 * nhận chụp lúc nhận.
 */
@Injectable()
export class RequestGiftEvidenceUploadUseCase implements IRequestGiftEvidenceUploadUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestGiftEvidenceUploadCommand,
  ): Promise<IRequestGiftEvidenceUploadResult> {
    const transaction = await this.transactions.findByGlobalId(
      command.transactionId,
    );
    if (!transaction) throw new GiftTransactionNotFoundException();

    const isParticipant =
      transaction.giverId === command.userId ||
      transaction.receiverId === command.userId;
    if (!isParticipant) throw new GiftTransactionNotParticipantException();

    const upload = await this.storage.createTransactionEvidenceUpload({
      userId: command.userId,
      transactionId: command.transactionId,
      contentType: command.contentType,
      contentLength: command.contentLength,
    });

    return { upload };
  }
}

/**
 * Người tặng báo đã trao đồ — `ACCEPTED` → `DELIVERING` (H1).
 *
 * **Không phải riêng cho ship.** Tự đến lấy cũng có lúc trao đồ, và tranh chấp
 * "tôi chưa hề nhận được" vẫn xảy ra khi không có ship.
 *
 * Mốc `handedOverAt` đẩy lùi đồng hồ tự hoàn tất: trước đây đồng hồ đếm từ lúc
 * duyệt, nên ship liên tỉnh 4–5 ngày bị cron đóng trước khi hàng tới nơi.
 *
 * Ảnh là **tuỳ chọn** ở đây. Thiếu ảnh thì lượt trao vẫn đi tiếp, chỉ mất quyền
 * report — chặn ở đây là phạt người tặng vì một việc họ không bắt buộc phải
 * làm, và đẩy lượt trao vào tự-hoàn-tất sau 5 ngày.
 */
@Injectable()
export class MarkGiftHandedOverUseCase implements IMarkGiftHandedOverUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IMarkGiftHandedOverCommand,
  ): Promise<IMarkGiftHandedOverResult> {
    // Xác nhận từng object CÓ THẬT trên storage trước khi ghi vào database:
    // client gửi một chuỗi key bịa ra thì database sẽ mang một bằng chứng trỏ
    // vào hư không, và điều đó chỉ lộ ra lúc có tranh chấp — đúng lúc tệ nhất.
    const keys = (command.evidenceKeys ?? []).slice(0, MaxEvidencePerKind);
    for (const key of keys)
      await this.storage.confirmTransactionEvidenceUpload(
        command.userId,
        command.transactionId,
        key,
      );

    const transaction = await this.transactions.markHandedOver({
      transactionId: command.transactionId,
      giverId: command.userId,
      evidenceKeys: keys,
    });

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
