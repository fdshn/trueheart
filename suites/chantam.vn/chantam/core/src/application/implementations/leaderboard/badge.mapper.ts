import { IUserBadge } from '@/domain/ports/repository';
import { toLeaderboardMonthLabel } from '@chantam.vn/chantam.core-lib/consts';
import { IProfileBadgeDto } from '@chantam.vn/chantam.core-lib/dto';

export function toProfileBadgeDto(
  badge: IUserBadge,
  now: Date,
): IProfileBadgeDto {
  return {
    badgeId: badge.badgeId,
    board: badge.board,
    month: toLeaderboardMonthLabel(badge.month),
    rank: badge.rank,
    expiresAt: badge.expiresAt,
    isAnonymous: badge.isAnonymous,
    status: badge.revokedAt
      ? 'REVOKED'
      : badge.expiresAt <= now
        ? 'EXPIRED'
        : 'ACTIVE',
  };
}
