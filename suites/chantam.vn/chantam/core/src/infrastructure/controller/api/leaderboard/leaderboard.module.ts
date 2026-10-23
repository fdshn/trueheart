import { Module } from '@nestjs/common';
import { AdminLeaderboardController } from './admin-leaderboard.controller';
import { LeaderboardController } from './leaderboard.controller';

@Module({
  controllers: [LeaderboardController, AdminLeaderboardController],
})
export class LeaderboardControllerModule {}
