import {
  ICreateGroupParams,
  IGroupMemberItem,
  IGroupRepository,
  IGroupSummary,
} from '@/domain/ports/repository';
import {
  GroupMemberRoles,
  GroupMembershipStatuses,
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
          -- Chỉ đếm người ĐANG trong nhóm. Đếm cả dòng lịch sử thì một nhóm đã
          -- giải tán rồi lập lại vẫn khoe số cũ.
          SELECT COUNT(*)::text AS total
          FROM group_memberships everyone
          WHERE everyone.group_id = team.global_id
            AND everyone.status = $2
        ) headcount
        WHERE mine.user_id = $1
          -- Membership ĐANG HIỆU LỰC, không phải dòng lịch sử. Thiếu vế này thì
          -- sau khi nhóm giải tán, màn hình Nhóm của tôi vẫn hiện nhóm đã chết
          -- và ẩn nút Tạo nhóm — người dùng kẹt mà không hiểu vì sao.
          AND mine.status = $2
          AND team.deleted_at IS NULL
      `,
      [userId, GroupMembershipStatuses.ACTIVE],
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
      // `status` chứ không phải chỉ `user_id`: dòng của một nhóm đã giải tán là
      // LỊCH SỬ, không phải "đang có nhóm". Thiếu vế này thì thành viên của nhóm
      // đã giải tán không lập được nhóm mới, mà cũng không vào được nhóm nào
      // khác — đường duy nhất để vào là link mời cho tài khoản MỚI.
      `SELECT EXISTS(
         SELECT 1 FROM group_memberships
         WHERE user_id = $1 AND status = $2
       ) AS "exists"`,
      [userId, GroupMembershipStatuses.ACTIVE],
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

  public async findMembership(params: {
    userId: string;
    groupId: string;
  }): Promise<{ role: GroupMemberRoles; subTeamId: string | null } | null> {
    const [row] = await this.entityManager.query<
      { role: GroupMemberRoles; sub_team_id: string | null }[]
    >(
      `
        SELECT role, sub_team_id FROM group_memberships
        WHERE user_id = $1 AND group_id = $2 AND status = $3
      `,
      [params.userId, params.groupId, GroupMembershipStatuses.ACTIVE],
    );

    return row ? { role: row.role, subTeamId: row.sub_team_id } : null;
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

  public async listSubTeams(params: {
    groupId: string;
    subTeamId?: string | null;
  }): Promise<{ subTeamId: string; name: string; memberCount: number }[]> {
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
            AND membership.status = $2
        ) headcount
        WHERE team.group_id = $1 AND team.deleted_at IS NULL
          -- Trưởng tổ chỉ thấy tổ mình. Cả danh sách tổ là cấu trúc nhóm, và
          -- quyền của họ nói "tổ mình" chứ không nói "mọi tổ".
          AND ($3::uuid IS NULL OR team.global_id = $3::uuid)
        ORDER BY team.name ASC
      `,
      [
        params.groupId,
        GroupMembershipStatuses.ACTIVE,
        params.subTeamId ?? null,
      ],
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
    /** `undefined` = giữ tổ hiện tại, `null` = gỡ khỏi tổ. */
    subTeamId?: string | null;
    role: GroupMemberRoles | null;
  }): Promise<boolean> {
    // `undefined` và `null` là HAI Ý khác nhau, và trước đây chúng bị trộn: câu
    // `SET sub_team_id = $3` chạy vô điều kiện, còn controller đổi "không gửi"
    // thành `null`. Nên gọi endpoint chỉ để đổi vai sẽ âm thầm GỠ người đó khỏi
    // tổ — nghịch lý nhất là phong SUBTEAM_ADMIN cho ai thì gỡ họ khỏi đúng cái
    // tổ họ sắp quản.
    const changesSubTeam = params.subTeamId !== undefined;
    const subTeamId = params.subTeamId ?? null;

    const result = await this.entityManager.query<unknown>(
      `
        UPDATE group_memberships membership
        SET sub_team_id = CASE WHEN $6 THEN $3::uuid ELSE membership.sub_team_id END,
            role = COALESCE($4, membership.role),
            updated_at = now()
        WHERE membership.group_id = $1
          AND membership.user_id = $2
          -- Dòng lịch sử của một nhóm đã giải tán không xếp lại tổ được.
          AND membership.status = $7
          -- KHÔNG đụng tới OWNER: hạ vai chủ nhóm bằng endpoint quản lý thành
          -- viên là để lại một nhóm không ai quản trị được.
          AND membership.role <> $5
          -- Tổ phải thuộc CHÍNH nhóm này. Thiếu vế dưới thì Owner nhóm A xếp
          -- được người của mình vào tổ của nhóm B.
          -- Chỉ kiểm khi thật sự đổi tổ — kiểm cả lúc giữ nguyên thì một tổ vừa
          -- bị xoá làm mọi lượt đổi vai của người trong tổ đó thất bại.
          AND (
            NOT $6
            OR $3::uuid IS NULL
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
        subTeamId,
        params.role,
        GroupMemberRoles.OWNER,
        changesSubTeam,
        GroupMembershipStatuses.ACTIVE,
      ],
    );

    return Number((result as [unknown[], number])[1] ?? 0) > 0;
  }

  public async listMembers(params: {
    groupId: string;
    /** Chỉ thành viên của tổ này. Dành cho trưởng tổ — họ chỉ thấy tổ mình. */
    subTeamId?: string | null;
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
          AND membership.status = $4
          -- $5 rỗng nghĩa là KHÔNG lọc, không phải "lọc người chưa có tổ".
          -- Trưởng tổ chưa được xếp vào tổ nào thì use case chặn từ trên, không
          -- để rơi xuống đây thành "xem được mọi người chưa có tổ".
          AND ($5::uuid IS NULL OR membership.sub_team_id = $5::uuid)
        ORDER BY membership.joined_at ASC, membership.id ASC
        LIMIT $2 OFFSET $3
      `,
      [
        params.groupId,
        params.take,
        params.skip,
        GroupMembershipStatuses.ACTIVE,
        params.subTeamId ?? null,
      ],
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
           AND membership.status = $5
           AND team.deleted_at IS NULL
       ) AS "exists"`,
      [
        params.userId,
        params.groupId,
        params.permission,
        GroupStatuses.ACTIVE,
        GroupMembershipStatuses.ACTIVE,
      ],
    );

    return row?.exists === true;
  }

  public async dissolveOwnedBy(ownerId: string): Promise<number> {
    // Hai câu trong CÙNG transaction. Tách ra thì một lần chết giữa chừng để lại
    // nhóm DISSOLVED mà membership vẫn ACTIVE — và mọi thành viên cũ bị khoá
    // ngoài vĩnh viễn, đúng lỗi mà cột `status` sinh ra để sửa.
    return this.entityManager.transaction(async (manager) => {
      const result = await manager.query<unknown[]>(
        `
          UPDATE groups
          SET status = $2, dissolved_at = now(), updated_at = now()
          WHERE owner_id = $1
            AND status = $3
            AND deleted_at IS NULL
        `,
        [ownerId, GroupStatuses.DISSOLVED, GroupStatuses.ACTIVE],
      );

      // Dòng membership Ở LẠI, chỉ thôi hiệu lực — CHỐT-02 yêu cầu giữ lịch sử,
      // còn ràng buộc "mỗi người một nhóm" nay chỉ tính dòng ACTIVE, nên thành
      // viên cũ lập được nhóm mới.
      await manager.query(
        `
          UPDATE group_memberships membership
          SET status = $2, updated_at = now()
          WHERE membership.status = $3
            AND EXISTS (
              SELECT 1 FROM groups team
              WHERE team.global_id = membership.group_id
                AND team.owner_id = $1
                AND team.status = $4
            )
        `,
        [
          ownerId,
          GroupMembershipStatuses.DISSOLVED,
          GroupMembershipStatuses.ACTIVE,
          GroupStatuses.DISSOLVED,
        ],
      );

      // TypeORM bọc UPDATE thành `[rows, affected]`; với câu không RETURNING thì
      // phần tử thứ hai là số dòng.
      return Number((result as unknown as [unknown[], number])[1] ?? 0);
    });
  }
}
