import {
  IReportShipUnpaidCommand,
  IReportShipUnpaidResult,
  IReportShipUnpaidUseCase,
} from '@/application/contracts/transaction';
import {
  GiftHandoverEvidenceRequiredException,
  GiftTransactionNotFoundException,
  GiftTransactionNotParticipantException,
  ShipPayerNotReceiverException,
} from '@/domain/exceptions';
import {
  IGiftTransactionRepository,
  IPointLedgerRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftEvidenceKinds,
  MaxEvidencePerKind,
  ShipPayers,
  ShipUnpaidPenaltyRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Người gửi báo hàng bị hoàn và người nhận không trả phí ship (CH-2).
 *
 * Hệ thống KHÔNG xử lý tiền ship — đó là COD ngoài hệ thống. Nó chỉ đối chiếu
 * dấu hiệu "người nhận trả ship" đã khai trên bài, rồi ghi một khoản phạt.
 *
 * **Phải có ảnh mới báo được.** Ảnh không chứng minh được nội dung gói hàng hay
 * việc nó thật sự được gửi đi — nhưng nó tạo ra thế bất đối xứng: ai có ảnh lúc
 * trao và ảnh hàng quay về thì câu chuyện nhất quán, ai không có gì thì report
 * không dựa trên gì cả. Muốn trừ điểm người khác thì phải để lại dấu vết trước,
 * từ lúc chưa biết sẽ có tranh chấp.
 *
 * Hai loại ảnh nói hai chuyện khác nhau và cần cả hai:
 *
 * - `HANDOVER` — người tặng CÓ trao. Để lại từ bước `DELIVERING`.
 * - `RETURNED` — nó KHÔNG tới đích. Gửi kèm chính lần báo này.
 *
 * **Báo thì đóng luôn lượt trao** (Q3). Không đóng thì cron tự hoàn tất sẽ đánh
 * dấu `COMPLETED` sau 5 ngày — người nhận vừa bị trừ 50 điểm vì không trả ship,
 * vừa được ghi công đã nhận quà, trong khi món đồ đang nằm ở nhà người tặng.
 *
 * Lượt huỷ tính cho NGƯỜI NHẬN chứ không phải người bấm: họ là bên làm đổ lượt
 * trao, và `closed_by` chảy thẳng vào tiêu chí `FEWEST_CANCELLATIONS` của CH-1.
 */
@Injectable()
export class ReportShipUnpaidUseCase implements IReportShipUnpaidUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IPostRepository)
    private readonly posts: IPostRepository,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IReportShipUnpaidCommand,
  ): Promise<IReportShipUnpaidResult> {
    const transaction = await this.transactions.findByGlobalId(
      command.transactionId,
    );
    if (!transaction) throw new GiftTransactionNotFoundException();

    // CHỈ người gửi báo được: chỉ họ mới thấy hàng bị hoàn về. Cho người nhận
    // báo là cho chính người bị phạt quyết định có bị phạt hay không.
    if (transaction.giverId !== command.userId)
      throw new GiftTransactionNotParticipantException();

    const post = await this.posts.findOneBy({
      globalId: transaction.postId,
    });
    if (!post || post.shipPayer !== ShipPayers.RECEIVER)
      throw new ShipPayerNotReceiverException();

    const returnedKeys = command.evidenceKeys.slice(0, MaxEvidencePerKind);
    const handedOver = await this.transactions.hasEvidence(
      transaction.globalId,
      GiftEvidenceKinds.HANDOVER,
    );
    if (!handedOver || returnedKeys.length === 0)
      throw new GiftHandoverEvidenceRequiredException();

    // Object phải CÓ THẬT trên storage. Một chuỗi key bịa ra sẽ thành bằng
    // chứng trỏ vào hư không, và điều đó chỉ lộ ra lúc có tranh chấp.
    for (const key of returnedKeys)
      await this.storage.confirmTransactionEvidenceUpload(
        command.userId,
        transaction.globalId,
        key,
      );

    const award = await this.ledger.appendByRule({
      userId: transaction.receiverId,
      ruleCode: ShipUnpaidPenaltyRuleCode,
      referenceType: 'GIFT_TRANSACTION',
      referenceId: transaction.globalId,
      // Khoá theo lượt trao, không theo thời điểm: người gửi bấm nhầm hai lần
      // hoặc mạng retry đều chỉ trừ một lần.
      idempotencyKey: `${ShipUnpaidPenaltyRuleCode}:${transaction.globalId}`,
      actor: command.userId,
      source: 'SHIP_REPORT',
      reason: command.reason,
    });

    const closed = await this.transactions.close({
      transactionId: transaction.globalId,
      actorUserId: command.userId,
      status: 'CANCELLED',
      reason: command.reason,
      closedByUserId: transaction.receiverId,
      evidence: {
        kind: GiftEvidenceKinds.RETURNED,
        uploadedBy: command.userId,
        storageKeys: returnedKeys,
      },
    });

    return {
      transactionId: transaction.globalId,
      penalizedUserId: transaction.receiverId,
      penaltyPoints: award.delta,
      balanceAfter: award.balance,
      rawBalanceAfter: award.rawBalance,
      penaltyApplied: award.applied,
      transactionStatus: closed.transaction.status,
    };
  }
}
