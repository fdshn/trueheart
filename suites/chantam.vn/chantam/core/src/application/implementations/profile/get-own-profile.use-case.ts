import {
  IGetOwnProfileCommand,
  IGetOwnProfileUseCase,
} from '@/application/contracts/profile';
import { UserNotFoundException } from '@/domain/exceptions';
import {
  IReferralRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { toOwnProfileDto } from './profile.mapper';

@Injectable()
export class GetOwnProfileUseCase implements IGetOwnProfileUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IReferralRepository)
    private readonly referralRepository: IReferralRepository,
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

    const referral = await this.referralRepository.getOwnSummary(
      command.userId,
    );

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
      },
    };
  }
}
