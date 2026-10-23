import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  LeaderboardConfigDefaults,
  LeaderboardConfigKeys,
} from '@chantam.vn/chantam.core-lib/consts';

export interface ILeaderboardConfig {
  enabled: boolean;
  minCount: Record<LeaderboardBoards, number>;
  badgeRanks: number;
  badgeMonths: number;
}

/**
 * Đọc cấu hình động. Thiếu khoá hoặc sai kiểu thì dùng mặc định — một khoá Admin gõ nhầm
 * không được làm bảng biến mất hay trao huy hiệu cho cả trăm người.
 */
export async function readLeaderboardConfig(
  adminConfig: IAdminConfigRepository,
): Promise<ILeaderboardConfig> {
  const read = async (key: LeaderboardConfigKeys, floor: number) => {
    const value = await adminConfig.getConfigValue(key);
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= floor
      ? value
      : LeaderboardConfigDefaults[key];
  };

  const [enabled, givers, charity, consistency, badgeRanks, badgeMonths] =
    await Promise.all([
      read(LeaderboardConfigKeys.ENABLED, 0),
      read(LeaderboardConfigKeys.MIN_GIVERS, 1),
      read(LeaderboardConfigKeys.MIN_CHARITY, 1),
      read(LeaderboardConfigKeys.MIN_CONSISTENCY_DAYS, 1),
      read(LeaderboardConfigKeys.BADGE_RANKS, 0),
      read(LeaderboardConfigKeys.BADGE_MONTHS, 1),
    ]);

  return {
    enabled: enabled !== 0,
    minCount: {
      [LeaderboardBoards.GIVERS]: givers,
      [LeaderboardBoards.CHARITY]: charity,
      [LeaderboardBoards.CONSISTENCY]: consistency,
    },
    badgeRanks,
    badgeMonths,
  };
}
