import {
  IAdminUserDeletion,
  IAdminUserPage,
  IAdminUserQuery,
  IAdminUserRepository,
  IAdminUserStatusChange,
  IAdminUserSummary,
} from '@/domain/ports/repository';
import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IUserRow {
  global_id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  rank: UserRanks;
  status: UserStatuses;
  phone_verified_at: Date | null;
  suspended_until: Date | null;
  created_at: Date;
  deleted_at: Date | null;
  admin_roles: string[] | null;
}

/**
 * Cố ý KHÔNG có `password_hash` trong danh sách cột.
 *
 * Hash không cần cho bất kỳ màn quản trị nào, nên cách an toàn nhất là không
 * đọc nó ra khỏi database — không có biến nào cầm nó thì không chỗ nào lỡ trả
 * nó ra.
 */
const SelectColumns = `
  user_account.global_id,
  user_account.username,
  user_account.full_name,
  user_account.email,
  user_account.phone,
  user_account.rank,
  user_account.status,
  user_account.phone_verified_at,
  user_account.suspended_until,
  user_account.created_at,
  user_account.deleted_at,
  ARRAY_REMOVE(ARRAY_AGG(role.code), NULL) AS admin_roles
`;

const RoleJoin = `
  LEFT JOIN admin_user_roles user_role ON user_role.user_id = user_account.global_id
  LEFT JOIN admin_roles role ON role.id = user_role.role_id
`;

const GroupBy = `
  GROUP BY user_account.global_id, user_account.username, user_account.full_name,
           user_account.email, user_account.phone, user_account.rank,
           user_account.status, user_account.phone_verified_at,
           user_account.suspended_until, user_account.created_at,
           user_account.deleted_at
`;

function toSummary(row: IUserRow): IAdminUserSummary {
  return {
    userId: row.global_id,
    username: row.username,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    rank: row.rank,
    status: row.status,
    phoneVerified: row.phone_verified_at !== null,
    suspendedUntil: row.suspended_until,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    adminRoles: row.admin_roles ?? [],
  };
}

@Injectable()
export class AdminUserRepository implements IAdminUserRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async search(query: IAdminUserQuery): Promise<IAdminUserPage> {
    const conditions: string[] = [];
    const filters: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      if (value === undefined) return;

      filters.push(value);
      conditions.push(sql.replaceAll('$?', `$${filters.length}`));
    };

    add('user_account.username ILIKE $?', this.contains(query.username));
    add('user_account.email ILIKE $?', this.contains(query.email));
    add('user_account.phone ILIKE $?', this.contains(query.phone));
    add('user_account.rank = $?', query.rank);
    add('user_account.status = $?', query.status);
    add('user_account.created_at >= $?', query.registeredFrom);
    add('user_account.created_at <= $?', query.registeredTo);

    if (query.phoneVerified !== undefined)
      conditions.push(
        query.phoneVerified
          ? 'user_account.phone_verified_at IS NOT NULL'
          : 'user_account.phone_verified_at IS NULL',
      );

    if (query.adminRole !== undefined) {
      filters.push(query.adminRole);
      conditions.push(`EXISTS (
        SELECT 1 FROM admin_user_roles filter_role
        INNER JOIN admin_roles filter_role_def ON filter_role_def.id = filter_role.role_id
        WHERE filter_role.user_id = user_account.global_id
          AND filter_role_def.code = $${filters.length}
      )`);
    }

    // Mặc định ẩn tài khoản đã xoá; chỉ hiện khi được hỏi rõ.
    if (!query.includeDeleted)
      conditions.push('user_account.deleted_at IS NULL');

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.manager.query<IUserRow[]>(
      `
        SELECT ${SelectColumns}
        FROM users user_account
        ${RoleJoin}
        ${where}
        ${GroupBy}
        ORDER BY user_account.created_at DESC
        LIMIT $${filters.length + 1} OFFSET $${filters.length + 2}
      `,
      [...filters, query.take, query.skip],
    );

    // Đếm không join role: join làm nhân dòng và tổng sẽ sai theo số role.
    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM users user_account ${where}`,
      filters,
    );

    return { entries: rows.map(toSummary), total: Number(total) };
  }

  public async findOne(userId: string): Promise<IAdminUserSummary | null> {
    const [row] = await this.manager.query<IUserRow[]>(
      `
        SELECT ${SelectColumns}
        FROM users user_account
        ${RoleJoin}
        WHERE user_account.global_id = $1
        ${GroupBy}
      `,
      [userId],
    );

    return row ? toSummary(row) : null;
  }

  public async changeStatus(
    change: IAdminUserStatusChange,
  ): Promise<IAdminUserSummary> {
    return this.manager.transaction(async (manager) => {
      // Chỉ đụng trạng thái. Hạng đi qua rank writer, điểm đi qua ledger —
      // sửa thẳng ở đây là phá đường kiểm toán của cả hai.
      const updated = await updateReturning<IUserRow>(
        manager,
        `
          UPDATE users
          SET status = $2, suspended_until = $3, updated_at = now()
          WHERE global_id = $1 AND deleted_at IS NULL
          RETURNING global_id
        `,
        [change.targetUserId, change.status, change.suspendedUntil],
      );

      // Không khớp dòng nào thì KHÔNG ghi audit: một bản ghi "đã đổi trạng
      // thái" cho lần đổi chưa từng xảy ra làm hỏng chính thứ mà audit dùng để
      // trả lời — ai đã làm gì.
      if (updated.length === 0)
        return this.requireUser(manager, change.targetUserId);

      await this.writeAudit(manager, 'CHANGE_STATUS', {
        actorUserId: change.actorUserId,
        targetUserId: change.targetUserId,
        reason: change.reason,
        after: {
          status: change.status,
          suspendedUntil: change.suspendedUntil,
        },
      });

      return this.requireUser(manager, change.targetUserId);
    });
  }

  public async softDelete(
    deletion: IAdminUserDeletion,
  ): Promise<IAdminUserSummary> {
    return this.manager.transaction(async (manager) => {
      // Ẩn danh dữ liệu cá nhân nhưng GIỮ username: thả tên ra là người khác
      // đăng ký lại đúng tên đó để mạo danh.
      const deleted = await updateReturning<IUserRow>(
        manager,
        `
          UPDATE users
          SET deleted_at = now(),
              status = 'BANNED',
              email = NULL,
              phone = NULL,
              full_name = NULL,
              avatar_url = NULL,
              default_location = NULL,
              phone_verified_at = NULL,
              updated_at = now()
          WHERE global_id = $1 AND deleted_at IS NULL
          RETURNING global_id
        `,
        [deletion.targetUserId],
      );

      // Chỉ ghi audit khi thực sự có dòng bị xoá mềm. Gọi lại trên tài khoản
      // đã xoá sẽ không khớp dòng nào, và một bản ghi DELETE_USER thứ hai làm
      // audit kể sai số lần.
      if (deleted.length > 0)
        await this.writeAudit(manager, 'DELETE_USER', {
          actorUserId: deletion.actorUserId,
          targetUserId: deletion.targetUserId,
          reason: deletion.reason,
          after: { deleted: true },
        });

      return this.requireUser(manager, deletion.targetUserId);
    });
  }

  private contains(value: string | undefined): string | undefined {
    return value === undefined ? undefined : `%${value}%`;
  }

  private async requireUser(
    manager: EntityManager,
    userId: string,
  ): Promise<IAdminUserSummary> {
    const [row] = await manager.query<IUserRow[]>(
      `
        SELECT ${SelectColumns}
        FROM users user_account
        ${RoleJoin}
        WHERE user_account.global_id = $1
        ${GroupBy}
      `,
      [userId],
    );

    return toSummary(row);
  }

  private async writeAudit(
    manager: EntityManager,
    action: 'CHANGE_STATUS' | 'DELETE_USER',
    params: {
      actorUserId: string;
      targetUserId: string;
      reason: string;
      after: unknown;
    },
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, after_json, reason)
        VALUES ($1, $2, 'USER', $3, $4::jsonb, $5)
      `,
      [
        params.actorUserId,
        action,
        params.targetUserId,
        JSON.stringify(params.after),
        params.reason,
      ],
    );
  }
}
