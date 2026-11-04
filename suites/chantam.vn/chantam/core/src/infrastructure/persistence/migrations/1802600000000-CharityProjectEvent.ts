import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dự án từ thiện 4 giai đoạn — đợt 3 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.5, §3.15).
 *
 * ## Timeline tab C
 *
 * `campaign_event_steps`: 10 bước mẫu, tạo idempotent khi ban tổ chức mở timeline lần đầu
 * (sau khi duyệt). Bước `DONE` phải có giờ thực tế.
 *
 * ## Bài ảnh/clip và quota
 *
 * `campaign_posts` + `campaign_post_media`. Quota 5 clip + 5 ảnh / người / ngày / dự án
 * (chốt §7.6) kiểm ở bước KÝ ĐƯỜNG TẢI: mỗi lượt ký để lại một dòng `campaign_post_uploads`
 * (đếm theo ngày giờ Việt Nam, dưới khoá advisory theo người + dự án), đăng bài thì "tiêu" dòng
 * đó (`consumed_at`) — một tệp không dùng được cho hai bài, và ký rồi bỏ cũng tính vào quota
 * (không thì ký vô hạn để né). Tệp ký mà không đăng: job dọn media mồ côi xoá sau 24 giờ.
 *
 * ## Cộng tác viên sự kiện
 *
 * `campaign_event_contributors`: người dùng thường chỉ đăng được khi ban tổ chức cấp quyền và
 * dự án đang ở Sự kiện trao. Thu hồi giữ dòng (`revoked_at`) để còn biết ai từng được cấp.
 */
export class CharityProjectEvent1802600000000 implements MigrationInterface {
  name = 'CharityProjectEvent1802600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_event_steps" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "step_key" varchar(24) NOT NULL,
        "planned_at" timestamptz,
        "actual_at" timestamptz,
        "status" varchar(12) NOT NULL DEFAULT 'PENDING',
        "note" varchar(1000),
        "sort_order" smallint NOT NULL,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_event_steps_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_campaign_event_steps_key" UNIQUE ("campaign_id", "step_key"),
        CONSTRAINT "CHK_campaign_event_steps_key" CHECK ("step_key" IN
          ('GATHER', 'BRIEFING', 'TRAVEL', 'REST_STOP', 'ARRIVE', 'MEET_LOCAL_AUTHORITY',
           'MEET_RECIPIENTS', 'DISTRIBUTE', 'WRAP_UP', 'RETURN')),
        CONSTRAINT "CHK_campaign_event_steps_status" CHECK (
          "status" IN ('PENDING', 'IN_PROGRESS', 'DONE')),
        CONSTRAINT "CHK_campaign_event_steps_done_time" CHECK (
          "status" <> 'DONE' OR "actual_at" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_event_contributors" (
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "granted_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "revoked_at" timestamptz,
        PRIMARY KEY ("campaign_id", "user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_posts" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "author_id" uuid NOT NULL REFERENCES "users"("global_id"),
        "author_role" varchar(12) NOT NULL,
        "stage" varchar(10) NOT NULL,
        "body" varchar(2000),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "deleted_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "hidden_at" timestamptz,
        "hidden_reason" varchar(1000),
        CONSTRAINT "UQ_campaign_posts_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_posts_role" CHECK (
          "author_role" IN ('ORGANIZER', 'COORDINATOR', 'PARTICIPANT')),
        CONSTRAINT "CHK_campaign_posts_stage" CHECK (
          "stage" IN ('PLAN', 'EXECUTION', 'EVENT', 'SUMMARY')),
        CONSTRAINT "CHK_campaign_posts_hidden" CHECK (
          ("hidden_at" IS NULL) = ("hidden_reason" IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_posts_visible" ON "campaign_posts" ("campaign_id", "id" DESC) WHERE "deleted_at" IS NULL AND "hidden_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "campaign_post_media" (
        "id" BIGSERIAL PRIMARY KEY,
        "post_id" uuid NOT NULL REFERENCES "campaign_posts"("global_id") ON DELETE CASCADE,
        "storage_key" varchar(500) NOT NULL,
        "public_url" varchar(1000) NOT NULL,
        "media_type" varchar(5) NOT NULL,
        "sort_order" smallint NOT NULL,
        CONSTRAINT "UQ_campaign_post_media_key" UNIQUE ("storage_key"),
        CONSTRAINT "CHK_campaign_post_media_type" CHECK ("media_type" IN ('IMAGE', 'VIDEO'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_post_media_post" ON "campaign_post_media" ("post_id", "sort_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "campaign_post_uploads" (
        "id" BIGSERIAL PRIMARY KEY,
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "storage_key" varchar(500) NOT NULL,
        "media_type" varchar(5) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "consumed_at" timestamptz,
        CONSTRAINT "UQ_campaign_post_uploads_key" UNIQUE ("storage_key"),
        CONSTRAINT "CHK_campaign_post_uploads_type" CHECK ("media_type" IN ('IMAGE', 'VIDEO'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_post_uploads_quota" ON "campaign_post_uploads" ("campaign_id", "user_id", "created_at")`,
    );

    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES
        ('charity.post_daily_video_quota', '5', 'INTEGER', 1, 'PUBLISHED',
         'Số clip tối đa một người đăng vào MỘT dự án từ thiện mỗi ngày (giờ Việt Nam).'),
        ('charity.post_daily_image_quota', '5', 'INTEGER', 1, 'PUBLISHED',
         'Số ảnh tối đa một người đăng vào MỘT dự án từ thiện mỗi ngày (giờ Việt Nam).')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" IN ('charity.post_daily_video_quota', 'charity.post_daily_image_quota')`,
    );
    // Tương tác/báo xấu trỏ vào bài sắp mất: dọn trước, không để dòng mồ côi.
    await queryRunner.query(
      `DELETE FROM "content_reactions" WHERE "subject_type" = 'CHARITY_CAMPAIGN_POST'`,
    );
    await queryRunner.query(
      `DELETE FROM "content_comments" WHERE "subject_type" = 'CHARITY_CAMPAIGN_POST'`,
    );
    await queryRunner.query(
      `DELETE FROM "reports" WHERE "target_type" = 'CHARITY_CAMPAIGN_POST'`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_post_uploads"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_post_media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_posts"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "campaign_event_contributors"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_event_steps"`);
  }
}
