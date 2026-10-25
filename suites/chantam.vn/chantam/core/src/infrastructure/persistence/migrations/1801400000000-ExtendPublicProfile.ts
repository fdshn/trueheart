import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hồ sơ công khai mở rộng (PR #46 §3).
 *
 * - `slogan`, `today_thought` (+ mốc cập nhật): chữ người dùng tự viết.
 * - `intro_video_url`, `intro_video_thumbnail_url`: clip giới thiệu. Lưu URL đã xác nhận qua
 *   HeadObject (cùng cách `avatar_url`), không nhận URL tuỳ ý từ client.
 * - `email_visibility`, `phone_visibility`: mặc định `PRIVATE`. Hồ sơ công khai chỉ trả liên
 *   hệ khi trường tương ứng là `PUBLIC` — mobile không render KHÔNG phải hàng rào bảo mật.
 */
export class ExtendPublicProfile1801400000000 implements MigrationInterface {
  name = 'ExtendPublicProfile1801400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "slogan" varchar(120),
        ADD COLUMN IF NOT EXISTS "today_thought" varchar(280),
        ADD COLUMN IF NOT EXISTS "today_thought_updated_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "intro_video_url" varchar(500),
        ADD COLUMN IF NOT EXISTS "intro_video_thumbnail_url" varchar(500),
        ADD COLUMN IF NOT EXISTS "email_visibility" varchar(10) NOT NULL DEFAULT 'PRIVATE',
        ADD COLUMN IF NOT EXISTS "phone_visibility" varchar(10) NOT NULL DEFAULT 'PRIVATE'
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_users_email_visibility"
          CHECK ("email_visibility" IN ('PRIVATE', 'PUBLIC')),
        ADD CONSTRAINT "CHK_users_phone_visibility"
          CHECK ("phone_visibility" IN ('PRIVATE', 'PUBLIC')),
        -- Có suy nghĩ thì có mốc; xoá suy nghĩ thì xoá mốc. Một mốc treo không có chữ là
        -- "cập nhật 3 ngày trước" cho một ô trống.
        ADD CONSTRAINT "CHK_users_today_thought_stamp"
          CHECK (("today_thought" IS NULL) = ("today_thought_updated_at" IS NULL)),
        -- Ảnh bìa đi cùng clip: không có clip thì không có ảnh bìa lơ lửng.
        ADD CONSTRAINT "CHK_users_intro_video_thumbnail"
          CHECK ("intro_video_thumbnail_url" IS NULL OR "intro_video_url" IS NOT NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "CHK_users_intro_video_thumbnail",
        DROP CONSTRAINT IF EXISTS "CHK_users_today_thought_stamp",
        DROP CONSTRAINT IF EXISTS "CHK_users_phone_visibility",
        DROP CONSTRAINT IF EXISTS "CHK_users_email_visibility",
        DROP COLUMN IF EXISTS "phone_visibility",
        DROP COLUMN IF EXISTS "email_visibility",
        DROP COLUMN IF EXISTS "intro_video_thumbnail_url",
        DROP COLUMN IF EXISTS "intro_video_url",
        DROP COLUMN IF EXISTS "today_thought_updated_at",
        DROP COLUMN IF EXISTS "today_thought",
        DROP COLUMN IF EXISTS "slogan"
    `);
  }
}
