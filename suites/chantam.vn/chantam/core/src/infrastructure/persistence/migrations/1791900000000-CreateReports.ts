import { MigrationInterface, QueryRunner } from 'typeorm';

/** F48/F49: ticket báo cáo có bằng chứng, ưu tiên theo số tín hiệu và quyết định có audit. */
export class CreateReports1791900000000 implements MigrationInterface {
  name = 'CreateReports1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."reports_target_type_enum" AS ENUM ('POST', 'USER')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_reason_enum" AS ENUM
        ('SCAM', 'PROHIBITED_ITEM', 'INAPPROPRIATE_CONTENT', 'HARASSMENT', 'MISLEADING', 'OTHER')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_status_enum" AS ENUM
        ('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')
    `);
    await queryRunner.query(`
      CREATE TABLE "reports" (
        "id" SERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "reporter_user_id" uuid NOT NULL,
        "target_type" "public"."reports_target_type_enum" NOT NULL,
        "target_id" uuid NOT NULL,
        "reason" "public"."reports_reason_enum" NOT NULL,
        "description" varchar(1000) NOT NULL,
        "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" "public"."reports_status_enum" NOT NULL DEFAULT 'PENDING',
        "reviewed_by_user_id" uuid,
        "review_note" varchar(1000),
        "reviewed_at" timestamptz,
        CONSTRAINT "PK_reports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reports_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CK_reports_evidence_array" CHECK (jsonb_typeof("evidence_urls") = 'array'),
        CONSTRAINT "FK_reports_reporter" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("global_id"),
        CONSTRAINT "FK_reports_reviewer" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("global_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_reports_status_created" ON "reports" ("status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_reports_target_status" ON "reports" ("target_type", "target_id", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_reports_open_reporter_target"
      ON "reports" ("reporter_user_id", "target_type", "target_id")
      WHERE "status" IN ('PENDING', 'IN_REVIEW')
    `);
    await queryRunner.query(`
      INSERT INTO "admin_permissions" ("code", "description") VALUES
        ('report.read', 'Xem báo cáo vi phạm và bằng chứng'),
        ('report.resolve', 'Kết luận báo cáo vi phạm')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" IN ('SUPER_ADMIN', 'MODERATOR')
        AND permission."code" IN ('report.read', 'report.resolve')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "admin_permissions"
        WHERE "code" IN ('report.read', 'report.resolve')
      )
    `);
    await queryRunner.query(`
      DELETE FROM "admin_permissions" WHERE "code" IN ('report.read', 'report.resolve')
    `);
    await queryRunner.query(`DROP TABLE "reports"`);
    await queryRunner.query(`DROP TYPE "public"."reports_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."reports_reason_enum"`);
    await queryRunner.query(`DROP TYPE "public"."reports_target_type_enum"`);
  }
}
