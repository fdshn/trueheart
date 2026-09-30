import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  IQualifyReferralCommand,
  IQualifyReferralUseCase,
} from '@/application/contracts/referral';
import { IReferralRepository } from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';
import { RankChangeNotifier } from '../rank/rank-change.notifier';

@Injectable()
export class QualifyReferralUseCase implements IQualifyReferralUseCase {
  public constructor(
    @Inject(IReferralRepository)
    private readonly referrals: IReferralRepository,
    private readonly rankChange: RankChangeNotifier,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(command: IQualifyReferralCommand): Promise<void> {
    const result = await this.referrals.qualifyAndAward(command);
    if (!result.qualified || !result.referrerId) return;

    // Nói với NGƯỜI MỜI rằng họ vừa được thưởng.
    //
    // Trước 30/09 cả đường giới thiệu im lặng với họ: mời xong là hết, không biết
    // người kia đã qua onboarding, cũng không biết mình vừa có 56 điểm. Mà đó chính
    // là lúc cần nói — nó là thứ khiến họ mời tiếp.
    //
    // Gửi TRƯỚC `afterBalanceChange`: hai thông báo khác nhau và thứ tự đọc nên
    // theo thứ tự nhân quả — "bạn được thưởng" rồi mới "bạn lên hạng".
    //
    // Khoá chống trùng theo NGƯỜI ĐƯỢC GIỚI THIỆU, đúng khoá mà bút toán dùng: một
    // lượt giới thiệu chỉ đủ điều kiện một lần, nên `point:reconcile` gọi lại không
    // rung điện thoại lần hai.
    await this.dispatchNotification.handle({
      userId: result.referrerId,
      type: NotificationTypes.REFERRAL_QUALIFIED,
      title: 'Bạn vừa được thưởng điểm giới thiệu',
      body:
        result.awardedPoints === undefined
          ? 'Một người bạn giới thiệu đã hoàn tất onboarding.'
          : `Một người bạn giới thiệu đã hoàn tất onboarding. Bạn được +${result.awardedPoints} điểm.`,
      referenceType: 'REFERRAL',
      referenceId: command.refereeId,
      idempotencyKey: `REFERRAL_QUALIFIED:${command.refereeId}`,
      variables: {
        awardedPoints: String(result.awardedPoints ?? ''),
      },
    });

    // Qua `RankChangeNotifier`, không gọi `reconcileNormalRank` trần: 56 điểm
    // giới thiệu có thể đẩy người ta lên hạng, và họ nên được biết.
    await this.rankChange.afterBalanceChange(result.referrerId);
  }
}
