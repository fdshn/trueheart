import {
  ICloseLeaderboardMonthUseCase,
  IGetMonthlyLeaderboardUseCase,
  IGetMyLeaderboardPositionsUseCase,
  IListLeaderboardMonthsUseCase,
  IListOwnBadgesUseCase,
  LeaderboardClock,
} from '@/application/contracts/leaderboard';
import { Global, Module } from '@nestjs/common';
import { CloseLeaderboardMonthUseCase } from './close-leaderboard-month.use-case';
import {
  GetMonthlyLeaderboardUseCase,
  GetMyLeaderboardPositionsUseCase,
  ListLeaderboardMonthsUseCase,
} from './leaderboard.use-cases';
import { ListOwnBadgesUseCase } from './list-own-badges.use-case';

@Global()
@Module({
  providers: [
    { provide: LeaderboardClock, useValue: () => new Date() },
    {
      provide: IGetMonthlyLeaderboardUseCase,
      useClass: GetMonthlyLeaderboardUseCase,
    },
    {
      provide: IGetMyLeaderboardPositionsUseCase,
      useClass: GetMyLeaderboardPositionsUseCase,
    },
    {
      provide: IListLeaderboardMonthsUseCase,
      useClass: ListLeaderboardMonthsUseCase,
    },
    { provide: IListOwnBadgesUseCase, useClass: ListOwnBadgesUseCase },
    {
      provide: ICloseLeaderboardMonthUseCase,
      useClass: CloseLeaderboardMonthUseCase,
    },
  ],
  exports: [
    LeaderboardClock,
    IGetMonthlyLeaderboardUseCase,
    IGetMyLeaderboardPositionsUseCase,
    IListLeaderboardMonthsUseCase,
    ICloseLeaderboardMonthUseCase,
    IListOwnBadgesUseCase,
  ],
})
export class LeaderboardModule {}
