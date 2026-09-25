import {
  ICreateGroupParams,
  IGroupMemberItem,
  IGroupRepository,
  IGroupSummary,
} from '@/domain/ports/repository';
import {
  GroupMemberRoles,
  GroupStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IGroupEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

@Injectable()
export class GroupRepository
  extends Repository<IGroupEntity>
  implements IGroupRepository
{
  public constructor(
    @Inject(IGroupEntity) target: EntitySchema,
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {
    super(target, entityManager);
  }

  public async createWithOwner(params: ICreateGroupParams): Promise<void> {
    await this.entityManager.transaction(async (manager) => {
      await manager.query(
        `
          INSERT INTO groups
            (global_id, owner_id, name, description, avatar_url, cover_url,
             center_location, region_label, radius_km, invite_code)
          VALUES ($1, $2, $3, $4, $5, $6,
                  ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
                  $9, $10, $11)
        `,
        [
          params.globalId,
          params.ownerId,
          params.name,
          params.description,
          params.avatarUrl,
          params.coverUrl,
          params.centerLocation.lng,
          params.centerLocation.lat,
          params.regionLabel,
          params.radiusKm,
          params.inviteCode,
        ],
      );

      // Cùng transaction: nhóm không có chủ thì không ai quản lý được, vì quyền
      // quản lý đọc từ chính bảng này.
      await manager.query(
        `
          INSERT INTO group_memberships (global_id, group_id, user_id, role)
          VALUES ($1, $2, $3, $4)
        `,
        [
          params.ownerMembershipId,
          params.globalId,
          params.ownerId,
          GroupMemberRoles.OWNER,
        ],
      );
    });
  }

  public async findMine(userId: string): Promise<IGroupSummary | null> {
    const [row] = await this.entityManager.query<
      {
        group_id: string;
        owner_id: string;
        name: string;
        region_label: string;
        radius_km: string;
        status: GroupStatuses;
        invite_code: string;
        my_role: GroupMemberRoles;
        member_count: string;
      }[]
    >(
      `
        SELECT team.global_id AS group_id,
               team.owner_id,
               team.name,
               team.region_label,
               team.radius_km,
               team.status,
               team.invite_code,
               mine.role AS my_role,
               headcount.total AS member_count
        FROM group_memberships mine
        INNER JOIN groups team ON team.global_id = mine.group_id
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS total
          FROM group_memberships everyone
          WHERE everyone.group_id = team.global_id
        ) headcount
        WHERE mine.user_id = $1
          AND team.deleted_at IS NULL
      `,
      [userId],
    );

    if (!row) return null;

    return {
      groupId: row.group_id,
      ownerId: row.owner_id,
      name: row.name,
      regionLabel: row.region_label,
      radiusKm: Number(row.radius_km),
      status: row.status,
      memberCount: Number(row.member_count),
      // Link mời là cửa vào nhóm — chỉ Owner thấy. Lộ cho thành viên thường là
      // cho họ mời người khác thay Owner.
      inviteCode:
        row.my_role === GroupMemberRoles.OWNER ? row.invite_code : null,
      myRole: row.my_role,
    };
  }

  public async findActiveByInviteCode(
    inviteCode: string,
  ): Promise<{ groupId: string; ownerId: string } | null> {
    const [row] = await this.entityManager.query<
      { global_id: string; owner_id: string }[]
    >(
      `
        SELECT global_id, owner_id FROM groups
        WHERE invite_code = $1
          AND status = $2
          AND deleted_at IS NULL
      `,
      [inviteCode, GroupStatuses.ACTIVE],
    );

    return row ? { groupId: row.global_id, ownerId: row.owner_id } : null;
  }

  public async hasMembership(userId: string): Promise<boolean> {
    const [row] = await this.entityManager.query<{ exists: boolean }[]>(
      `SELECT EXISTS(
         SELECT 1 FROM group_memberships WHERE user_id = $1
       ) AS "exists"`,
      [userId],
    );

    return row?.exists === true;
  }

  public async addMember(params: {
    globalId: string;
    groupId: string;
    userId: string;
  }): Promise<void> {
    await this.entityManager.query(
      `
        INSERT INTO group_memberships (global_id, group_id, user_id, role)
        VALUES ($1, $2, $3, $4)
      `,
      [params.globalId, params.groupId, params.userId, GroupMemberRoles.MEMBER],
    );
  }

  public async createSubTeam(params: {
    globalId: string;
    groupId: string;
    name: string;
  }): Promise<void> {
    await this.entityManager.query(
      `INSERT INTO sub_teams (global_id, group_id, name) VALUES ($1, $2, $3)`,
      [params.globalId, params.groupId, params.name],
    );
  }

  public async listSubTeams(
    groupId: string,
  ): Promise<{ subTeamId: string; name: string; memberCount: number }[]> {
    const rows = await this.entityManager.query<
      { global_id: string; name: string; member_count: string }[]
    >(
      `
        SELECT team.global_id, team.name, headcount.total AS member_count
        FROM sub_teams team
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS total
          FROM group_memberships membership
          WHERE membership.sub_team_id = team.global_id
        ) headcount
        WHERE team.group_id = $1 AND team.deleted_at IS NULL
        ORDER BY team.name ASC
      `,
      [groupId],
    );

    return rows.map((row) => ({
      subTeamId: row.global_id,
      name: row.name,
      memberCount: Number(row.member_count),
    }));
  }

  public async assignMember(params: {
    groupId: string;
    userId: string;
    subTeamId: string | null;
    role: GroupMemberRoles | null;
  }): Promise<boolean> {
    const result = await this.entityManager.query<unknown>(
      `
        UPDATE group_memberships membership
        SET sub_team_id = $3,
            role = COALESCE($4, membership.role),
            updated_at = now()
        WHERE membership.group_id = $1
          AND membership.user_id = $2
          -- KHÔNG đụng tới OWNER: hạ vai chủ nhóm bằng endpoint quản lý thành
          -- viên là để lại một nhóm không ai quản trị được.
          AND membership.role <> $5
          -- Tổ phải thuộc CHÍNH nhóm này. Thiếu vế dưới thì Owner nhóm A xếp
          -- được người của mình vào tổ của nhóm B.
          AND (
            $3::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM sub_teams team
              WHERE team.global_id = $3::uuid
                AND team.group_id = $1
                AND team.deleted_at IS NULL
            )
          )
      `,
      [
        params.groupId,
        params.userId,
        params.subTeamId,
        params.role,
        GroupMemberRoles.OWNER,
      ],
    );

    return Number((result as [unknown[], number])[1] ?? 0) > 0;
  }

  public async listMembers(params: {
    groupId: string;
    skip: number;
    take: number;
  }): Promise<{ items: IGroupMemberItem[]; total: number }> {
    const rows = await this.entityManager.query<
      {
        user_id: string;
        username: string;
        role: GroupMemberRoles;
        sub_team_id: string | null;
        sub_team_name: string | null;
        joined_at: Date;
        total: string;
      }[]
    >(
      `
        SELECT membership.user_id,
               person.username,
               membership.role,
               membership.sub_team_id,
               team.name AS sub_team_name,
               membership.joined_at,
               COUNT(*) OVER () AS total
        FROM group_memberships membership
        INNER JOIN users person ON person.global_id = membership.user_id
        LEFT JOIN sub_teams team ON team.global_id = membership.sub_team_id
        WHERE membership.group_id = $1
        ORDER BY membership.joined_at ASC, membership.id ASC
        LIMIT $2 OFFSET $3
      `,
      [params.groupId, params.take, params.skip],
    );

    return {
      items: rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        role: row.role,
        subTeamId: row.sub_team_id,
        subTeamName: row.sub_team_name,
        joinedAt: row.joined_at,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  public async hasGroupPermission(params: {
    userId: string;
    groupId: string;
    permission: string;
  }): Promise<boolean> {
    // `group_id` nằm trong điều kiện, không phải chỉ ở tham số: quyền nhóm gắn
    // với MỘT nhóm, và bỏ nó ra là biến trưởng nhóm này thành trưởng mọi nhóm.
    const [row] = await this.entityManager.query<{ exists: boolean }[]>(
      `SELECT EXISTS(
         SELECT 1
         FROM group_memberships membership
         INNER JOIN group_role_permissions grant_row
           ON grant_row.role = membership.role
         INNER JOIN groups team ON team.global_id = membership.group_id
         WHERE membership.user_id = $1
           AND membership.group_id = $2
           AND grant_row.permission = $3
           AND team.status = $4
           AND team.deleted_at IS NULL
       ) AS "exists"`,
      [params.userId, params.groupId, params.permission, GroupStatuses.ACTIVE],
    );

    return row?.exists === true;
  }

  public async dissolveOwnedBy(ownerId: string): Promise<number> {
    const result = await this.entityManager.query<unknown[]>(
      `
        UPDATE groups
        SET status = $2, dissolved_at = now(), updated_at = now()
        WHERE owner_id = $1
          AND status = $3
          AND deleted_at IS NULL
      `,
      [ownerId, GroupStatuses.DISSOLVED, GroupStatuses.ACTIVE],
    );

    // TypeORM bọc UPDATE thành `[rows, affected]`; với câu không RETURNING thì
    // phần tử thứ hai là số dòng.
    return Number((result as unknown as [unknown[], number])[1] ?? 0);
  }
}
