import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm hạn mức quét bài theo hạng vào policy đang hiệu lực.
 *
 * Đơn vị là mét. Đây là bán kính discovery của cá nhân, không liên quan tới
 * `CREATE_GROUP.limit_value` (bán kính hoạt động của nhóm).
 */
export class SeedDiscoveryRadiusEntitlement1794700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH active_revision AS (
        SELECT id
        FROM config_revisions
        WHERE scope = 'ENTITLEMENT'
          AND status = 'PUBLISHED'
          AND effective_from <= now()
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY effective_from DESC
        LIMIT 1
      )
      INSERT INTO capability_policies (revision_id, code, enabled)
      SELECT id, 'DISCOVERY_RADIUS', true
      FROM active_revision
      ON CONFLICT (revision_id, code) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO capability_rank_values (policy_id, "rank", allowed, limit_value)
      SELECT policy.id, baseline."rank"::users_rank_enum, true, baseline.limit_value
      FROM capability_policies policy
      INNER JOIN config_revisions revision ON revision.id = policy.revision_id
      CROSS JOIN (VALUES
        ('VIEWER', 5000),
        ('MEMBER', 10000),
        ('SILVER', 20000),
        ('GOLD', 30000),
        ('DIAMOND', 50000)
      ) AS baseline("rank", limit_value)
      WHERE policy.code = 'DISCOVERY_RADIUS'
        AND revision.scope = 'ENTITLEMENT'
        AND revision.status = 'PUBLISHED'
        AND revision.effective_from <= now()
        AND (revision.effective_to IS NULL OR revision.effective_to > now())
        AND NOT EXISTS (
          SELECT 1 FROM capability_rank_values existing
          WHERE existing.policy_id = policy.id
            AND existing."rank" = baseline."rank"::users_rank_enum
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM capability_rank_values
      WHERE policy_id IN (
        SELECT id FROM capability_policies WHERE code = 'DISCOVERY_RADIUS'
      )
    `);
    await queryRunner.query(
      `DELETE FROM capability_policies WHERE code = 'DISCOVERY_RADIUS'`,
    );
  }
}
