import {
  ICreateLeaderboardExclusionCommand,
  ICreateLeaderboardExclusionUseCase,
  IGetAdminMonthlyLeaderboardCommand,
  IGetAdminMonthlyLeaderboardUseCase,
  IListAdminBadgesCommand,
  IListAdminBadgesUseCase,
  IListLeaderboardExclusionsCommand,
  IListLeaderboardExclusionsUseCase,
  IRemoveLeaderboardExclusionCommand,
  IRemoveLeaderboardExclusionUseCase,
  IRevokeLeaderboardBadgeCommand,
  IRevokeLeaderboardBadgeUseCase,
  LeaderboardClock,
  LeaderboardClockFn,
} from '@/application/contracts/leaderboard';
import {
  LeaderboardBadgeNotFoundException,
  LeaderboardExclusionExistsException,
  LeaderboardExclusionNotFoundException,
  LeaderboardMonthClosedException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ILeaderboardExclusion,
  ILeaderboardRepository,
  ILeaderboardRow,
  IUserBadge,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  parseLeaderboardMonth,
  toLeaderboardMonthLabel,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IAdminBadgeDto,
  IAdminLeaderboardEntryDto,
  IAdminMonthlyLeaderboardDto,
  ILeaderboardExclusionDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { toProfileBadgeDto } from './badge.mapper';
import { readLeaderboardConfig } from './leaderboard-config';
import {
  resolveLeaderboardMonth,
  toLeaderboardEntryDto,
} from './leaderboard.use-cases';

const ExclusionUniqueConstraint = 'UQ_leaderboard_exclusions_active';

function requireMonth(month: string): string {
  const parsed = parseLeaderboardMonth(month);
  if (!parsed)
    throw new ValidationFailedException(['month: phải có dạng YYYY-MM']);
  return parsed;
}

function toAdminEntry(row: ILeaderboardRow): IAdminLeaderboardEntryDto {
  return {
    ...toLeaderboardEntryDto(row),
    userId: row.userId,
    excluded: row.excluded ?? false,
  };
}

function toExclusionDto(
  exclusion: ILeaderboardExclusion,
): ILeaderboardExclusionDto {
  return {
    ...exclusion,
    month: toLeaderboardMonthLabel(exclusion.month),
  };
}

function toAdminBadgeDto(badge: IUserBadge, now: Date): IAdminBadgeDto {
  return {
    ...toProfileBadgeDto(badge, now),
    userId: badge.userId,
    awardedAt: badge.awardedAt,
    revokeReason: badge.revokeReason,
  };
}

/**
 * Bảng phía Admin: LUÔN có danh tính thật, có cả người bị loại (đánh dấu), và vẫn xem được
 * khi tính năng đang tắt — Admin cần nhìn bảng trước khi bật nó lên.
 */
@Injectable()
export class GetAdminMonthlyLeaderboardUseCase implements IGetAdminMonthlyLeaderboardUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Optional()
    @Inject(LeaderboardClock)
    private readonly now: LeaderboardClockFn = () => new Date(),
  ) {}

  public async handle(
    command: IGetAdminMonthlyLeaderboardCommand,
  ): Promise<IAdminMonthlyLeaderboardDto> {
    const month = resolveLeaderboardMonth(command.month, this.now());
    const { skip, take } = toSkipTake(command);
    const page = Math.floor(skip / take) + 1;
    const config = await readLeaderboardConfig(this.adminConfig);
    const base = {
      month: toLeaderboardMonthLabel(month),
      board: command.board,
      enabled: config.enabled,
    };

    const snapshot = await this.repository.findSnapshot(month, command.board);
    if (snapshot) {
      const entries = await this.repository.listSnapshotEntries({
        snapshotId: snapshot.id,
        skip,
        take,
        revealIdentity: true,
      });
      return {
        ...base,
        status: 'CLOSED',
        closedAt: snapshot.closedAt,
        entries: entries.items.map(toAdminEntry),
        meta: new PaginationMetaDto(page, take, entries.total),
      };
    }

    const rows = await this.repository.computeLive({
      month,
      board: command.board,
      minCount: config.minCount[command.board],
      includeExcluded: true,
      revealIdentity: true,
    });
    return {
      ...base,
      status: 'LIVE',
      closedAt: null,
      entries: rows.slice(skip, skip + take).map(toAdminEntry),
      meta: new PaginationMetaDto(page, take, rows.length),
    };
  }
}

@Injectable()
export class ListLeaderboardExclusionsUseCase implements IListLeaderboardExclusionsUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
  ) {}

  public async handle(command: IListLeaderboardExclusionsCommand) {
    const { skip, take } = toSkipTake(command);
    const page = await this.repository.listExclusions({
      month: command.month ? requireMonth(command.month) : undefined,
      board: command.board,
      skip,
      take,
    });
    return {
      items: page.items.map(toExclusionDto),
      meta: new PaginationMetaDto(
        Math.floor(skip / take) + 1,
        take,
        page.total,
      ),
    };
  }
}

/**
 * Loại một người khỏi một bảng (hoặc cả ba) của một tháng CHƯA chốt.
 *
 * Tháng đã chốt thì từ chối: bản chốt không đổi nữa, và việc của Admin lúc đó là gỡ huy hiệu
 * (người xếp sau không được đôn lên).
 */
@Injectable()
export class CreateLeaderboardExclusionUseCase implements ICreateLeaderboardExclusionUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IUserRepository)
    private readonly users: IUserRepository,
  ) {}

  public async handle(command: ICreateLeaderboardExclusionCommand) {
    const month = requireMonth(command.month);

    const boards = command.board
      ? [command.board]
      : Object.values(LeaderboardBoards);
    for (const board of boards)
      if (await this.repository.findSnapshot(month, board))
        throw new LeaderboardMonthClosedException();

    const user = await this.users.findOneBy({ globalId: command.userId });
    if (!user || user.deletedAt) throw new UserNotFoundException();

    let exclusion: ILeaderboardExclusion;
    try {
      exclusion = await this.repository.createExclusion({
        month,
        board: command.board,
        userId: command.userId,
        reason: command.reason,
        actorUserId: command.actorUserId,
      });
    } catch (error) {
      if (
        (error as { driverError?: { constraint?: string } }).driverError
          ?.constraint === ExclusionUniqueConstraint
      )
        throw new LeaderboardExclusionExistsException();
      throw error;
    }

    const dto = toExclusionDto(exclusion);
    await this.adminConfig.appendAudit({
      actorUserId: command.actorUserId,
      action: 'LEADERBOARD_EXCLUDE',
      resourceType: 'LEADERBOARD_EXCLUSION',
      resourceId: exclusion.exclusionId,
      before: null,
      after: dto,
      reason: command.reason,
    });
    return { exclusion: dto };
  }
}

@Injectable()
export class RemoveLeaderboardExclusionUseCase implements IRemoveLeaderboardExclusionUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(command: IRemoveLeaderboardExclusionCommand) {
    const removed = await this.repository.removeExclusion({
      exclusionId: command.exclusionId,
      actorUserId: command.actorUserId,
    });
    if (!removed) throw new LeaderboardExclusionNotFoundException();

    const dto = toExclusionDto(removed);
    await this.adminConfig.appendAudit({
      actorUserId: command.actorUserId,
      action: 'LEADERBOARD_EXCLUSION_REMOVE',
      resourceType: 'LEADERBOARD_EXCLUSION',
      resourceId: removed.exclusionId,
      before: { ...dto, removedAt: null, removedBy: null },
      after: dto,
    });
    return { exclusion: dto };
  }
}

@Injectable()
export class ListAdminBadgesUseCase implements IListAdminBadgesUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Optional()
    @Inject(LeaderboardClock)
    private readonly now: LeaderboardClockFn = () => new Date(),
  ) {}

  public async handle(command: IListAdminBadgesCommand) {
    const { skip, take } = toSkipTake(command);
    const page = await this.repository.listBadgesForAdmin({
      month: command.month ? requireMonth(command.month) : undefined,
      board: command.board,
      userId: command.userId,
      skip,
      take,
    });
    const now = this.now();
    return {
      items: page.items.map((badge) => toAdminBadgeDto(badge, now)),
      meta: new PaginationMetaDto(
        Math.floor(skip / take) + 1,
        take,
        page.total,
      ),
    };
  }
}

/** Gỡ huy hiệu. Bản chốt KHÔNG đổi — người xếp sau không được đôn lên. */
@Injectable()
export class RevokeLeaderboardBadgeUseCase implements IRevokeLeaderboardBadgeUseCase {
  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(command: IRevokeLeaderboardBadgeCommand) {
    const revoked = await this.repository.revokeBadge({
      badgeId: command.badgeId,
      actorUserId: command.actorUserId,
      reason: command.reason,
    });
    if (!revoked) throw new LeaderboardBadgeNotFoundException();

    const dto = toAdminBadgeDto(revoked, new Date());
    await this.adminConfig.appendAudit({
      actorUserId: command.actorUserId,
      action: 'BADGE_REVOKE',
      resourceType: 'USER_BADGE',
      resourceId: revoked.badgeId,
      before: { ...dto, status: 'ACTIVE', revokeReason: null },
      after: dto,
      reason: command.reason,
    });
    return { badge: dto };
  }
}
