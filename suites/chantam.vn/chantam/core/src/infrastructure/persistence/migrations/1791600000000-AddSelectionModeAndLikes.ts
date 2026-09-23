import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm chế độ chọn người nhận, deadline tự động, lượt thích bài đăng (F-NEW).
 *
 * **`posts.selection_mode`** — enum 3 giá trị:
 *   - `INSTANT`  : người đầu tiên gửi request hợp lệ được chọn ngay.
 *   - `OPTIMAL`  : hệ thống chờ tối đa 7 ngày để chọn người tối ưu.
 *   - `EXTENDED` : hệ thống chờ tối đa 30 ngày.
 *   Default `OPTIMAL` để tương thích ngược với các bài cũ.
 *
 * **`posts.selection_deadline`** — null cho đến khi request đầu tiên xuất
 * hiện; khi đó set = `NOW() + interval` tuỳ mode.
 *
 * **`posts.like_count`** — denorm đếm like, tránh COUNT(*) trên `post_likes`
 * mỗi lần lấy bài.
 *
 * **`post_likes`** — bảng join `(user_id, post_id)`, UNIQUE để chặn like 2
 * lần. Không có `deleted_at`; unlike = DELETE row + like_count-- trong cùng tx.
 */
export class AddSelectionModeAndLikes1791600000000 implements MigrationInterface {
  name = 'AddSelectionModeAndLikes1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enum mới cho selection_mode
    await queryRunner.query(`
      CREATE TYPE "public"."posts_selection_mode_enum"
      AS ENUM ('INSTANT', 'OPTIMAL', 'EXTENDED')
    `);

    // 2. Cột selection_mode — default OPTIMAL cho bài cũ
    await queryRunner.query(`
      ALTER TABLE "posts"
        ADD COLUMN "selection_mode" "public"."posts_selection_mode_enum"
          NOT NULL DEFAULT 'OPTIMAL'
    `);

    // 3. Cột selection_deadline — nullable
    await queryRunner.query(`
      ALTER TABLE "posts"
        ADD COLUMN "selection_deadline" TIMESTAMPTZ NULL
    `);

    // 4. Cột like_count — default 0
    await queryRunner.query(`
      ALTER TABLE "posts"
        ADD COLUMN "like_count" INTEGER NOT NULL DEFAULT 0
    `);

    // 5. Bảng post_likes
    await queryRunner.query(`
      CREATE TABLE "post_likes" (
        "id"         BIGSERIAL     NOT NULL,
        "user_id"    UUID          NOT NULL,
        "post_id"    UUID          NOT NULL,
        "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_post_likes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_post_likes_user_post"
          UNIQUE ("user_id", "post_id")
      )
    `);

    // 6. Index để tìm nhanh tất cả like của một bài
    await queryRunner.query(`
      CREATE INDEX "IDX_post_likes_post_id" ON "post_likes" ("post_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_post_likes_post_id"`);
    await queryRunner.query(`DROP TABLE "post_likes"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "like_count"`);
    await queryRunner.query(
      `ALTER TABLE "posts" DROP COLUMN "selection_deadline"`,
    );
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "selection_mode"`);
    await queryRunner.query(`DROP TYPE "public"."posts_selection_mode_enum"`);
  }
}
