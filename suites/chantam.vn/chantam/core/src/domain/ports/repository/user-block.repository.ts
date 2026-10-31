import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';

export interface IBlockedUserRecord {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
  blockedAt: Date;
}

/**
 * Chặn người dùng. Một chiều khi LƯU (A chặn B), nhưng mọi phép kiểm hiệu lực đều xét HAI
 * chiều: B không nhắn được cho A, A cũng không nhắn được cho B, và hai người không thấy nhau
 * trong danh sách online.
 */
export interface IUserBlockRepository {
  /** Chặn; gọi lại khi đã chặn thì trả mốc cũ và `created: false`. */
  block(params: {
    blockerId: string;
    blockedId: string;
  }): Promise<{ blockedAt: Date; created: boolean }>;

  /** Bỏ chặn; `false` khi vốn không chặn. */
  unblock(params: { blockerId: string; blockedId: string }): Promise<boolean>;

  listBlocked(params: {
    blockerId: string;
    skip: number;
    take: number;
  }): Promise<{ items: IBlockedUserRecord[]; total: number }>;

  findBlocked(params: {
    blockerId: string;
    blockedId: string;
  }): Promise<IBlockedUserRecord | null>;

  /** Một trong hai đã chặn người kia. */
  isBlockedEitherWay(userA: string, userB: string): Promise<boolean>;

  /** Những id trong `candidateIds` có quan hệ chặn (một chiều bất kỳ) với `userId`. */
  filterBlockRelations(
    userId: string,
    candidateIds: string[],
  ): Promise<Set<string>>;
}

export const IUserBlockRepository = Symbol('IUserBlockRepository');
