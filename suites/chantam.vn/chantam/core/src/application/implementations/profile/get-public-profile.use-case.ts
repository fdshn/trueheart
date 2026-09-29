import {
  IGetPublicProfileCommand,
  IGetPublicProfileUseCase,
} from '@/application/contracts/profile';
import { UserNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
  IPostRepository,
  ITransactionReviewRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiverAccuracyConfigKey,
  normalizeGiverAccuracyConfig,
  normalizeReviewRatingConfig,
  ReviewRatingConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetPublicProfileUseCase implements IGetPublicProfileUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly userRepository: IUserRepository,
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPointLedgerRepository)
    private readonly pointLedgerRepository: IPointLedgerRepository,
    @Inject(IConfig) private readonly config: IConfig,
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(command: IGetPublicProfileCommand) {
    const user = await this.userRepository.findActiveByUsername(
      command.username,
    );
    if (!user) throw new UserNotFoundException();

    const [
      publishedGiftPostCount,
      point,
      accuracy,
      rating,
      accuracyConfig,
      ratingConfig,
    ] = await Promise.all([
      this.postRepository.countPublishedByAuthor(user.globalId),
      this.pointLedgerRepository.getSummary(user.globalId),
      this.reviews.getAccuracy(user.globalId),
      this.reviews.getRating(user.globalId),
      this.adminConfig.getConfigValue(GiverAccuracyConfigKey),
      this.adminConfig.getConfigValue(ReviewRatingConfigKey),
    ]);

    const base = this.config.web.publicBaseUrl;

    return {
      profile: {
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        rank: user.rank,
        publishedGiftPostCount,
        // Chỉ `lifetime`. `balance` là điểm tiêu được của riêng chủ tài khoản,
        // để lộ ra kênh công khai là lộ sức mua của người ta.
        lifetimePoints: point.lifetime,
        shareUrl: base ? `${base}/u/${user.username}` : null,
        // Tín hiệu tin cậy — công khai từ 29/09.
        //
        // KHÔNG trả cờ `accuracy_review_required`: cờ đó chỉ để đưa hồ sơ lên bàn
        // Admin, và hiện nó ra công khai là biến một việc "cần người thật xem lại"
        // thành một dấu đóng lên mặt người ta (F43, §13.4).
        accuracy:
          accuracy.percent === null && accuracy.samples === 0
            ? null
            : {
                percent: accuracy.percent,
                samples: accuracy.samples,
                minSamples:
                  normalizeGiverAccuracyConfig(accuracyConfig).minSamples,
              },
        rating: {
          asGiver: rating.asGiver,
          asReceiver: rating.asReceiver,
          minSamples: normalizeReviewRatingConfig(ratingConfig).minSamples,
        },
      },
    };
  }
}
