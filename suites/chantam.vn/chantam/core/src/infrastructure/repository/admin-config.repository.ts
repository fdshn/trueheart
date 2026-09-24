import { LastSuperAdminException } from '@/domain/exceptions';
import {
  IAdminAccessSummary,
  IAdminAuditPage,
  IAdminAuditQuery,
  IAdminConfigRepository,
  IAdminPointRule,
  IAdminRankTierPolicy,
  IAdminRoleAssignment,
  IAdminRoleSummary,
  IPublishAdminMaintenancePolicyCommand,
  IPublishAdminPointRuleCommand,
  IPublishAdminRankPolicyCommand,
  IPublishSystemConfigCommand,
  ISystemConfigSummary,
} from '@/domain/ports/repository';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IConfigRow {
  id: string;
  config_key: string;
  value_json: unknown;
  value_type: string;
  version: string;
  effective_from: Date;
  is_sensitive: boolean;
}

interface IRankPolicyRow {
  rank: IAdminRankTierPolicy['rank'];
  threshold_points: string;
  warning_points: string;
  required_gifts: string;
  required_referrals: string;
  maintenance_gifts: string;
  maintenance_referrals: string;
  maintenance_penalty_points: string;
  version: string;
}

function mapRankPolicy(row: IRankPolicyRow): IAdminRankTierPolicy {
  return {
    rank: row.rank,
    thresholdPoints: Number(row.threshold_points),
    warningPoints: Number(row.warning_points),
    requiredGifts: Number(row.required_gifts),
    requiredReferrals: Number(row.required_referrals),
    maintenanceGifts: Number(row.maintenance_gifts),
    maintenanceReferrals: Number(row.maintenance_referrals),
    maintenancePenaltyPoints: Number(row.maintenance_penalty_points),
    version: Number(row.version),
  };
}

interface IPointRuleRow {
  code: string;
  points: number;
  is_enabled: boolean;
  affects_lifetime: boolean;
  daily_cap: number | null;
  version: number;
  updated_at: Date;
}

function mapPointRule(row: IPointRuleRow): IAdminPointRule {
  return {
    code: row.code,
    points: Number(row.points),
    enabled: row.is_enabled,
    affectsLifetime: row.affects_lifetime,
    dailyCap: row.daily_cap === null ? null : Number(row.daily_cap),
    version: Number(row.version),
    updatedAt: row.updated_at,
  };
}

function mapConfig(row: IConfigRow): ISystemConfigSummary {
  return {
    id: Number(row.id),
    key: row.config_key,
    value: row.is_sensitive ? null : row.value_json,
    valueType: row.value_type,
    version: Number(row.version),
    effectiveFrom: row.effective_from,
    sensitive: row.is_sensitive,
  };
}

@Injectable()
export class AdminConfigRepository implements IAdminConfigRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async hasPermission(
    userId: string,
    permission: string,
  ): Promise<boolean> {
    const rows = await this.manager.query<{ allowed: boolean }[]>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM admin_user_roles user_role
          INNER JOIN admin_roles role ON role.id = user_role.role_id
          INNER JOIN admin_role_permissions role_permission ON role_permission.role_id = role.id
          INNER JOIN admin_permissions permission ON permission.id = role_permission.permission_id
          INNER JOIN users user_account ON user_account.global_id = user_role.user_id
          WHERE user_role.user_id = $1
            AND user_account.status = 'ACTIVE'
            AND user_account.deleted_at IS NULL
            AND role.is_active = true
            AND permission.code = $2
        ) AS allowed
      `,
      [userId, permission],
    );
    return rows[0]?.allowed === true;
  }

  public async getConfigValue(key: string): Promise<unknown> {
    // Cùng bộ điều kiện với `getPublishedConfigs`: bản đang hiệu lực NGAY BÂY
    // GIỜ. Thiếu `effective_from <= now()` là đọc trúng bản hẹn giờ chưa tới
    // hạn, tức áp chính sách trước ngày Admin đã chọn.
    const [row] = await this.manager.query<{ value_json: unknown }[]>(
      `
        SELECT value_json
        FROM system_configs
        WHERE config_key = $1
          AND status = 'PUBLISHED'
          AND effective_from <= now()
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY version DESC
        LIMIT 1
      `,
      [key],
    );

    return row?.value_json ?? null;
  }

  public async getAccess(userId: string): Promise<IAdminAccessSummary> {
    const [row] = await this.manager.query<
      { roles: string[] | null; permissions: string[] | null }[]
    >(
      `
        SELECT
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT role.code), NULL) AS roles,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT permission.code), NULL) AS permissions
        FROM users user_account
        LEFT JOIN admin_user_roles user_role
          ON user_role.user_id = user_account.global_id
        LEFT JOIN admin_roles role
          ON role.id = user_role.role_id AND role.is_active = true
        LEFT JOIN admin_role_permissions role_permission
          ON role_permission.role_id = role.id
        LEFT JOIN admin_permissions permission
          ON permission.id = role_permission.permission_id
        WHERE user_account.global_id = $1
          AND user_account.status = 'ACTIVE'
          AND user_account.deleted_at IS NULL
        GROUP BY user_account.global_id
      `,
      [userId],
    );

    return {
      roles: row?.roles ?? [],
      permissions: row?.permissions ?? [],
    };
  }

  public async appendAudit(command: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    before: unknown;
    after: unknown;
    reason?: string;
  }): Promise<void> {
    await this.manager.query(
      `INSERT INTO admin_audit_logs
        (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        command.actorUserId,
        command.action,
        command.resourceType,
        command.resourceId,
        JSON.stringify(command.before),
        JSON.stringify(command.after),
        command.reason ?? null,
      ],
    );
  }

  public async getPublishedConfigs(): Promise<ISystemConfigSummary[]> {
    const rows = await this.manager.query<IConfigRow[]>(
      `
        SELECT DISTINCT ON (config_key)
          id, config_key, value_json, value_type, version,
          effective_from, is_sensitive
        FROM system_configs
        WHERE status = 'PUBLISHED'
          AND effective_from <= now()
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY config_key ASC, version DESC
      `,
    );
    return rows.map(mapConfig);
  }

  public async getRankPolicy(): Promise<IAdminRankTierPolicy[]> {
    const rows = await this.manager.query<IRankPolicyRow[]>(`
      SELECT rank, threshold_points, warning_points, required_gifts,
             required_referrals, maintenance_gifts, maintenance_referrals,
               maintenance_penalty_points, version
      FROM rank_tiers
      ORDER BY CASE rank
        WHEN 'VIEWER' THEN 1 WHEN 'MEMBER' THEN 2 WHEN 'SILVER' THEN 3
        WHEN 'GOLD' THEN 4 WHEN 'DIAMOND' THEN 5 END
    `);
    return rows.map(mapRankPolicy);
  }

  public async publishRankPolicy(
    command: IPublishAdminRankPolicyCommand,
  ): Promise<IAdminRankTierPolicy[]> {
    return this.manager.transaction(async (manager) => {
      const beforeRows = await manager.query<IRankPolicyRow[]>(`
        SELECT rank, threshold_points, warning_points, required_gifts,
               required_referrals, maintenance_gifts, maintenance_referrals,
               maintenance_penalty_points, version
        FROM rank_tiers
        ORDER BY CASE rank
          WHEN 'VIEWER' THEN 1 WHEN 'MEMBER' THEN 2 WHEN 'SILVER' THEN 3
          WHEN 'GOLD' THEN 4 WHEN 'DIAMOND' THEN 5 END
        FOR UPDATE
      `);
      const before = beforeRows.map(mapRankPolicy);

      for (const tier of command.tiers) {
        await manager.query(
          `UPDATE rank_tiers
           SET threshold_points = $2, warning_points = $3, required_gifts = $4,
               required_referrals = $5, version = version + 1
           WHERE rank = $1`,
          [
            tier.rank,
            tier.thresholdPoints,
            tier.warningPoints,
            tier.requiredGifts,
            tier.requiredReferrals,
          ],
        );
      }

      const afterRows = await manager.query<IRankPolicyRow[]>(`
        SELECT rank, threshold_points, warning_points, required_gifts,
               required_referrals, maintenance_gifts, maintenance_referrals,
               maintenance_penalty_points, version
        FROM rank_tiers
        ORDER BY CASE rank
          WHEN 'VIEWER' THEN 1 WHEN 'MEMBER' THEN 2 WHEN 'SILVER' THEN 3
          WHEN 'GOLD' THEN 4 WHEN 'DIAMOND' THEN 5 END
      `);
      const after = afterRows.map(mapRankPolicy);
      await manager.query(
        `INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, 'PUBLISH_RANK_POLICY', 'RANK_POLICY', 'rank-tiers', $2::jsonb, $3::jsonb, $4)`,
        [
          command.actorUserId,
          JSON.stringify(before),
          JSON.stringify(after),
          command.changeReason,
        ],
      );
      return after;
    });
  }

  public async getPointRules(): Promise<IAdminPointRule[]> {
    const rows = await this.manager.query<IPointRuleRow[]>(`
      SELECT DISTINCT ON (code)
        code, points, is_enabled, affects_lifetime, daily_cap, version, updated_at
      FROM point_rules
      ORDER BY code ASC, version DESC
    `);
    return rows.map(mapPointRule);
  }

  public async publishPointRule(
    command: IPublishAdminPointRuleCommand,
  ): Promise<IAdminPointRule> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<IPointRuleRow[]>(
        `SELECT code, points, is_enabled, affects_lifetime, daily_cap, version, updated_at
         FROM point_rules WHERE code = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [command.rule.code],
      );
      const [inserted] = await manager.query<IPointRuleRow[]>(
        `INSERT INTO point_rules
          (code, points, is_enabled, affects_lifetime, daily_cap, version, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING code, points, is_enabled, affects_lifetime, daily_cap, version, updated_at`,
        [
          command.rule.code,
          command.rule.points,
          command.rule.enabled,
          command.rule.affectsLifetime,
          command.rule.dailyCap,
          Number(current.version) + 1,
          command.actorUserId,
        ],
      );
      const after = mapPointRule(inserted);
      await manager.query(
        `INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, 'PUBLISH_POINT_RULE', 'POINT_RULE', $2, $3::jsonb, $4::jsonb, $5)`,
        [
          command.actorUserId,
          command.rule.code,
          JSON.stringify(mapPointRule(current)),
          JSON.stringify(after),
          command.changeReason,
        ],
      );
      return after;
    });
  }

  public async publishMaintenancePolicy(
    command: IPublishAdminMaintenancePolicyCommand,
  ): Promise<IAdminRankTierPolicy[]> {
    return this.manager.transaction(async (manager) => {
      const beforeRows = await manager.query<IRankPolicyRow[]>(`
        SELECT rank, threshold_points, warning_points, required_gifts,
               required_referrals, maintenance_gifts, maintenance_referrals,
               maintenance_penalty_points, version
        FROM rank_tiers
        ORDER BY CASE rank
          WHEN 'VIEWER' THEN 1 WHEN 'MEMBER' THEN 2 WHEN 'SILVER' THEN 3
          WHEN 'GOLD' THEN 4 WHEN 'DIAMOND' THEN 5 END
        FOR UPDATE
      `);
      const before = beforeRows.map(mapRankPolicy);
      for (const tier of command.tiers) {
        await manager.query(
          `UPDATE rank_tiers
           SET maintenance_gifts = $2, maintenance_referrals = $3,
               maintenance_penalty_points = $4, version = version + 1
           WHERE rank = $1`,
          [
            tier.rank,
            tier.maintenanceGifts,
            tier.maintenanceReferrals,
            tier.maintenancePenaltyPoints,
          ],
        );
      }
      const afterRows = await manager.query<IRankPolicyRow[]>(`
        SELECT rank, threshold_points, warning_points, required_gifts,
               required_referrals, maintenance_gifts, maintenance_referrals,
               maintenance_penalty_points, version
        FROM rank_tiers
        ORDER BY CASE rank
          WHEN 'VIEWER' THEN 1 WHEN 'MEMBER' THEN 2 WHEN 'SILVER' THEN 3
          WHEN 'GOLD' THEN 4 WHEN 'DIAMOND' THEN 5 END
      `);
      const after = afterRows.map(mapRankPolicy);
      await manager.query(
        `INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, 'PUBLISH_MAINTENANCE_POLICY', 'RANK_MAINTENANCE_POLICY',
                 'rank-tiers', $2::jsonb, $3::jsonb, $4)`,
        [
          command.actorUserId,
          JSON.stringify(before),
          JSON.stringify(after),
          command.changeReason,
        ],
      );
      return after;
    });
  }

  public async publishSystemConfig(
    command: IPublishSystemConfigCommand,
  ): Promise<ISystemConfigSummary> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<
        {
          version: string;
          id: string;
          value_json: unknown;
          value_type: string;
          is_sensitive: boolean;
        }[]
      >(
        `
          SELECT version, id, value_json, value_type, is_sensitive
          FROM system_configs
          WHERE config_key = $1 AND status = 'PUBLISHED' AND effective_to IS NULL
          ORDER BY version DESC
          LIMIT 1
          FOR UPDATE
        `,
        [command.key],
      );
      const now = new Date();
      if (current)
        await manager.query(
          `UPDATE system_configs SET effective_to = $2 WHERE id = $1`,
          [current.id, now],
        );
      const [inserted] = await manager.query<IConfigRow[]>(
        `
          INSERT INTO system_configs
            (config_key, value_json, value_type, version, status, effective_from, updated_by, change_reason)
          VALUES ($1, $2::jsonb, $3, $4, 'PUBLISHED', $5, $6, $7)
          RETURNING id, config_key, value_json, value_type, version, effective_from, is_sensitive
        `,
        [
          command.key,
          JSON.stringify(command.value),
          command.valueType,
          Number(current?.version ?? 0) + 1,
          now,
          command.actorUserId,
          command.reason,
        ],
      );
      await manager.query(
        `
          INSERT INTO admin_audit_logs
            (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
          VALUES ($1, 'PUBLISH', 'SYSTEM_CONFIG', $2, $3::jsonb, $4::jsonb, $5)
        `,
        [
          command.actorUserId,
          command.key,
          JSON.stringify(current?.value_json ?? null),
          JSON.stringify(command.value),
          command.reason,
        ],
      );
      return mapConfig(inserted);
    });
  }

  public async listRoles(): Promise<IAdminRoleSummary[]> {
    const rows = await this.manager.query<
      {
        code: string;
        name: string;
        is_active: boolean;
        permissions: string[] | null;
      }[]
    >(
      `
        SELECT role.code, role.name, role.is_active,
               ARRAY_REMOVE(ARRAY_AGG(permission.code), NULL) AS permissions
        FROM admin_roles role
        LEFT JOIN admin_role_permissions role_permission
          ON role_permission.role_id = role.id
        LEFT JOIN admin_permissions permission
          ON permission.id = role_permission.permission_id
        GROUP BY role.code, role.name, role.is_active
        ORDER BY role.code ASC
      `,
    );

    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      isActive: row.is_active,
      permissions: row.permissions ?? [],
    }));
  }

  public async grantRole(assignment: IAdminRoleAssignment): Promise<void> {
    await this.manager.transaction(async (manager) => {
      const granted = await manager.query<{ user_id: string }[]>(
        `
          INSERT INTO admin_user_roles (user_id, role_id, assigned_by)
          SELECT $1, role.id, $3
          FROM admin_roles role
          INNER JOIN users user_account ON user_account.global_id = $1
          WHERE role.code = $2
            AND role.is_active = true
            AND user_account.deleted_at IS NULL
          ON CONFLICT (user_id, role_id) DO NOTHING
          RETURNING user_id
        `,
        [assignment.targetUserId, assignment.roleCode, assignment.actorUserId],
      );

      // Không có dòng nào: role không tồn tại, tài khoản không hợp lệ, hoặc đã
      // có sẵn. Cả ba đều không phải lỗi hệ thống, nhưng cũng không ghi audit
      // một thay đổi đã không xảy ra.
      if (granted.length === 0) return;

      await this.writeRoleAudit(manager, 'GRANT_ROLE', assignment);
    });
  }

  public async revokeRole(assignment: IAdminRoleAssignment): Promise<void> {
    await this.manager.transaction(async (manager) => {
      // Khoá bảng gán role trong transaction: hai lượt thu hồi song song có thể
      // cùng thấy "còn 2 người" rồi cùng xoá, và hệ thống mất sạch SUPER_ADMIN.
      const [remaining] = await manager.query<{ total: string }[]>(
        `
          SELECT COUNT(*) AS total
          FROM admin_user_roles user_role
          INNER JOIN admin_roles role ON role.id = user_role.role_id
          WHERE role.code = 'SUPER_ADMIN'
          FOR UPDATE OF user_role
        `,
      );

      if (
        assignment.roleCode === 'SUPER_ADMIN' &&
        Number(remaining?.total ?? 0) <= 1
      )
        throw new LastSuperAdminException();

      const revoked = await updateReturning<{ user_id: string }>(
        manager,
        `
          DELETE FROM admin_user_roles
          USING admin_roles role
          WHERE admin_user_roles.role_id = role.id
            AND admin_user_roles.user_id = $1
            AND role.code = $2
          RETURNING admin_user_roles.user_id
        `,
        [assignment.targetUserId, assignment.roleCode],
      );

      if (revoked.length === 0) return;

      await this.writeRoleAudit(manager, 'REVOKE_ROLE', assignment);
    });
  }

  private async writeRoleAudit(
    manager: EntityManager,
    action: 'GRANT_ROLE' | 'REVOKE_ROLE',
    assignment: IAdminRoleAssignment,
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, after_json, reason)
        VALUES ($1, $2, 'ADMIN_ROLE', $3, $4::jsonb, $5)
      `,
      [
        assignment.actorUserId,
        action,
        assignment.targetUserId,
        JSON.stringify({ roleCode: assignment.roleCode }),
        assignment.reason,
      ],
    );
  }

  public async getAuditLogs(query: IAdminAuditQuery): Promise<IAdminAuditPage> {
    // Dựng điều kiện theo đúng những trường được truyền. Ghép sẵn `= ''` cho
    // trường bỏ trống thì danh sách trả về rỗng trong khi audit vẫn có dữ liệu.
    const conditions: string[] = [];
    const filters: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      if (value === undefined) return;

      filters.push(value);
      conditions.push(sql.replace('$?', `$${filters.length}`));
    };

    add('actor_user_id = $?', query.actorUserId);
    add('action = $?', query.action);
    add('resource_type = $?', query.resourceType);
    add('created_at >= $?', query.from);
    add('created_at <= $?', query.to);

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.manager.query<
      {
        id: string;
        actor_user_id: string | null;
        action: string;
        resource_type: string;
        resource_id: string | null;
        reason: string | null;
        created_at: Date;
      }[]
    >(
      `
        SELECT id, actor_user_id, action, resource_type, resource_id, reason, created_at
        FROM admin_audit_logs
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${filters.length + 1} OFFSET $${filters.length + 2}
      `,
      [...filters, query.take, query.skip],
    );

    // Đếm bằng CHÍNH bộ lọc đó. Lệch điều kiện là số trang sai.
    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM admin_audit_logs ${where}`,
      filters,
    );

    return {
      entries: rows.map((row) => ({
        id: Number(row.id),
        actorUserId: row.actor_user_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        reason: row.reason,
        createdAt: row.created_at,
      })),
      total: Number(total),
    };
  }
}
