import {
  IGetMonthlyLeaderboardUseCase,
  IGetMyLeaderboardPositionsUseCase,
  IListLeaderboardMonthsUseCase,
  LeaderboardClock,
} from '@/application/contracts/leaderboard';
import { Global, Module } from '@nestjs/common';
import {
  GetMonthlyLeaderboardUseCase,
  GetMyLeaderboardPositionsUseCase,
  ListLeaderboardMonthsUseCase,
} from './leaderboard.use-cases';

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
  ],
  exports: [
    LeaderboardClock,
    IGetMonthlyLeaderboardUseCase,
    IGetMyLeaderboardPositionsUseCase,
    IListLeaderboardMonthsUseCase,
  ],
})
export class LeaderboardModule {}
