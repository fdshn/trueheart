import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dự án từ thiện 4 giai đoạn — đợt 2 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.3, §3.4, §3.7,
 * §3.8, §3.10, §3.13).
 *
 * ## Lịch sử sửa (chữ đỏ)
 *
 * `campaign_revisions` append-only: một dòng mỗi field đổi (hoặc `*` khi cả dòng được thêm/xoá)
 * sau khi dự án đã duyệt, ghi CÙNG transaction với lượt sửa. `is_public = false` cho field
 * riêng tư (SĐT, người nhận hàng…) — changelog công khai lọc theo cờ này, workspace thấy đủ.
 *
 * ## Checklist tab B
 *
 * `campaign_tasks` 7 việc mẫu, tạo lúc dự án đã duyệt được mở checklist lần đầu (idempotent).
 *
 * ## Thông báo theo dự án — outbox
 *
 * `campaign_announcements`: lượt sửa / chuyển giai đoạn ghi một dòng trong CÙNG transaction;
 * job `charity:notify` gửi cho người tham gia, người có đóng góp được chấp nhận và người quan
 * tâm, rồi đánh dấu xong. Gửi ngay trong request thì vừa chậm vừa mất khi tiến trình chết
 * giữa chừng. `dedupe_key` giữ nhắc 48 giờ chỉ một lần cho mỗi mốc trao.
 *
 * ## Tương tác
 *
 * `content_subject_type_enum` và `reports_target_type_enum` thêm `CHARITY_CAMPAIGN` +
 * `CHARITY_CAMPAIGN_POST` (bài ảnh/clip đợt 3 — thêm luôn để khỏi dựng lại type lần nữa).
 * `ALTER TYPE ... ADD VALUE` chạy được trong transaction từ PG12, miễn KHÔNG dùng giá trị mới
 * trong cùng transaction — migration này không dùng. Số thích/bình luận của dự án đếm thẳng
 * từ `content_reactions`/`content_comments` lúc đọc (như chủ đề Diễn đàn) — không có cột đếm
 * để lệch. `campaign_follows` là "quan tâm".
 *
 * ## Bản in
 *
 * `campaign_exports` lưu bản chụp công khai + mã revision cuối + người tạo + giờ tạo; PDF
 * luôn dựng lại từ bản chụp nên tải lại bao lần cũng ra đúng nội dung lúc tạo.
 */
export class CharityProjectEngagement1802500000000 implements MigrationInterface {
  name = 'CharityProjectEngagement1802500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum đối tượng tương tác và đích báo xấu ──────────────────────────
    for (const value of ['CHARITY_CAMPAIGN', 'CHARITY_CAMPAIGN_POST']) {
      await queryRunner.query(
        `ALTER TYPE "public"."content_subject_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
      await queryRunner.query(
        `ALTER TYPE "public"."reports_target_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    // ── Lịch sử sửa ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_revisions" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "entity" varchar(16) NOT NULL,
        "entity_id" varchar(64),
        "field" varchar(40) NOT NULL,
        "old_value" jsonb,
        "new_value" jsonb,
        "is_public" boolean NOT NULL,
        "is_important" boolean NOT NULL DEFAULT false,
        "changed_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_revisions_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_revisions_entity" CHECK ("entity" IN
          ('CAMPAIGN', 'PARTY', 'TEAM', 'PHASE', 'NEED_ITEM', 'BANK_ACCOUNT',
           'FUNDING_NEED', 'VOLUNTEER_NEED', 'TASK')),
        CONSTRAINT "CHK_campaign_revisions_change" CHECK (
          "old_value" IS NOT NULL OR "new_value" IS NOT NULL OR "field" <> '*')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_revisions_campaign" ON "campaign_revisions" ("campaign_id", "id" DESC)`,
    );
    await queryRunner.query(`
      CREATE FUNCTION campaign_revisions_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'campaign_revisions is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER campaign_revisions_append_only
      BEFORE UPDATE OR DELETE ON "campaign_revisions"
      FOR EACH ROW EXECUTE FUNCTION campaign_revisions_append_only()
    `);

    // ── Checklist tab B ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_tasks" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "task_key" varchar(20) NOT NULL,
        "scheduled_at" timestamptz,
        "work_note" varchar(2000),
        "remark" varchar(2000),
        "pic_name" varchar(120),
        "pic_user_id" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "update_mode" varchar(8),
        "status" varchar(12) NOT NULL DEFAULT 'TODO',
        "sort_order" smallint NOT NULL,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_tasks_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_campaign_tasks_key" UNIQUE ("campaign_id", "task_key"),
        CONSTRAINT "CHK_campaign_tasks_key" CHECK ("task_key" IN
          ('LICENSING', 'PROMOTION', 'INTAKE', 'MONITORING', 'CLOSE_INTAKE', 'PACKING',
           'PRE_EVENT_NOTICE')),
        CONSTRAINT "CHK_campaign_tasks_status" CHECK ("status" IN
          ('TODO', 'IN_PROGRESS', 'DONE', 'SKIPPED')),
        CONSTRAINT "CHK_campaign_tasks_update_mode" CHECK (
          "update_mode" IS NULL OR "update_mode" IN ('ONLINE', 'ON_SITE'))
      )
    `);

    // ── Quan tâm ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_follows" (
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("campaign_id", "user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_follows_user" ON "campaign_follows" ("user_id", "created_at" DESC)`,
    );

    // ── Outbox thông báo theo dự án ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_announcements" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "kind" varchar(20) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "dedupe_key" varchar(80),
        "actor_id" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz,
        "recipient_count" integer,
        CONSTRAINT "UQ_campaign_announcements_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_announcements_kind" CHECK ("kind" IN
          ('STAGE_CHANGED', 'PLAN_CHANGED', 'PRE_EVENT', 'SUMMARY_PUBLISHED')),
        CONSTRAINT "CHK_campaign_announcements_processed" CHECK (
          ("processed_at" IS NULL) = ("recipient_count" IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_announcements_pending" ON "campaign_announcements" ("id") WHERE "processed_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_campaign_announcements_dedupe" ON "campaign_announcements" ("campaign_id", "kind", "dedupe_key") WHERE "dedupe_key" IS NOT NULL`,
    );

    // ── Bản in ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_exports" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "section_key" varchar(10),
        "snapshot" jsonb NOT NULL,
        "last_revision_id" uuid,
        "generated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "generated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_exports_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_exports_section" CHECK (
          "section_key" IS NULL OR "section_key" IN ('PLAN', 'EXECUTION', 'EVENT', 'SUMMARY'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_exports_campaign" ON "campaign_exports" ("campaign_id", "generated_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_exports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_announcements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_follows"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_revisions"`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS campaign_revisions_append_only()`,
    );

    // Gỡ hai giá trị enum: dữ liệu mang chúng phải đi trước, rồi dựng lại type cho MỌI cột
    // đang dùng nó (tra catalog thay vì liệt kê tay — bảng nào thêm cột sau cũng không sót).
    await this.narrowEnum(queryRunner, 'content_subject_type_enum', [
      'POST',
      'COMMENT',
      'DHARMA_THREAD',
    ]);
    await this.narrowEnum(queryRunner, 'reports_target_type_enum', [
      'POST',
      'USER',
      'COMMENT',
      'CHAT_MESSAGE',
      'DHARMA_THREAD',
    ]);
  }

  private async narrowEnum(
    queryRunner: QueryRunner,
    typeName: string,
    keep: string[],
  ): Promise<void> {
    const columns = await queryRunner.query(
      `SELECT c.relname AS table_name, a.attname AS column_name
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_type t ON t.oid = a.atttypid
        WHERE t.typname = $1 AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`,
      [typeName],
    );
    const allowed = keep.map((value) => `'${value}'`).join(', ');
    for (const { table_name, column_name } of columns)
      await queryRunner.query(
        `DELETE FROM "${table_name}" WHERE "${column_name}"::text NOT IN (${allowed})`,
      );
    await queryRunner.query(
      `ALTER TYPE "public"."${typeName}" RENAME TO "${typeName}_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."${typeName}" AS ENUM (${allowed})`,
    );
    for (const { table_name, column_name } of columns)
      await queryRunner.query(
        `ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" TYPE "public"."${typeName}"
         USING "${column_name}"::text::"public"."${typeName}"`,
      );
    await queryRunner.query(`DROP TYPE "public"."${typeName}_old"`);
  }
}
