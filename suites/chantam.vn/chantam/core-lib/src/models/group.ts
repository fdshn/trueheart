import { GroupMemberRoles, GroupStatuses } from '../consts';

export interface IGroup {
  ownerId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  /**
   * Nhãn vùng, chụp lại lúc tạo cùng tâm và bán kính.
   *
   * Owner KHÔNG đổi được tâm/bán kính về sau (BR-GRP-03): cho đổi thì người ta
   * dời vùng theo nơi đang có nhiều sự kiện để gom điểm.
   */
  regionLabel: string;
  radiusKm: number;
  /** Không tự hết hạn, không giới hạn lượt dùng (BR-GRP-04). */
  inviteCode: string;
  status: GroupStatuses;
  activatedAt: Date;
  dissolvedAt: Date | null;
}

export interface ISubTeam {
  groupId: string;
  name: string;
}

export interface IGroupMembership {
  groupId: string;
  userId: string;
  /** `null` khi chưa xếp vào tổ nào. */
  subTeamId: string | null;
  role: GroupMemberRoles;
  joinedAt: Date;
}

/**
 * Chuẩn hoá bán kính đọc từ Rank Config.
 *
 * Kẹp vào khoảng cho phép thay vì ném: cấu hình gõ nhầm không được làm chết
 * đường tạo nhóm, và một bán kính ngoài khoảng là lỗi cấu hình chứ không phải
 * lỗi của người đang tạo nhóm.
 */
export function normalizeGroupRadiusKm(
  raw: unknown,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const value = Number(raw);
  const base = Number.isFinite(value) && value > 0 ? value : fallback;

  return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(base)));
}
