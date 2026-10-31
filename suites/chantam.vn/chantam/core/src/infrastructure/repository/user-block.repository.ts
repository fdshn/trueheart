import {
  IBlockedUserRecord,
  IUserBlockRepository,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IBlockedRow {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  rank: UserRanks;
  blocked_at: Date;
}

const BlockedColumns = `
  person.global_id AS user_id, person.username, person.full_name, person.avatar_url,
  person.rank::text AS rank, block.created_at AS blocked_at`;

const toRecord = (row: IBlockedRow): IBlockedUserRecord => ({
  userId: row.user_id,
  username: row.username,
  fullName: row.full_name,
  avatarUrl: row.avatar_url,
  rank: row.rank,
  blockedAt: row.blocked_at,
});

@Injectable()
export class UserBlockRepository implements IUserBlockRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async block(params: {
    blockerId: string;
    blockedId: string;
  }): Promise<{ blockedAt: Date; created: boolean }> {
    // ON CONFLICT DO NOTHING rồi đọc lại: bấm "Chặn" hai lần ra đúng một dòng, và lần sau
    // trả mốc chặn GỐC chứ không làm mới nó.
    const inserted = await this.manager.query<{ created_at: Date }[]>(
      `INSERT INTO user_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING created_at`,
      [params.blockerId, params.blockedId],
    );
    if (inserted.length > 0)
      return { blockedAt: inserted[0].created_at, created: true };

    const [existing] = await this.manager.query<{ created_at: Date }[]>(
      `SELECT created_at FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [params.blockerId, params.blockedId],
    );
    return { blockedAt: existing.created_at, created: false };
  }

  public async unblock(params: {
    blockerId: string;
    blockedId: string;
  }): Promise<boolean> {
    const removed = await updateReturning<{ blocker_id: string }>(
      this.manager,
      `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2
       RETURNING blocker_id`,
      [params.blockerId, params.blockedId],
    );
    return removed.length > 0;
  }

  public async listBlocked(params: {
    blockerId: string;
    skip: number;
    take: number;
  }): Promise<{ items: IBlockedUserRecord[]; total: number }> {
    const rows = await this.manager.query<IBlockedRow[]>(
      `SELECT ${BlockedColumns}
         FROM user_blocks block
         JOIN users person ON person.global_id = block.blocked_id
        WHERE block.blocker_id = $1
        ORDER BY block.created_at DESC, person.global_id
        LIMIT $2 OFFSET $3`,
      [params.blockerId, params.take, params.skip],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM user_blocks WHERE blocker_id = $1`,
      [params.blockerId],
    );
    return { items: rows.map(toRecord), total: Number(counted?.total ?? 0) };
  }

  public async findBlocked(params: {
    blockerId: string;
    blockedId: string;
  }): Promise<IBlockedUserRecord | null> {
    const [row] = await this.manager.query<IBlockedRow[]>(
      `SELECT ${BlockedColumns}
         FROM user_blocks block
         JOIN users person ON person.global_id = block.blocked_id
        WHERE block.blocker_id = $1 AND block.blocked_id = $2`,
      [params.blockerId, params.blockedId],
    );
    return row ? toRecord(row) : null;
  }

  public async isBlockedEitherWay(
    userA: string,
    userB: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ blocked: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM user_blocks
          WHERE (blocker_id = $1 AND blocked_id = $2)
             OR (blocker_id = $2 AND blocked_id = $1)
       ) AS blocked`,
      [userA, userB],
    );
    return row?.blocked === true;
  }

  public async filterBlockRelations(
    userId: string,
    candidateIds: string[],
  ): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    const rows = await this.manager.query<{ other_id: string }[]>(
      `SELECT blocked_id AS other_id FROM user_blocks
        WHERE blocker_id = $1 AND blocked_id = ANY($2::uuid[])
       UNION
       SELECT blocker_id FROM user_blocks
        WHERE blocked_id = $1 AND blocker_id = ANY($2::uuid[])`,
      [userId, candidateIds],
    );
    return new Set(rows.map((row) => row.other_id));
  }
}
