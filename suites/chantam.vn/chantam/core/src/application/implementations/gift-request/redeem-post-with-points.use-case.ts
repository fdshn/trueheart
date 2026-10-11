import {
  IRedeemPostWithPointsCommand,
  IRedeemPostWithPointsResult,
  IRedeemPostWithPointsUseCase,
} from '@/application/contracts/gift-request';
import {
  RedemptionInsufficientPointsException,
  RedemptionNotAvailableException,
  RedemptionPriceUnavailableException,
  RedemptionQuoteStaleException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IGiftRequestRepository,
  IPointLedgerRepository,
  IRankRepository,
} from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  normalizePointRedemptionConfig,
  PointRedemptionConfigKey,
  quoteRedemption,
  spendableWithoutDemotion,
} from '@chantam.vn/chantam.core-lib/models';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { RankChangeNotifier } from '../rank/rank-change.notifier';
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
 * Và từ 11/10 một điều kiện thứ tư: **chỉ tiêu được phần vượt ngưỡng giữ hạng**
 * (CHỐT-13). Tới trước đó đây là một lời cảnh báo trong quote mà client tự quyết
 * bỏ qua; CHỐT-13 nói thẳng là nó thay thế đoạn F76 từng huỷ bảo vệ Rank.
 *
 * Và một điều kiện thứ năm: **con số xác nhận phải khớp giá hiện tại** (CHỐT-10
 * mục 2). Báo giá không giữ giá — chủ bài sửa giá trị tham khảo hay Admin đổi tỷ
 * lệ là giá đổi ngay. Lệnh đổi mang theo số điểm người dùng đã thấy, và lệch thì
 * ném chứ không âm thầm trừ theo giá mới.
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
    @Inject(IRankRepository)
    private readonly ranks: IRankRepository,
    private readonly acceptedNotifier: AcceptedRequestNotifier,
    private readonly rankChange: RankChangeNotifier,
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

    // CHỐT-10 mục 2: giá đổi giữa lúc xem trước và lúc bấm thì phải XÁC NHẬN LẠI.
    //
    // Hai thứ làm giá đổi, và cả hai đều ngoài tay người đổi: chủ bài sửa giá trị
    // tham khảo, hoặc Admin đổi tỷ lệ VNĐ/điểm. Tới 10/10 chỗ này tính lại theo
    // giá MỚI rồi trừ luôn — người dùng xác nhận 500 điểm và bị trừ 1.000, không
    // một bước nào hỏi lại.
    //
    // So theo SỐ ĐIỂM, không theo giá trị và tỷ lệ riêng: điểm là con số người
    // dùng thật sự đồng ý trả, và là nơi hai đầu vào kia gộp lại. Giá tăng 1 đồng
    // mà số điểm không đổi thì không có gì người dùng cần xem lại — chặn lúc đó
    // chỉ dạy họ bấm lại lần nữa mà không đọc.
    //
    // Phép kiểm này đứng TRƯỚC phép kiểm đủ điểm: "không đủ điểm" sẽ nhắc một con
    // số người dùng chưa từng thấy, và đẩy họ đi nạp điểm cho một cái giá có thể
    // họ sẽ không đồng ý.
    if (command.confirmedPoints !== quote.points)
      throw new RedemptionQuoteStaleException(
        command.confirmedPoints,
        quote.points,
      );

    // CHỐT-13: chỉ tiêu được phần VƯỢT ngưỡng giữ hạng hiện tại.
    //
    // Phép chặn nằm ở ĐÂY, không phải ở `redemption-quote`. Quote là xem trước và
    // client có thể bỏ qua nó; chỗ cho phép là chỗ trừ điểm. Tới 10/10 ở đây chỉ
    // kiểm `balance < quote.points` — tức tiêu được trọn số dư và tụt hạng — đó là
    // F76, và CHỐT-13 nói thẳng là nó thay thế đoạn đó.
    //
    // Báo `available` chứ không báo `balance` trong ngoại lệ: nói "bạn có 1.000
    // điểm nhưng không đủ 300" là một câu không ai giải thích được.
    const [balance, tiers, rank] = await Promise.all([
      this.ledger.getSummary(command.requesterId),
      this.ranks.listTiers(),
      this.ranks.getOwnSummary(command.requesterId),
    ]);
    const availablePoints = spendableWithoutDemotion(
      balance.balance,
      rank.rank,
      tiers,
    );
    if (availablePoints < quote.points)
      throw new RedemptionInsufficientPointsException(
        quote.points,
        availablePoints,
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
        actorUserId: context.giverId,
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
      // Hoàn điểm cũng là một biến động balance: nếu khoản trừ vừa rồi đã kéo họ
      // tụt hạng thì khoản hoàn phải đưa hạng trở lại.
      await this.rankChange.afterBalanceChange(command.requesterId);
      throw error;
    }

    // Xét lại hạng SAU khi đã chốt xong, và trước khi trả về.
    //
    // Đây là đường thứ tư trong bốn đường làm đổi balance mà `RankChangeNotifier`
    // được dựng ra để gom — và là đường DUY NHẤT từng quên gọi nó. Hệ quả rất cụ
    // thể: người hạng Vàng đổi một món 300 điểm còn 596, dưới cả ngưỡng Bạc, mà
    // `users.rank` vẫn là GOLD — họ giữ quota 20 bài và quyền SOS không còn đủ
    // điều kiện, cho tới khi một biến động điểm KHÔNG liên quan nào đó tình cờ
    // kích hoạt xét lại. Và không có lời cảnh báo nào.
    //
    // Chính tình huống này là lý do §12.4 tồn tại: "đổi một vật phẩm rồi sáng hôm
    // sau phát hiện mình đã xuống Bạc mà không ai nói trước".
    await this.rankChange.afterBalanceChange(command.requesterId);

    await this.acceptedNotifier.announce({
      receiverId: command.requesterId,
      giverId: context.giverId,
      postId: command.postId,
      transactionId,
      // `REDEEMED`, không `MANUAL`: người tặng KHÔNG chọn ai — người xin tự mua.
      // Truyền `MANUAL` ở đây là nói với người vừa trả 500 điểm rằng "người tặng
      // đã chọn bạn", một câu sai.
      trigger: 'REDEEMED',
    });

    return {
      postId: command.postId,
      transactionId,
      pointsSpent: quote.points,
      balanceAfter: spent.balance,
    };
  }
}
