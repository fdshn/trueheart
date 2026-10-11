import { IPointLedgerRepository } from '@/domain/ports/repository';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ItemRedemptionRuleCode } from '../gift-request/redeem-post-with-points.use-case';

/**
 * Hoàn điểm khi một lượt trao **đổi-bằng-điểm** bị huỷ (CHỐT-13).
 *
 * ## Lỗ này mất cả điểm lẫn món đồ
 *
 * `RedeemPostWithPointsUseCase` trừ điểm rồi mới duyệt, và nếu **bước duyệt**
 * hỏng thì nó hoàn ngay trong cùng use case. Nhưng lượt trao bị huỷ **sau đó** —
 * người cho đổi ý, người nhận không đến, Admin đóng vì tranh chấp — thì tới 11/10
 * không đường nào hoàn. Người đổi mất điểm và mất cả món đồ.
 *
 * CHỐT-13: *"Nếu giao dịch đổi điểm bị hủy, hoàn **đúng số điểm đã trừ** theo
 * ledger gốc bằng bút toán hoàn riêng, không tính lại theo tỷ lệ hiện tại."*
 *
 * ## Vì sao `reverseEntry` chứ không `appendAdjustment`
 *
 * Ba điều đặc tả đòi, và cả ba là tính chất có sẵn của `reverseEntry`:
 *
 * - **đúng số điểm đã trừ** — nó đọc `delta` của bút toán gốc, không nhận số từ
 *   nơi gọi, nên không có đường nào tính lại theo giá hay tỷ lệ hiện tại;
 * - **bút toán hoàn riêng** — ledger chỉ ghi thêm, có trigger chặn `UPDATE`;
 * - **chỉ một lần** — khoá chống trùng là `REVERSAL:<entryId>`, nên hai đường huỷ
 *   gọi cùng lúc cũng chỉ hoàn một lần.
 *
 * Dựng lại số điểm bằng `appendAdjustment` sẽ phải truyền một con số, và con số
 * đó là chỗ để tính lại theo tỷ lệ hiện tại — đúng thứ đặc tả cấm.
 *
 * ## Gọi SAU khi lượt huỷ đã commit
 *
 * `reverseEntry` mở transaction riêng. Gọi nó trong transaction của lượt huỷ sẽ
 * làm một lỗi khi hoàn cuốn luôn việc huỷ — và người dùng thấy "huỷ không thành"
 * cho một lượt đã đóng thật.
 */
@Injectable()
export class RefundRedemptionOnCloseService {
  private readonly logger = new Logger(RefundRedemptionOnCloseService.name);

  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  /**
   * @param cancelledRequestId Yêu cầu vừa bị huỷ cùng lượt trao; `null` thì không
   *   có gì để hoàn.
   * @returns Số điểm đã hoàn, `0` khi lượt trao không đến từ đổi điểm.
   */
  public async refundFor(params: {
    cancelledRequestId: string | null;
    actorUserId: string;
  }): Promise<number> {
    if (!params.cancelledRequestId) return 0;

    const entryId = await this.ledger.findEntryIdByIdempotencyKey(
      `${ItemRedemptionRuleCode}:${params.cancelledRequestId}`,
    );
    // Không có bút toán trừ nghĩa là lượt trao này đi đường duyệt thường, không
    // qua đổi điểm. Đó là đường PHỔ BIẾN nhất, nên nó không phải lỗi.
    if (entryId === null) return 0;

    try {
      const outcome = await this.ledger.reverseEntry({
        entryId,
        actorUserId: params.actorUserId,
        reason:
          'Hoàn điểm vì lượt trao đổi bằng điểm bị huỷ — đúng số điểm đã trừ ở bút toán gốc',
      });

      if (outcome.status !== 'REVERSED') {
        // `NOT_REVERSIBLE` gộp hai nghĩa: "đã hoàn rồi" và "chính nó là bút toán
        // hoàn". Nghĩa đầu là BÌNH THƯỜNG ở đây — hai đường huỷ đều gọi tới, và
        // khoá `REVERSAL:<entryId>` là chỗ chặn lần thứ hai. Nghĩa sau không xảy
        // ra được vì khoá tra là của một bút toán TRỪ.
        //
        // `NOT_FOUND` thì lạ: vừa tra ra `entryId` ngay trên. Nó chỉ xảy ra ở một
        // ca đua rất hẹp, nên ghi lại để còn soát chứ không coi là bình thường.
        if (outcome.status === 'NOT_FOUND')
          this.logger.warn(
            `Bút toán ${entryId} biến mất giữa lúc tra và lúc hoàn`,
          );
        return 0;
      }

      return Math.abs(outcome.result.delta);
    } catch (error) {
      // Nuốt lỗi: lượt huỷ ĐÃ commit, và ném ở đây sẽ báo cho người dùng rằng
      // huỷ thất bại trong khi nó đã xong. Điểm chưa hoàn là một khoản nợ đọc
      // được — bút toán trừ còn đó và không có `REVERSAL:<id>` đi kèm.
      this.logger.error(
        `Lỗi khi hoàn điểm cho bút toán ${entryId}: ${String(error)}`,
      );
      return 0;
    }
  }
}
