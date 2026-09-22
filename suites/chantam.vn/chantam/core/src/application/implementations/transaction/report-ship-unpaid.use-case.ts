import {
  IReportShipUnpaidCommand,
  IReportShipUnpaidResult,
  IReportShipUnpaidUseCase,
} from '@/application/contracts/transaction';
import {
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
  ShipPayers,
  ShipUnpaidPenaltyRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Người gửi báo hàng bị hoàn và người nhận không trả phí ship (CH-2).
 *
 * Hệ thống KHÔNG xử lý tiền ship — đó là COD ngoài hệ thống. Nó chỉ đối chiếu
 * dấu hiệu "người nhận trả ship" đã khai trên bài, rồi ghi một khoản phạt vào
 * ledger.
 *
 * Khoản phạt là một bút toán điểm ÂM với khoá chống trùng theo lượt trao, nên
 * báo hai lần chỉ trừ một lần. Số điểm lấy từ point rule `SHIP_UNPAID_PENALTY`
 * — Admin chỉnh được, không hard-code.
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

    return {
      transactionId: transaction.globalId,
      penalizedUserId: transaction.receiverId,
      penaltyPoints: award.delta,
      balanceAfter: award.balance,
      rawBalanceAfter: award.rawBalance,
      penaltyApplied: award.applied,
    };
  }
}
