import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { IRankChange, IRankRepository } from '@/domain/ports/repository';
import {
  BusinessTimeZone,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Cắt ngày theo giờ Việt Nam.
 *
 * Cắt theo UTC thì "một lần mỗi ngày" rơi vào 7 giờ sáng, và người dùng nhận hai
 * lời nhắc trong cùng một buổi sáng.
 */
function vietnamDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BusinessTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Xét lại hạng sau một biến động điểm, rồi báo cho người dùng nếu cần.
 *
 * **Vì sao phải có từ 2026-09-24.** Hạng nay do balance quyết, nên tiêu điểm làm
 * tụt hạng. Không báo thì người dùng đổi một vật phẩm rồi sáng hôm sau phát hiện
 * mình đã xuống Bạc mà không ai nói trước — và mất luôn quota bài, quyền SOS.
 *
 * Gom vào một chỗ vì có bốn đường làm đổi balance: cộng theo rule, hoàn bút
 * toán, khoản trừ số truyền vào, và đổi vật phẩm. Bốn chỗ tự báo là bốn chỗ có
 * thể quên.
 */
@Injectable()
export class RankChangeNotifier {
  private readonly logger = new Logger(RankChangeNotifier.name);

  public constructor(
    @Inject(IRankRepository)
    private readonly ranks: IRankRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  /**
   * Gọi SAU khi bút toán đã commit.
   *
   * Không bao giờ ném: một thông báo không gửi được không được làm hỏng việc
   * cộng hay trừ điểm — sổ đã ghi rồi, và ném ở đây chỉ khiến chỗ gọi tưởng bút
   * toán thất bại.
   */
  public async afterBalanceChange(userId: string): Promise<IRankChange | null> {
    let change: IRankChange | null = null;
    try {
      change = await this.ranks.reconcileNormalRank(userId);
    } catch (error) {
      this.logger.error(
        `Không xét lại được hạng cho ${userId}: ${String(error)}`,
      );
      return null;
    }

    try {
      if (change?.demoted) await this.notifyDemoted(userId, change);
      // Lên hạng: báo, và KHÔNG chạy nhánh cảnh báo. Người vừa vượt ngưỡng lên
      // trên thì không thể đang dưới mốc cảnh báo của bậc cũ, và nghe "bạn sắp
      // tụt hạng" ngay sau khi lên hạng là vô nghĩa.
      else if (change) await this.notifyPromoted(userId, change);
      else await this.notifyWarningIfNeeded(userId);
    } catch (error) {
      this.logger.warn(
        `Không gửi được thông báo hạng cho ${userId}: ${String(error)}`,
      );
    }

    return change;
  }

  private async notifyDemoted(
    userId: string,
    change: IRankChange,
  ): Promise<void> {
    await this.dispatchNotification.handle({
      userId,
      type: NotificationTypes.RANK_DEMOTED,
      title: 'Thứ hạng của bạn đã thay đổi',
      body: `Bạn đã chuyển từ hạng ${change.fromRank} xuống ${change.toRank} vì số điểm hiện tại đã giảm dưới ngưỡng.`,
      referenceType: 'USER_RANK',
      referenceId: userId,
      // Khoá theo CẶP bậc: tụt Vàng→Bạc rồi sau đó Bạc→Thành viên là hai sự
      // kiện khác nhau, và người dùng cần biết cả hai.
      idempotencyKey: `RANK_DEMOTED:${userId}:${change.fromRank}:${change.toRank}:${vietnamDateKey(new Date())}`,
      variables: {
        fromRank: change.fromRank,
        toRank: change.toRank,
      },
    });
  }

  private async notifyPromoted(
    userId: string,
    change: IRankChange,
  ): Promise<void> {
    await this.dispatchNotification.handle({
      userId,
      type: NotificationTypes.RANK_PROMOTED,
      title: 'Bạn đã lên hạng',
      body: `Bạn đã lên hạng ${change.toRank} từ ${change.fromRank}. Quyền lợi của bậc mới đã có hiệu lực ngay.`,
      referenceType: 'USER_RANK',
      referenceId: userId,
      // Cùng khuôn khoá với tụt hạng: theo CẶP bậc và theo ngày. Lên Bạc rồi lên
      // Vàng là hai sự kiện khác nhau; còn ai dao động quanh đúng một ngưỡng thì
      // mốc ngày chặn lại ở một lần mỗi ngày cho mỗi cặp.
      idempotencyKey: `RANK_PROMOTED:${userId}:${change.fromRank}:${change.toRank}:${vietnamDateKey(new Date())}`,
      variables: {
        fromRank: change.fromRank,
        toRank: change.toRank,
      },
    });
  }

  private async notifyWarningIfNeeded(userId: string): Promise<void> {
    const summary = await this.ranks.getOwnSummary(userId);
    const threshold = summary.currentTier.warningPoints;

    // `0` nghĩa là bậc này không có mốc cảnh báo (Viewer). So sánh trần cũng ra
    // false, nhưng chặn tường minh để ý đồ đọc được.
    if (threshold <= 0) return;
    // `rankPoints`, KHÔNG `balancePoints`: phải so đúng con số mà chỗ quyết hạng
    // so. Đọc `balancePoints` là đúng với cấu hình mặc định và sai ngay khi Admin
    // chuyển `rank.points_source` sang LIFETIME — cảnh báo tính theo một con số
    // còn tụt hạng tính theo con số khác.
    if (summary.rankPoints >= threshold) return;

    await this.dispatchNotification.handle({
      userId,
      type: NotificationTypes.RANK_DEMOTION_WARNING,
      title: 'Bạn sắp tụt hạng',
      body: `Bạn còn ${summary.rankPoints} điểm, gần mốc ${summary.currentTier.thresholdPoints} điểm để giữ hạng ${summary.rank}. Tiêu thêm có thể làm bạn tụt hạng.`,
      referenceType: 'USER_RANK',
      referenceId: userId,
      // MỘT lần mỗi ngày cho mỗi bậc. Không có mốc ngày thì mỗi lượt thả cảm
      // xúc kiếm 1 điểm rồi tiêu đi cũng đẻ một lời nhắc, và người dùng tắt
      // thông báo — từ đó mất luôn thông báo về lượt xin nhận.
      idempotencyKey: `RANK_DEMOTION_WARNING:${userId}:${summary.rank}:${vietnamDateKey(new Date())}`,
      variables: {
        rank: summary.rank,
        balancePoints: String(summary.rankPoints),
        thresholdPoints: String(summary.currentTier.thresholdPoints),
      },
    });
  }
}
