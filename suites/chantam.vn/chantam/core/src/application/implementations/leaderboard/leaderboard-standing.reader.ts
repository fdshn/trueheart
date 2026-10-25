import {
  ILeaderboardStandingReader,
  LeaderboardClock,
  LeaderboardClockFn,
} from '@/application/contracts/leaderboard';
import {
  IAdminConfigRepository,
  ILeaderboardRepository,
} from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  toLeaderboardMonthLabel,
  vietnamMonthOf,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { readLeaderboardConfig } from './leaderboard-config';
import { LeaderboardReader } from './leaderboard.use-cases';

/**
 * Vị trí tháng hiện tại trên bảng Người cho, đọc qua CÙNG cache 60 giây với màn bảng —
 * mỗi lượt mở hồ sơ không được kéo theo một lượt đếm lại cả bảng.
 *
 * Không biết người này có ẩn danh hay không: bên gọi (hồ sơ công khai) quyết định ẩn.
 */
@Injectable()
export class LeaderboardStandingReader implements ILeaderboardStandingReader {
  private readonly reader: LeaderboardReader;

  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Optional()
    @Inject(LeaderboardClock)
    private readonly now: LeaderboardClockFn = () => new Date(),
  ) {
    this.reader = new LeaderboardReader(repository);
  }

  public async findGiversStanding(
    userId: string,
  ): Promise<{ month: string; rank: number | null; count: number } | null> {
    const config = await readLeaderboardConfig(this.adminConfig);
    if (!config.enabled) return null;

    const now = this.now();
    const month = vietnamMonthOf(now);
    const board = LeaderboardBoards.GIVERS;
    const source = await this.reader.load(
      month,
      board,
      config.minCount[board],
      now,
    );
    const mine =
      source.status === 'LIVE'
        ? source.rows.find((row) => row.userId === userId)
        : await this.repository.findSnapshotEntry(source.snapshotId, userId);

    return {
      month: toLeaderboardMonthLabel(month),
      rank: mine?.rank ?? null,
      count: mine?.count ?? 0,
    };
  }
}
