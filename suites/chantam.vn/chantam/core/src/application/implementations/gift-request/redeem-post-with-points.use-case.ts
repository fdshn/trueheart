import {
  IRedeemPostWithPointsCommand,
  IRedeemPostWithPointsResult,
  IRedeemPostWithPointsUseCase,
} from '@/application/contracts/gift-request';
import {
  RedemptionInsufficientPointsException,
  RedemptionNotAvailableException,
  RedemptionPriceUnavailableException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IGiftRequestRepository,
  IPointLedgerRepository,
} from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  normalizePointRedemptionConfig,
  PointRedemptionConfigKey,
  quoteRedemption,
} from '@chantam.vn/chantam.core-lib/models';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { AcceptedRequestNotifier } from './accepted-request.notifier';

/** Mã phân loại bút toán trừ điểm khi đổi vật phẩm (F77). */
export const ItemRedemptionRuleCode = 'ITEM_REDEMPTION';

/**
 * Dùng điểm đổi thẳng vật phẩm, chốt ngay không chờ hết đồng hồ (F75).
 *
 * Ba điều kiện, và cả ba đều cố ý:
 *
 * - **Đồng hồ phải đang chạy.** Đổi điểm là một nhánh CỦA việc chọn người nhận,
 *   không phải một lối đi vòng. Bài chưa ai xin thì chưa có gì để tranh, và bài
 *   đã hết đồng hồ thì người nhận đã được chốt.
 * - **Người đổi phải đã xin.** F75 nói "người xin có hai đường: chờ, hoặc dùng
 *   điểm". Cho người ngoài nhảy vào đổi là biến hàng đợi thành trang trí.
 * - **Bài phải khai giá trị tham khảo.** Không khai giá KHÔNG có nghĩa là cho
 *   không — nó nghĩa là chưa quy ra điểm được.
 *
 * Trừ điểm rồi mới duyệt, và nếu duyệt hỏng thì HOÀN lại ngay: xem ghi chú ở
 * `handle`.
 */
@Injectable()
export class RedeemPostWithPointsUseCase implements IRedeemPostWithPointsUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly requests: IGiftRequestRepository,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    private readonly acceptedNotifier: AcceptedRequestNotifier,
  ) {}

  public async handle(
    command: IRedeemPostWithPointsCommand,
  ): Promise<IRedeemPostWithPointsResult> {
    const context = await this.requests.findRedemptionContext({
      postId: command.postId,
      requesterId: command.requesterId,
    });

    // Chưa xin, hoặc bài không tồn tại — cùng một câu trả lời. Phân biệt hai cái
    // là để lộ bài nào tồn tại cho người chưa từng thấy nó.
    if (!context) throw new RedemptionNotAvailableException();

    if (context.postStatus !== GiftPostStatuses.PUBLISHED)
      throw new RedemptionNotAvailableException();

    // Đồng hồ chưa mở, hoặc đã hết. Đọc mốc chứ không tin trạng thái bài: job tự
    // chọn chạy mỗi giờ, nên có một khoảng bài đã hết hạn mà chưa ai chốt.
    const deadline = context.selectionDeadline;
    if (!deadline || deadline.getTime() <= Date.now())
      throw new RedemptionNotAvailableException();

    const rate = normalizePointRedemptionConfig(
      await this.adminConfig.getConfigValue(PointRedemptionConfigKey),
    );
    const quote = quoteRedemption(context.estimatedValueVnd, rate);
    if (!quote.redeemable) throw new RedemptionPriceUnavailableException();

    const balance = await this.ledger.getSummary(command.requesterId);
    if (balance.balance < quote.points)
      throw new RedemptionInsufficientPointsException(
        quote.points,
        balance.balance,
      );

    // Trừ điểm TRƯỚC khi duyệt, và hoàn lại nếu duyệt hỏng.
    //
    // Thứ tự này là lựa chọn có chủ ý. Duyệt trước rồi trừ thì một lỗi ở bước trừ
    // để lại người nhận đã được chốt mà chưa trả gì — món quà đi mất và không có
    // đường đòi. Trừ trước thì lỗi tệ nhất là điểm bị giữ tạm, và khoản hoàn ngay
    // dưới trả lại.
    //
    // Hai bước không nằm trong một transaction vì `appendAdjustment` và
    // `acceptRequest` mỗi cái tự mở một transaction, và gộp chúng đòi một đường
    // ghi sổ mới. Khoá chống trùng cộng khoản hoàn là cái giá rẻ hơn.
    const spent = await this.ledger.appendAdjustment({
      userId: command.requesterId,
      ruleCode: ItemRedemptionRuleCode,
      delta: -quote.points,
      referenceType: 'POST',
      referenceId: command.postId,
      idempotencyKey: `${ItemRedemptionRuleCode}:${context.requestGlobalId}`,
      actor: command.requesterId,
      source: 'REDEMPTION',
      reason: `Đổi vật phẩm bằng điểm (${quote.points} điểm)`,
    });

    let transactionId: string;
    try {
      const accepted = await this.requests.acceptRequest({
        requestId: context.requestGlobalId,
        postId: command.postId,
        giverId: context.giverId,
        transactionId: makeGlobalId(
          `/transactions/${command.postId}/${command.requesterId}`,
        ),
      });
      transactionId = accepted.transactionId;
    } catch (error) {
      // Hết hàng, hoặc ai đó vừa được duyệt xen vào. Trả điểm lại ngay bằng một
      // bút toán NGƯỢC — sổ append-only nên không xoá được khoản đã trừ, và để
      // nó nằm đó là lấy điểm của người dùng mà không đưa gì.
      await this.ledger.appendAdjustment({
        userId: command.requesterId,
        ruleCode: ItemRedemptionRuleCode,
        delta: quote.points,
        referenceType: 'POST',
        referenceId: command.postId,
        idempotencyKey: `${ItemRedemptionRuleCode}:REFUND:${context.requestGlobalId}`,
        actor: 'SYSTEM',
        source: 'REDEMPTION_REFUND',
        reason: 'Hoàn điểm vì không chốt được vật phẩm',
      });
      throw error;
    }

    await this.acceptedNotifier.announce({
      receiverId: command.requesterId,
      postId: command.postId,
      transactionId,
      automatic: false,
    });

    return {
      postId: command.postId,
      transactionId,
      pointsSpent: quote.points,
      balanceAfter: spent.balance,
    };
  }
}
