import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemConfigAdminAudit1790200000000 implements MigrationInterface {
  name = 'CreateSystemConfigAdminAudit1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "system_configs" (
        "id" BIGSERIAL NOT NULL,
        "config_key" varchar(150) NOT NULL,
        "value_json" jsonb NOT NULL,
        "value_type" varchar(30) NOT NULL,
        "version" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PUBLISHED',
        "effective_from" timestamptz NOT NULL DEFAULT now(),
        "effective_to" timestamptz,
        "is_sensitive" boolean NOT NULL DEFAULT false,
        "updated_by" uuid,
        "change_reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_system_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_system_configs_key_version" UNIQUE ("config_key", "version"),
        CONSTRAINT "FK_system_configs_updated_by" FOREIGN KEY ("updated_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_system_configs_status" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
        CONSTRAINT "CHK_system_configs_value_type" CHECK ("value_type" IN ('BOOLEAN', 'INTEGER', 'DECIMAL', 'STRING', 'JSON')),
        CONSTRAINT "CHK_system_configs_dates" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "system_configs"
      ADD CONSTRAINT "EX_system_configs_published_window"
      EXCLUDE USING gist (
        "config_key" WITH =,
        tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&
      ) WHERE ("status" = 'PUBLISHED')
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_roles" (
        "id" BIGSERIAL NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(150) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_admin_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_roles_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "admin_permissions" (
        "id" BIGSERIAL NOT NULL,
        "code" varchar(120) NOT NULL,
        "description" varchar(255) NOT NULL,
        CONSTRAINT "PK_admin_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_permissions_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "admin_role_permissions" (
        "role_id" bigint NOT NULL,
        "permission_id" bigint NOT NULL,
        CONSTRAINT "PK_admin_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_admin_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_admin_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "admin_permissions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "admin_user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" bigint NOT NULL,
        "assigned_by" uuid,
        "assigned_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_user_roles" PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "FK_admin_user_roles_user" FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_admin_user_roles_role" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_admin_user_roles_assigned_by" FOREIGN KEY ("assigned_by") REFERENCES users("global_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "admin_audit_logs" (
        "id" BIGSERIAL NOT NULL,
        "actor_user_id" uuid,
        "action" varchar(100) NOT NULL,
        "resource_type" varchar(100) NOT NULL,
        "resource_id" varchar(200),
        "before_json" jsonb,
        "after_json" jsonb,
        "revision_id" bigint,
        "request_id" varchar(100),
        "ip_hash" varchar(128),
        "reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admin_audit_logs_actor" FOREIGN KEY ("actor_user_id") REFERENCES users("global_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_created" ON "admin_audit_logs" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_resource" ON "admin_audit_logs" ("resource_type", "resource_id", "created_at" DESC)`,
    );
    await queryRunner.query(`
      CREATE FUNCTION prevent_admin_audit_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'admin_audit_logs is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER prevent_admin_audit_mutation
      BEFORE UPDATE OR DELETE ON "admin_audit_logs"
      FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_mutation()
    `);

    await queryRunner.query(`
      INSERT INTO "admin_roles" ("code", "name") VALUES
        ('SUPER_ADMIN', 'Quản trị toàn hệ thống'),
        ('POLICY_ADMIN', 'Quản trị chính sách'),
        ('AUDITOR', 'Xem audit log')
    `);
    await queryRunner.query(`
      INSERT INTO "admin_permissions" ("code", "description") VALUES
        ('config.read', 'Xem cấu hình hệ thống'),
        ('config.write', 'Tạo và publish cấu hình'),
        ('audit.read', 'Xem audit log'),
        ('admin.manage', 'Quản lý role và permission')
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" = 'SUPER_ADMIN'
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" = 'POLICY_ADMIN'
        AND permission."code" IN ('config.read', 'config.write')
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" = 'AUDITOR' AND permission."code" = 'audit.read'
    `);
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES
        ('discovery.default_radius_meters', '5000', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('discovery.min_radius_meters', '100', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('discovery.max_radius_meters', '50000', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('group.default_radius_meters', '10000', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('group.min_radius_meters', '1000', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('group.max_radius_meters', '50000', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('affiliate.active_member_window_days', '90', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('rank.maintenance_period_months', '3', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('point.referral_daily_cap', '3', 'INTEGER', 1, 'PUBLISHED', 'Initial system config'),
        ('point.transaction_daily_cap', '5', 'INTEGER', 1, 'PUBLISHED', 'Initial system config')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER prevent_admin_audit_mutation ON "admin_audit_logs"`,
    );
    await queryRunner.query(`DROP FUNCTION prevent_admin_audit_mutation`);
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
    await queryRunner.query(`DROP TABLE "admin_user_roles"`);
    await queryRunner.query(`DROP TABLE "admin_role_permissions"`);
    await queryRunner.query(`DROP TABLE "admin_permissions"`);
    await queryRunner.query(`DROP TABLE "admin_roles"`);
    await queryRunner.query(
      `ALTER TABLE "system_configs" DROP CONSTRAINT "EX_system_configs_published_window"`,
    );
    await queryRunner.query(`DROP TABLE "system_configs"`);
  }
}
