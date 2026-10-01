import {
  IListReferralReviewCommand,
  IListReferralReviewResult,
  IListReferralReviewUseCase,
} from '@/application/contracts/referral';
import {
  IAdminConfigRepository,
  IReferralRepository,
} from '@/domain/ports/repository';
import {
  normalizeReferralAbuseConfig,
  referralAbuseReviewEnabled,
  ReferralReviewMinClusterSizeConfigKey,
  ReferralReviewMinDeviceClustersConfigKey,
  ReferralReviewMinQualifiedConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { toSkipTake } from '@chantam/service.common-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Người giới thiệu đang trong diện Admin xem xét.
 *
 * ## Đây là một danh sách, không phải một cái máy phạt
 *
 * Cùng hình dạng và cùng tinh thần với `GET /admin/reports/reporters` và cờ Giver
 * Accuracy: đưa hồ sơ lên bàn Admin rồi dừng. **Không tự hoãn thưởng, không tự khoá
 * ai.** Lý do cụ thể, không phải sự thận trọng chung:
 *
 * - Dương tính giả là chắc chắn có. Một gia đình dùng chung wifi, hai người yêu dùng
 *   chung điện thoại, mấy người đăng ký ở một tiệm net — tất cả đều ra cụm trùng.
 * - Số tiền là 56 điểm một lượt. Chi phí của một lần chặn sai — người dùng thật im
 *   lặng mất khoản họ xứng đáng và không có cách nào hỏi vì sao — CAO HƠN chi phí
 *   trả cho một kẻ gian 56 điểm mà Admin đảo lại được bằng
 *   `POST /admin/points/ledger/:entryId/reversal`.
 * - `signup_device_hash` dựng từ `deviceId` do client tự sinh, nên nó là tín hiệu
 *   YẾU: ai muốn lách thì đổi mỗi lần. Tự động hoá một quyết định dựa trên nó là
 *   trừng phạt người không biết lách.
 *
 * ## Mặc định TẮT, và cái rỗng đó có nghĩa
 *
 * Xem `DefaultReferralAbuseConfig`: hai cột dấu vết chỉ bắt đầu được ghi từ 30/09 nên
 * chưa ai biết "bình thường" trông thế nào, và một ngưỡng chọn trước khi có dữ liệu
 * là phỏng đoán mặc áo chính sách. Nên kết quả trả kèm `threshold.enabled` — một mảng
 * rỗng vì CHƯA BẬT khác hẳn một mảng rỗng vì không có ai đáng xem.
 */
@Injectable()
export class ListReferralReviewUseCase implements IListReferralReviewUseCase {
  public constructor(
    @Inject(IReferralRepository)
    private readonly referrals: IReferralRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListReferralReviewCommand,
  ): Promise<IListReferralReviewResult> {
    // Ba lượt đọc song song: ba khoá độc lập nhau, và đợi lần lượt là ba lượt đi
    // database nối tiếp cho một màn hình Admin.
    const [minQualifiedReferrals, minDeviceClusters, minClusterSize] =
      await Promise.all([
        this.adminConfig.getConfigValue(ReferralReviewMinQualifiedConfigKey),
        this.adminConfig.getConfigValue(
          ReferralReviewMinDeviceClustersConfigKey,
        ),
        this.adminConfig.getConfigValue(ReferralReviewMinClusterSizeConfigKey),
      ]);
    const config = normalizeReferralAbuseConfig({
      minQualifiedReferrals,
      minDeviceClusters,
      minClusterSize,
    });
    const { skip, take } = toSkipTake(command);

    const { entries, total } = await this.referrals.findReferrersForReview({
      config,
      limit: take,
      offset: skip,
    });

    return {
      candidates: entries,
      total,
      threshold: {
        enabled: referralAbuseReviewEnabled(config),
        minQualifiedReferrals: config.minQualifiedReferrals,
        minDeviceClusters: config.minDeviceClusters,
        minClusterSize: config.minClusterSize,
      },
    };
  }
}
