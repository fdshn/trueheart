import {
  IGetRedemptionQuoteCommand,
  IGetRedemptionQuoteResult,
  IGetRedemptionQuoteUseCase,
} from '@/application/contracts/gift-request';
import {
  IAdminConfigRepository,
  IGiftRequestRepository,
  IPointLedgerRepository,
  IRankRepository,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  normalizePointRedemptionConfig,
  PointRedemptionConfigKey,
  quoteRedemption,
  rankForPoints,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Xem trước một lượt đổi vật phẩm bằng điểm.
 *
 * **Không ném khi không đổi được.** Đây là màn hình xem trước, và một lỗi 4xx ở
 * đây bắt client phải đọc mã lỗi để dựng giao diện — trong khi nó chỉ cần biết
 * "hiện nút hay không, và nếu không thì vì sao". Mọi nhánh đều trả 200 kèm lý do;
 * `POST /posts/:id/redeem` mới là chỗ ném lỗi thật.
 *
 * **Đọc cùng một bối cảnh mà đường bấm thật đọc** (`findRedemptionContext`), và
 * tính giá bằng cùng một hàm thuần (`quoteRedemption`). Hai đường tính giá riêng
 * là hai đường sẽ trôi khỏi nhau, và người dùng thấy một giá rồi bị trừ một giá
 * khác.
 */
@Injectable()
export class GetRedemptionQuoteUseCase implements IGetRedemptionQuoteUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly requests: IGiftRequestRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IRankRepository)
    private readonly ranks: IRankRepository,
  ) {}

  public async handle(
    command: IGetRedemptionQuoteCommand,
  ): Promise<IGetRedemptionQuoteResult> {
    const [context, rawConfig, rank] = await Promise.all([
      this.requests.findRedemptionContext({
        postId: command.postId,
        requesterId: command.userId,
      }),
      this.adminConfig.getConfigValue(PointRedemptionConfigKey),
      this.ranks.getOwnSummary(command.userId),
    ]);
    const config = normalizePointRedemptionConfig(rawConfig);

    const base = {
      vndPerPoint: config.vndPerPoint,
      balancePoints: rank.balancePoints,
      rankAfter: rank.rank,
      wouldDemote: false,
    };

    // Bài không tồn tại, chưa ai xin, đồng hồ đã hết, hay người gọi chưa gửi yêu
    // cầu — tất cả ra CÙNG một lý do, đúng như đường bấm thật. Phân biệt chúng là
    // để lộ bài nào tồn tại cho người chưa từng thấy nó.
    const clockRunning =
      context !== null &&
      context.selectionDeadline !== null &&
      context.selectionDeadline.getTime() > Date.now();
    if (!clockRunning)
      return {
        quote: {
          ...base,
          points: 0,
          estimatedValueVnd: context?.estimatedValueVnd ?? null,
          redeemable: false,
          unavailableReason: 'NOT_AVAILABLE',
          missingPoints: 0,
        },
      };

    const priced = quoteRedemption(context.estimatedValueVnd, config);
    if (!priced.redeemable)
      return {
        quote: {
          ...base,
          points: 0,
          estimatedValueVnd: context.estimatedValueVnd,
          redeemable: false,
          unavailableReason: 'NO_ESTIMATED_VALUE',
          missingPoints: 0,
        },
      };

    const balance = await this.ledger.getSummary(command.userId);
    const missingPoints = Math.max(0, priced.points - balance.balance);

    // Hạng đọc `balance`, và tiêu điểm giảm đúng con số đó — nên luôn phải tính
    // hạng sau khi trả điểm. Trước 02/10 ở đây có một nhánh bỏ qua bảng bậc khi
    // `rank.points_source` là LIFETIME; cái núm đó đã bị gỡ, nên nhánh cũng đi theo.
    //
    // `tiers` rỗng vẫn phải phòng: bảng bậc có thể chưa seed ở môi trường mới, và
    // lúc đó "không biết hạng sau" phải trả về hạng hiện tại chứ không phải VIEWER.
    const tiers = await this.ranks.listTiers();
    const rankAfter =
      tiers.length === 0
        ? rank.rank
        : ((rankForPoints(
            Math.max(0, balance.balance - priced.points),
            tiers,
          ) ?? UserRanks.VIEWER) as UserRanks);

    return {
      quote: {
        points: priced.points,
        estimatedValueVnd: context.estimatedValueVnd,
        vndPerPoint: config.vndPerPoint,
        redeemable: true,
        unavailableReason: missingPoints > 0 ? 'INSUFFICIENT_POINTS' : null,
        balancePoints: balance.balance,
        missingPoints,
        // So theo NGƯỠNG của hai bậc, không so tên: bậc thang là cấu hình động và
        // thứ tự tên không nói được bậc nào cao hơn.
        wouldDemote: rankAfter !== rank.rank,
        rankAfter,
      },
    };
  }
}
