import {
  IAppendPointEntryUseCase,
  IReconcileMilestoneRewardsCommand,
  IReconcileMilestoneRewardsResult,
  IReconcileMilestoneRewardsUseCase,
  MilestoneRewardReconcileBatchSize,
} from '@/application/contracts/point';
import {
  IPointLedgerRepository,
  IReferralRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Trả lại những phần thưởng MỐC MỘT-LẦN bị treo.
 *
 * **Vì sao ba loại đi cùng một job.** Cả ba đều là cùng một hình dạng: một sự
 * kiện chỉ xảy ra đúng một lần trong đời đã xảy ra thật, nhưng bút toán tương
 * ứng không có. Hai nguyên nhân:
 *
 * - **Tiến trình chết giữa hai bước.** Xác minh SĐT ghi vào `users`, còn thưởng
 *   ghi vào ledger — hai transaction riêng. Chết ở giữa là mất thưởng vĩnh viễn,
 *   vì không có cách nào xác minh lại cùng một số.
 * - **Ngoại lệ chính sách.** Rule bị Admin tắt, hoặc chạm trần ngày. Với mốc
 *   một-lần thì đó là HOÃN chứ không phải mất — xem `RetryablePointRuleCodes`.
 *   Việc người dùng đã làm không được phụ thuộc vào một cái công tắc trong trang
 *   Admin, nên đường gọi thật nuốt ngoại lệ và job này quét lại.
 *
 * Ledger idempotent theo khoá nên chạy lại bao nhiêu lần cũng không thưởng hai
 * lần. Chạy bằng `npm run point:reconcile`.
 */
@Injectable()
export class ReconcileMilestoneRewardsUseCase implements IReconcileMilestoneRewardsUseCase {
  private readonly logger = new Logger(ReconcileMilestoneRewardsUseCase.name);

  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntryUseCase: IAppendPointEntryUseCase,
    @Inject(IReferralRepository)
    private readonly referrals: IReferralRepository,
  ) {}

  public async handle(
    command: IReconcileMilestoneRewardsCommand,
  ): Promise<IReconcileMilestoneRewardsResult> {
    const limit = command.limit ?? MilestoneRewardReconcileBatchSize;

    const repairedRewards = await this.repairRule({
      userIds: await this.ledger.findPhoneVerifiedUsersMissingReward(limit),
      ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
      referenceType: 'PHONE_VERIFICATION',
      label: 'thưởng xác minh SĐT',
    });

    const repairedOnboarding = await this.repairRule({
      userIds: await this.ledger.findOnboardedUsersMissingReward(limit),
      ruleCode: 'ONBOARDING_COMPLETED',
      referenceType: 'ONBOARDING',
      label: 'thưởng hoàn tất onboarding',
    });

    // Giới thiệu KHÔNG đi qua `appendPointEntry` trực tiếp: trigger database đòi
    // `qualified_at` và `reward_entry_id` phải cùng xuất hiện trong một lần ghi,
    // nên phải gọi lại đúng đường nghiệp vụ.
    let repairedReferrals = 0;
    const pendingReferees =
      await this.referrals.findPendingQualifications(limit);
    for (const refereeId of pendingReferees) {
      try {
        const outcome = await this.referrals.qualifyAndAward({ refereeId });
        if (outcome.qualified) repairedReferrals += 1;
      } catch (error) {
        this.logger.error(
          `Không vá được lượt giới thiệu đang treo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { repairedRewards, repairedOnboarding, repairedReferrals };
  }

  /**
   * Vá một rule cho một danh sách người.
   *
   * Từng người một `try`: một người hỏng không được chặn cả lô, vì lần chạy sau
   * vẫn phải vá được những người còn lại.
   */
  private async repairRule(params: {
    userIds: string[];
    ruleCode: string;
    referenceType: string;
    label: string;
  }): Promise<number> {
    let repaired = 0;
    for (const userId of params.userIds) {
      try {
        await this.appendPointEntryUseCase.handle({
          userId,
          ruleCode: params.ruleCode,
          referenceType: params.referenceType,
          referenceId: userId,
          idempotencyKey: `${params.ruleCode}:${userId}`,
          actor: 'SYSTEM',
          source: 'RECONCILIATION',
        });
        repaired += 1;
      } catch (error) {
        this.logger.error(
          `Không vá được ${params.label} cho một tài khoản: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return repaired;
  }
}
