import {
  IGetMonthlyLeaderboardCommand,
  IGetMonthlyLeaderboardUseCase,
  IGetMyLeaderboardPositionsCommand,
  IGetMyLeaderboardPositionsUseCase,
  IListLeaderboardMonthsUseCase,
  LeaderboardClock,
  LeaderboardClockFn,
} from '@/application/contracts/leaderboard';
import {
  IAdminConfigRepository,
  ILeaderboardRepository,
  ILeaderboardRow,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  parseLeaderboardMonth,
  toLeaderboardMonthLabel,
  vietnamMonthOf,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ILeaderboardEntryDto,
  ILeaderboardMonthsDto,
  ILeaderboardUserDto,
  IMonthlyLeaderboardDto,
  IMyLeaderboardPositionDto,
  IMyLeaderboardPositionsDto,
  LeaderboardStatus,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { readLeaderboardConfig } from './leaderboard-config';

/** Bảng tháng hiện tại thay đổi liên tục; giữ một phút là đủ đỡ một màn hình được kéo xuống liên tục. */
const LiveCacheMs = 60_000;

const Boards = [
  LeaderboardBoards.GIVERS,
  LeaderboardBoards.CHARITY,
  LeaderboardBoards.CONSISTENCY,
];

export function resolveLeaderboardMonth(
  month: string | undefined,
  now: Date,
): string {
  if (month === undefined) return vietnamMonthOf(now);
  const parsed = parseLeaderboardMonth(month);
  if (!parsed)
    throw new ValidationFailedException(['month: phải có dạng YYYY-MM']);
  return parsed;
}

/**
 * Dòng công khai. Bỏ `userId` ở ĐÂY, một chỗ: dòng ẩn danh mang id thì id đó tra ngược ra
 * hồ sơ. Danh tính đã là `null` từ câu SQL khi dòng không được lộ.
 */
export function toLeaderboardEntryDto(
  row: ILeaderboardRow,
): ILeaderboardEntryDto {
  return {
    rank: row.rank,
    count: row.count,
    isAnonymous: row.isAnonymous,
    isInactive: row.isInactive,
    user: row.identity
      ? {
          username: row.identity.username,
          fullName: row.identity.fullName,
          avatarUrl: row.identity.avatarUrl,
          rank: row.identity.rank,
        }
      : null,
  };
}

type BoardSource =
  | { status: 'CLOSED'; closedAt: Date; snapshotId: string }
  | { status: 'LIVE'; rows: ILeaderboardRow[] };

/**
 * Bảng của một (tháng, bảng): bản chốt nếu đã chốt, không thì tính trực tiếp. Một tháng đã
 * qua mà job chưa chạy vẫn là `LIVE` — không có tháng nào "trống".
 */
@Injectable()
export class LeaderboardReader {
  private readonly cache = new Map<
    string,
    { rows: ILeaderboardRow[]; expiresAt: number }
  >();

  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
  ) {}

  public async load(
    month: string,
    board: LeaderboardBoards,
    minCount: number,
  ): Promise<BoardSource> {
    const snapshot = await this.repository.findSnapshot(month, board);
    if (snapshot)
      return {
        status: 'CLOSED',
        closedAt: snapshot.closedAt,
        snapshotId: snapshot.id,
      };

    const key = `${month}:${board}:${minCount}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now())
      return { status: 'LIVE', rows: cached.rows };

    const rows = await this.repository.computeLive({ month, board, minCount });
    this.cache.set(key, { rows, expiresAt: Date.now() + LiveCacheMs });
    return { status: 'LIVE', rows };
  }
}

@Injectable()
export class GetMonthlyLeaderboardUseCase implements IGetMonthlyLeaderboardUseCase {
  private readonly reader: LeaderboardReader;

  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Optional()
    @Inject(LeaderboardClock)
    private readonly now: LeaderboardClockFn = () => new Date(),
    // Chỉ cần khi người gọi đang ẩn danh trên bảng trực tiếp: dòng của họ ra khỏi SQL
    // không danh tính, mà `me` thì phải có danh tính của CHÍNH họ.
    @Optional()
    @Inject(IUserRepository)
    private readonly users?: IUserRepository,
  ) {
    this.reader = new LeaderboardReader(repository);
  }

  public async handle(
    command: IGetMonthlyLeaderboardCommand,
  ): Promise<IMonthlyLeaderboardDto> {
    const month = resolveLeaderboardMonth(command.month, this.now());
    const { skip, take } = toSkipTake(command);
    const page = Math.floor(skip / take) + 1;
    const config = await readLeaderboardConfig(this.adminConfig);

    const base = {
      month: toLeaderboardMonthLabel(month),
      board: command.board,
      enabled: config.enabled,
    };

    if (!config.enabled)
      return {
        ...base,
        status: 'LIVE',
        closedAt: null,
        entries: [],
        meta: new PaginationMetaDto(page, take, 0),
        me: null,
      };

    const source = await this.reader.load(
      month,
      command.board,
      config.minCount[command.board],
    );

    if (source.status === 'CLOSED') {
      const entries = await this.repository.listSnapshotEntries({
        snapshotId: source.snapshotId,
        skip,
        take,
      });
      const mine = command.viewerId
        ? await this.repository.findSnapshotEntry(
            source.snapshotId,
            command.viewerId,
          )
        : null;
      return {
        ...base,
        status: 'CLOSED',
        closedAt: source.closedAt,
        entries: entries.items.map(toLeaderboardEntryDto),
        meta: new PaginationMetaDto(page, take, entries.total),
        me: mine ? toLeaderboardEntryDto(mine) : null,
      };
    }

    const mine = command.viewerId
      ? source.rows.find((row) => row.userId === command.viewerId)
      : undefined;
    return {
      ...base,
      status: 'LIVE',
      closedAt: null,
      entries: source.rows.slice(skip, skip + take).map(toLeaderboardEntryDto),
      meta: new PaginationMetaDto(page, take, source.rows.length),
      me: mine ? await this.withOwnIdentity(mine) : null,
    };
  }

  private async withOwnIdentity(
    row: ILeaderboardRow,
  ): Promise<ILeaderboardEntryDto> {
    const dto = toLeaderboardEntryDto(row);
    if (dto.user || !this.users) return dto;
    const user = await this.users.findOneBy({ globalId: row.userId });
    const own: ILeaderboardUserDto | null = user
      ? {
          username: user.username,
          fullName: user.fullName ?? null,
          avatarUrl: user.avatarUrl ?? null,
          rank: user.rank,
        }
      : null;
    return { ...dto, user: own };
  }
}

@Injectable()
export class GetMyLeaderboardPositionsUseCase implements IGetMyLeaderboardPositionsUseCase {
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

  public async handle(
    command: IGetMyLeaderboardPositionsCommand,
  ): Promise<IMyLeaderboardPositionsDto> {
    const month = resolveLeaderboardMonth(command.month, this.now());
    const config = await readLeaderboardConfig(this.adminConfig);

    let status: LeaderboardStatus = 'LIVE';
    const positions: IMyLeaderboardPositionDto[] = [];
    for (const board of Boards) {
      const minCount = config.minCount[board];
      const empty = (): IMyLeaderboardPositionDto => ({
        board,
        rank: null,
        count: 0,
        minCount,
        badgeRanks: config.badgeRanks,
        gapToBadge: null,
        gapToNext: null,
      });
      if (!config.enabled) {
        positions.push(empty());
        continue;
      }

      const source = await this.reader.load(month, board, minCount);
      if (source.status === 'CLOSED') status = 'CLOSED';
      const lookup = await this.lookup(
        source,
        command.userId,
        config.badgeRanks,
      );
      if (!lookup.mine) {
        positions.push(empty());
        continue;
      }

      const { mine, atBadgeLine, above } = lookup;
      positions.push({
        board,
        rank: mine.rank,
        count: mine.count,
        minCount,
        badgeRanks: config.badgeRanks,
        gapToBadge:
          mine.rank > config.badgeRanks && atBadgeLine
            ? atBadgeLine.count - mine.count
            : null,
        gapToNext: above ? above.count - mine.count : null,
      });
    }

    return {
      month: toLeaderboardMonthLabel(month),
      status,
      enabled: config.enabled,
      positions,
    };
  }

  /** Dòng của tôi, dòng ở hạng cuối nhận huy hiệu, và dòng ngay trên tôi. */
  private async lookup(
    source: BoardSource,
    userId: string,
    badgeRanks: number,
  ): Promise<{
    mine: ILeaderboardRow | null;
    atBadgeLine: ILeaderboardRow | null;
    above: ILeaderboardRow | null;
  }> {
    if (source.status === 'LIVE') {
      const mine = source.rows.find((row) => row.userId === userId) ?? null;
      return {
        mine,
        atBadgeLine:
          badgeRanks > 0 ? (source.rows[badgeRanks - 1] ?? null) : null,
        above: mine && mine.rank > 1 ? source.rows[mine.rank - 2] : null,
      };
    }

    const mine = await this.repository.findSnapshotEntry(
      source.snapshotId,
      userId,
    );
    if (!mine) return { mine: null, atBadgeLine: null, above: null };
    const at = async (rank: number) =>
      rank < 1
        ? null
        : ((
            await this.repository.listSnapshotEntries({
              snapshotId: source.snapshotId,
              skip: rank - 1,
              take: 1,
            })
          ).items[0] ?? null);
    return {
      mine,
      atBadgeLine: mine.rank > badgeRanks ? await at(badgeRanks) : null,
      above: await at(mine.rank - 1),
    };
  }
}

@Injectable()
export class ListLeaderboardMonthsUseCase implements IListLeaderboardMonthsUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
  ) {}

  public async handle(
    _command: Record<string, never> = {},
  ): Promise<ILeaderboardMonthsDto> {
    return {
      months: (await this.repository.listClosedMonths()).map(
        toLeaderboardMonthLabel,
      ),
    };
  }
}
