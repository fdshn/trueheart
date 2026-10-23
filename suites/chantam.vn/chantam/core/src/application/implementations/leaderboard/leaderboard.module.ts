import {
  ICloseLeaderboardMonthUseCase,
  ICreateLeaderboardExclusionUseCase,
  IGetAdminMonthlyLeaderboardUseCase,
  IGetMonthlyLeaderboardUseCase,
  IGetMyLeaderboardPositionsUseCase,
  IListAdminBadgesUseCase,
  IListLeaderboardExclusionsUseCase,
  IListLeaderboardMonthsUseCase,
  IListOwnBadgesUseCase,
  IRemoveLeaderboardExclusionUseCase,
  IRevokeLeaderboardBadgeUseCase,
  LeaderboardClock,
} from '@/application/contracts/leaderboard';
import { Global, Module } from '@nestjs/common';
import {
  CreateLeaderboardExclusionUseCase,
  GetAdminMonthlyLeaderboardUseCase,
  ListAdminBadgesUseCase,
  ListLeaderboardExclusionsUseCase,
  RemoveLeaderboardExclusionUseCase,
  RevokeLeaderboardBadgeUseCase,
} from './admin-leaderboard.use-cases';
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
      provide: IGetAdminMonthlyLeaderboardUseCase,
      useClass: GetAdminMonthlyLeaderboardUseCase,
    },
    {
      provide: IListLeaderboardExclusionsUseCase,
      useClass: ListLeaderboardExclusionsUseCase,
    },
    {
      provide: ICreateLeaderboardExclusionUseCase,
      useClass: CreateLeaderboardExclusionUseCase,
    },
    {
      provide: IRemoveLeaderboardExclusionUseCase,
      useClass: RemoveLeaderboardExclusionUseCase,
    },
    { provide: IListAdminBadgesUseCase, useClass: ListAdminBadgesUseCase },
    {
      provide: IRevokeLeaderboardBadgeUseCase,
      useClass: RevokeLeaderboardBadgeUseCase,
    },
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
    IGetAdminMonthlyLeaderboardUseCase,
    IListLeaderboardExclusionsUseCase,
    ICreateLeaderboardExclusionUseCase,
    IRemoveLeaderboardExclusionUseCase,
    IListAdminBadgesUseCase,
    IRevokeLeaderboardBadgeUseCase,
  ],
})
export class LeaderboardModule {}
