import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng thành tích tháng (thiết kế `docs/superpowers/specs/2026-10-24-monthly-leaderboard-design.md`).
 *
 * - `users.leaderboard_anonymous`: người dùng chọn hiện "Người ẩn danh" trên bảng.
 * - `leaderboard_snapshots` + `leaderboard_entries`: bản CHỐT của một (tháng, bảng). Ghi một
 *   lần rồi thôi — `UNIQUE (month, board)` là thứ giữ "chốt hai lần không ghi gì", không
 *   phải một `if` ở code.
 * - `leaderboard_exclusions`: Admin loại một người khỏi một bảng (hoặc cả ba) của một tháng.
 * - `user_badges`: huy hiệu top N. `is_anonymous` lưu cờ LÚC CHỐT — huy hiệu giành được khi
 *   đang ẩn danh không bao giờ hiện trên hồ sơ công khai, kể cả khi người đó tắt ẩn danh sau.
 *
 * `month` là `date` ngày 1 của tháng theo giờ Việt Nam, không phải `timestamptz`: "tháng 10"
 * không có giờ.
 */
export class CreateMonthlyLeaderboards1801200000000 implements MigrationInterface {
  name = 'CreateMonthlyLeaderboards1801200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "leaderboard_anonymous" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE "leaderboard_snapshots" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "month" date NOT NULL,
        "board" varchar(16) NOT NULL,
        "closed_at" timestamptz NOT NULL DEFAULT now(),
        "badges_awarded" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_leaderboard_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leaderboard_snapshots_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_leaderboard_snapshots_month_board" UNIQUE ("month", "board"),
        CONSTRAINT "CHK_leaderboard_snapshots_board"
          CHECK ("board" IN ('GIVERS', 'CHARITY', 'CONSISTENCY')),
        CONSTRAINT "CHK_leaderboard_snapshots_month"
          CHECK (EXTRACT(DAY FROM "month") = 1)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "leaderboard_entries" (
        "id" BIGSERIAL NOT NULL,
        "snapshot_id" bigint NOT NULL,
        "user_id" uuid NOT NULL,
        "rank" int NOT NULL,
        "count" int NOT NULL,
        "reached_at" timestamptz NOT NULL,
        "is_anonymous" boolean NOT NULL,
        CONSTRAINT "PK_leaderboard_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leaderboard_entries_snapshot"
          FOREIGN KEY ("snapshot_id") REFERENCES "leaderboard_snapshots"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leaderboard_entries_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id") ON DELETE CASCADE,
        CONSTRAINT "UQ_leaderboard_entries_user" UNIQUE ("snapshot_id", "user_id"),
        CONSTRAINT "UQ_leaderboard_entries_rank" UNIQUE ("snapshot_id", "rank"),
        CONSTRAINT "CHK_leaderboard_entries_rank" CHECK ("rank" > 0),
        CONSTRAINT "CHK_leaderboard_entries_count" CHECK ("count" > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "leaderboard_exclusions" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "month" date NOT NULL,
        "board" varchar(16),
        "user_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "created_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "removed_at" timestamptz,
        "removed_by" uuid,
        CONSTRAINT "PK_leaderboard_exclusions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leaderboard_exclusions_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_leaderboard_exclusions_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_leaderboard_exclusions_board"
          CHECK ("board" IS NULL OR "board" IN ('GIVERS', 'CHARITY', 'CONSISTENCY')),
        CONSTRAINT "CHK_leaderboard_exclusions_reason" CHECK (length(btrim("reason")) > 0),
        CONSTRAINT "CHK_leaderboard_exclusions_removed"
          CHECK (("removed_at" IS NULL) = ("removed_by" IS NULL))
      )
    `);
    // Một lượt loại đang hiệu lực cho mỗi (tháng, bảng hoặc "mọi bảng", người).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_leaderboard_exclusions_active"
      ON "leaderboard_exclusions" ("month", COALESCE("board", '*'), "user_id")
      WHERE "removed_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "user_badges" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "board" varchar(16) NOT NULL,
        "month" date NOT NULL,
        "rank" int NOT NULL,
        "is_anonymous" boolean NOT NULL,
        "awarded_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "revoked_by" uuid,
        "revoke_reason" text,
        CONSTRAINT "PK_user_badges" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_badges_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_user_badges_user_board_month" UNIQUE ("user_id", "board", "month"),
        CONSTRAINT "FK_user_badges_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_user_badges_board"
          CHECK ("board" IN ('GIVERS', 'CHARITY', 'CONSISTENCY')),
        CONSTRAINT "CHK_user_badges_rank" CHECK ("rank" > 0),
        CONSTRAINT "CHK_user_badges_revoked" CHECK (
          ("revoked_at" IS NULL) = ("revoke_reason" IS NULL)
          AND ("revoked_at" IS NULL) = ("revoked_by" IS NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_badges_user_expires" ON "user_badges" ("user_id", "expires_at")`,
    );

    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES
        ('leaderboard.enabled', '1', 'INTEGER', 1, 'PUBLISHED',
         'Bảng thành tích tháng: 1 = bật, 0 = ẩn phía người dùng (vẫn chốt sổ, không trao huy hiệu)'),
        ('leaderboard.min_givers', '1', 'INTEGER', 1, 'PUBLISHED',
         'Số lượt tặng hoàn tất tối thiểu trong tháng để lên bảng Người cho'),
        ('leaderboard.min_charity', '1', 'INTEGER', 1, 'PUBLISHED',
         'Số lượt đóng góp từ thiện hoàn tất tối thiểu trong tháng để lên bảng Từ thiện'),
        ('leaderboard.min_consistency_days', '10', 'INTEGER', 1, 'PUBLISHED',
         'Số ngày điểm danh tối thiểu trong tháng để lên bảng Chuyên cần'),
        ('leaderboard.badge_ranks', '3', 'INTEGER', 1, 'PUBLISHED',
         'Số hạng đầu mỗi bảng được trao huy hiệu khi chốt sổ'),
        ('leaderboard.badge_months', '3', 'INTEGER', 1, 'PUBLISHED',
         'Số tháng huy hiệu còn hiện trên hồ sơ, tính từ sau tháng của bảng')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "admin_permissions" ("code", "description") VALUES
        ('leaderboard.read', 'Xem bảng thành tích tháng với danh tính thật, lượt loại và huy hiệu'),
        ('leaderboard.moderate', 'Loại người khỏi bảng thành tích và gỡ huy hiệu')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" = 'SUPER_ADMIN'
        AND permission."code" IN ('leaderboard.read', 'leaderboard.moderate')
      ON CONFLICT DO NOTHING
    `);

    await this.replaceTargetCheck(queryRunner, [
      'RANK',
      'REFERRAL',
      'LEADERBOARD',
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE notifications SET target_type = NULL WHERE target_type = 'LEADERBOARD'`,
    );
    await this.replaceTargetCheck(queryRunner, ['RANK', 'REFERRAL']);
    await queryRunner.query(`
      DELETE FROM "admin_role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "admin_permissions"
        WHERE "code" IN ('leaderboard.read', 'leaderboard.moderate')
      )
    `);
    await queryRunner.query(
      `DELETE FROM "admin_permissions" WHERE "code" IN ('leaderboard.read', 'leaderboard.moderate')`,
    );
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" LIKE 'leaderboard.%'`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_badges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leaderboard_exclusions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leaderboard_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leaderboard_snapshots"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "leaderboard_anonymous"`,
    );
  }

  /** Đích "của tôi" mang `target_id` NULL; mọi đích còn lại bắt buộc có id. */
  private async replaceTargetCheck(
    queryRunner: QueryRunner,
    singletons: string[],
  ): Promise<void> {
    const singletonList = singletons.map((code) => `'${code}'`).join(', ');
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "CHK_notifications_target"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD CONSTRAINT "CHK_notifications_target" CHECK (
          CASE
            WHEN "target_type" IS NULL THEN "target_id" IS NULL
            WHEN "target_type" IN (${singletonList}) THEN "target_id" IS NULL
            WHEN "target_type" IN
              ('POST', 'GIFT_TRANSACTION', 'CHAT_ROOM', 'CHARITY_CAMPAIGN', 'DHARMA_THREAD')
              THEN "target_id" IS NOT NULL
            ELSE false
          END
        )
    `);
  }
}
