import {
  IGetPublicProfileCommand,
  IGetPublicProfileUseCase,
} from '@/application/contracts/profile';
import { UserNotFoundException } from '@/domain/exceptions';
import {
  IGiftPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetPublicProfileUseCase implements IGetPublicProfileUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly userRepository: IUserRepository,
    @Inject(IGiftPostRepository)
    private readonly giftPostRepository: IGiftPostRepository,
  ) {}

  public async handle(command: IGetPublicProfileCommand) {
    const user = await this.userRepository.findActiveByUsername(
      command.username,
    );
    if (!user) throw new UserNotFoundException();

    return {
      profile: {
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        rank: user.rank,
        publishedGiftPostCount:
          await this.giftPostRepository.countPublishedByGiver(user.globalId),
      },
    };
  }
}
