import { IGetOwnEntitlementsUseCase } from '@/application/contracts/entitlement';
import { IGetOwnPointSummaryUseCase } from '@/application/contracts/point';
import {
  IGetOwnProfileCommand,
  IGetOwnProfileUseCase,
} from '@/application/contracts/profile';
import { IGetOwnRankSummaryUseCase } from '@/application/contracts/rank';
import { UserNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IReferralRepository,
  ITransactionReviewRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiverAccuracyConfigKey,
  normalizeGiverAccuracyConfig,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { toOwnProfileDto } from './profile.mapper';

@Injectable()
export class GetOwnProfileUseCase implements IGetOwnProfileUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IReferralRepository)
    private readonly referralRepository: IReferralRepository,
    @Inject(IGetOwnPointSummaryUseCase)
    private readonly getOwnPointSummaryUseCase: IGetOwnPointSummaryUseCase,
    @Inject(IGetOwnRankSummaryUseCase)
    private readonly getOwnRankSummaryUseCase: IGetOwnRankSummaryUseCase,
    @Inject(IGetOwnEntitlementsUseCase)
    private readonly getOwnEntitlementsUseCase: IGetOwnEntitlementsUseCase,
    @Inject(ITransactionReviewRepository)
    private readonly reviewRepository: ITransactionReviewRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(command: IGetOwnProfileCommand) {
    const user = await this.userRepository.findOneBy({
      globalId: command.userId,
    });

    if (!user || user.deletedAt) throw new UserNotFoundException();

    const [referralRecord] = await this.userRepository.query<
      { referrer_id: string }[]
    >(`SELECT referrer_id FROM referrals WHERE referee_id = $1 LIMIT 1`, [
      command.userId,
    ]);

    const referrer = referralRecord
      ? await this.userRepository.findOneBy({
          globalId: referralRecord.referrer_id,
        })
      : null;

    // Gọi lại chính use case đang phục vụ ba endpoint riêng, không đọc thẳng
    // repository: mọi con số ở đây phải trùng khít với /points/me, /ranks/me và
    // /me/entitlements, kể cả khi cách tính đổi về sau.
    const [referral, point, rank, entitlements, accuracy, accuracyConfig] =
      await Promise.all([
        this.referralRepository.getOwnSummary(command.userId),
        this.getOwnPointSummaryUseCase.handle({ userId: command.userId }),
        this.getOwnRankSummaryUseCase.handle({ userId: command.userId }),
        this.getOwnEntitlementsUseCase.handle({ userId: command.userId }),
        this.reviewRepository.getAccuracy(command.userId),
        this.adminConfig.getConfigValue(GiverAccuracyConfigKey),
      ]);

    return {
      profile: {
        ...toOwnProfileDto(user),
        referral,
        referrer: referrer
          ? {
              userId: referrer.globalId,
              username: referrer.username,
              fullName: referrer.fullName,
              avatarUrl: referrer.avatarUrl,
            }
          : null,
        point: point.point,
        rankProgress: rank.rank,
        entitlements: entitlements.entitlements,
        // Chính chủ thấy chỉ số của mình, KHÔNG thấy cờ `reviewRequired`. Cờ đó
        // là tín hiệu để Admin xem, không phải phán quyết — cho chính chủ thấy
        // "bạn đang bị đánh dấu xem xét" là kết tội trước khi có người nhìn qua.
        accuracy: {
          percent: accuracy.percent,
          samples: accuracy.samples,
          minSamples: normalizeGiverAccuracyConfig(accuracyConfig).minSamples,
        },
      },
    };
  }
}
