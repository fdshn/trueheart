import {
  IGetPublicProfileCommand,
  IGetPublicProfileUseCase,
} from '@/application/contracts/profile';
import { UserNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IPointLedgerRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
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
  ) {}

  public async handle(command: IGetPublicProfileCommand) {
    const user = await this.userRepository.findActiveByUsername(
      command.username,
    );
    if (!user) throw new UserNotFoundException();

    const [publishedGiftPostCount, point] = await Promise.all([
      this.postRepository.countPublishedByAuthor(user.globalId),
      this.pointLedgerRepository.getSummary(user.globalId),
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
      },
    };
  }
}
