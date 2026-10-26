import { ILeaderboardStandingReader } from '@/application/contracts/leaderboard';
import {
  IGetPublicProfileCommand,
  IGetPublicProfileUseCase,
} from '@/application/contracts/profile';
import { UserNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAdminConfigRepository,
  ILeaderboardRepository,
  IPointLedgerRepository,
  IPostRepository,
  ITransactionReviewRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  ContactVisibilities,
  LeaderboardBoards,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  GiverAccuracyConfigKey,
  normalizeGiverAccuracyConfig,
  normalizeReviewRatingConfig,
  ReviewRatingConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { toProfileBadgeDto } from '../leaderboard/badge.mapper';

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
    // Huy hiệu bảng thành tích. Tuỳ chọn để các bài kiểm dựng use case bằng tay không phải
    // biết tới nó — thiếu thì hồ sơ không có huy hiệu, không lỗi.
    @Optional()
    @Inject(ILeaderboardRepository)
    private readonly leaderboard?: ILeaderboardRepository,
    @Optional()
    @Inject(ILeaderboardStandingReader)
    private readonly standing?: ILeaderboardStandingReader,
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
      badges,
      standing,
    ] = await Promise.all([
      this.postRepository.countPublishedByAuthor(user.globalId),
      this.pointLedgerRepository.getSummary(user.globalId),
      this.reviews.getAccuracy(user.globalId),
      this.reviews.getRating(user.globalId),
      this.adminConfig.getConfigValue(GiverAccuracyConfigKey),
      this.adminConfig.getConfigValue(ReviewRatingConfigKey),
      // Chỉ huy hiệu giành lúc CÔNG KHAI: huy hiệu ẩn danh hiện ở đây là ghép được với
      // dòng "Người ẩn danh" cùng hạng trên bảng.
      this.leaderboard?.listBadges({
        userId: user.globalId,
        scope: 'PUBLIC_ACTIVE',
        now: new Date(),
      }) ?? [],
      // Người ẩn danh trên bảng thành tích: vị trí của họ KHÔNG hiện ở hồ sơ — hiện ra là
      // ghép được với dòng "Người ẩn danh" cùng hạng trên bảng.
      user.leaderboardAnonymous
        ? null
        : (this.standing?.findGiversStanding(user.globalId) ?? null),
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
        badges: badges.map((badge) => toProfileBadgeDto(badge, new Date())),
        slogan: user.slogan,
        todayThought: user.todayThought,
        todayThoughtUpdatedAt: user.todayThoughtUpdatedAt,
        introVideoUrl: user.introVideoUrl,
        introVideoThumbnailUrl: user.introVideoThumbnailUrl,
        monthlyStanding: standing
          ? { ...standing, board: LeaderboardBoards.GIVERS as const }
          : null,
        // Chỉ trường chủ hồ sơ đặt PUBLIC. Mobile không render KHÔNG phải hàng rào bảo mật.
        contacts: {
          email:
            user.emailVisibility === ContactVisibilities.PUBLIC
              ? user.email
              : null,
          phone:
            user.phoneVisibility === ContactVisibilities.PUBLIC
              ? user.phone
              : null,
        },
      },
    };
  }
}
