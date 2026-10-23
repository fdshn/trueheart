import {
  IListOwnBadgesCommand,
  IListOwnBadgesUseCase,
  LeaderboardClock,
  LeaderboardClockFn,
} from '@/application/contracts/leaderboard';
import { ILeaderboardRepository } from '@/domain/ports/repository';
import { IListOwnBadgesResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { toProfileBadgeDto } from './badge.mapper';

/** Mọi huy hiệu của chính mình — còn hạn, hết hạn, đã gỡ — kèm trạng thái. */
@Injectable()
export class ListOwnBadgesUseCase implements IListOwnBadgesUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Optional()
    @Inject(LeaderboardClock)
    private readonly now: LeaderboardClockFn = () => new Date(),
  ) {}

  public async handle(
    command: IListOwnBadgesCommand,
  ): Promise<IListOwnBadgesResponseDto> {
    const now = this.now();
    const badges = await this.repository.listBadges({
      userId: command.userId,
      scope: 'ALL',
      now,
    });
    return { badges: badges.map((badge) => toProfileBadgeDto(badge, now)) };
  }
}
