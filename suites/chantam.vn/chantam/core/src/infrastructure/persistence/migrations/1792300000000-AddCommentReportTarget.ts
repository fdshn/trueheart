import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gộp `content_reports` vào `reports`, thêm đích `COMMENT`.
 *
 * Hai bảng báo xấu cùng tồn tại: `content_reports` (đa hình, dựng cùng nền
 * tảng bảng tin) và `reports` (đích `POST`/`USER`, đã nối RBAC và hàng đợi
 * Admin CMS). `content_reports` chưa bao giờ có use case, repository hay
 * controller nào chạm tới — chỉ có DDL. Giữ nó lại thì báo xấu bình luận sẽ
 * phải dựng một đường kiểm duyệt song song, và Admin phải mở hai hàng đợi.
 *
 * Sau migration này `reports` nhận cả ba đích, dùng chung một hàng đợi và một
 * bộ quyền (`report.read` / `report.resolve`) đã seed từ trước.
 *
 * `ALTER TYPE ... ADD VALUE` không dùng ngay được trong cùng transaction, nên
 * đi lối dựng lại type — an toàn với transaction mà TypeORM bọc quanh migration.
 */
export class AddCommentReportTarget1792300000000 implements MigrationInterface {
  name = 'AddCommentReportTarget1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."reports_target_type_enum"
      RENAME TO "reports_target_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_target_type_enum"
      AS ENUM ('POST', 'USER', 'COMMENT')
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "target_type" TYPE "public"."reports_target_type_enum"
      USING "target_type"::text::"public"."reports_target_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."reports_target_type_enum_old"`,
    );

    // Bảng chết: không use case, repository, controller hay entity nào đọc
    // hay ghi nó. Để lại là mời người sau dựng nhầm đường thứ hai.
    await queryRunner.query(`DROP TABLE IF EXISTS "content_reports"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."content_report_status_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Báo xấu bình luận không có chỗ trong bảng cũ, nên bỏ chúng đi trước khi
    // thu hẹp enum — thu hẹp mà còn dòng dùng giá trị đó thì ALTER sẽ vỡ.
    await queryRunner.query(
      `DELETE FROM "reports" WHERE "target_type" = 'COMMENT'`,
    );

    await queryRunner.query(`
      ALTER TYPE "public"."reports_target_type_enum"
      RENAME TO "reports_target_type_enum_new"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_target_type_enum" AS ENUM ('POST', 'USER')
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "target_type" TYPE "public"."reports_target_type_enum"
      USING "target_type"::text::"public"."reports_target_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."reports_target_type_enum_new"`,
    );

    await queryRunner.query(`
      CREATE TYPE "public"."content_report_status_enum"
      AS ENUM ('PENDING', 'UPHELD', 'DISMISSED')
    `);
    await queryRunner.query(`
      CREATE TABLE "content_reports" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "subject_type" "public"."content_subject_type_enum" NOT NULL,
        "subject_id" uuid NOT NULL,
        "reporter_id" uuid NOT NULL,
        "reason" varchar(500) NOT NULL,
        "status" "public"."content_report_status_enum" NOT NULL DEFAULT 'PENDING',
        "resolved_by" uuid,
        "resolution_note" varchar(500),
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_reports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_content_reports_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_content_reports_one_per_reporter"
          UNIQUE ("subject_type", "subject_id", "reporter_id"),
        CONSTRAINT "FK_content_reports_reporter"
          FOREIGN KEY ("reporter_id") REFERENCES "users"("global_id"),
        CONSTRAINT "CHK_content_reports_resolution"
          CHECK (
            ("status" = 'PENDING' AND "resolved_at" IS NULL)
            OR ("status" <> 'PENDING' AND "resolved_at" IS NOT NULL)
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_reports_queue"
      ON "content_reports" ("status", "created_at" ASC)
      WHERE "status" = 'PENDING'
    `);
  }
}
