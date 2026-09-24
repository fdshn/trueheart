import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gộp `post_likes` vào `content_reactions`.
 *
 * Hai nhánh làm việc song song đã dựng hai hệ "thích" trên cùng một bảng
 * `posts`: `content_reactions` với năm loại cảm xúc, và `post_likes` nhị phân.
 * Hậu quả là `GET /posts/:id` trả hai con số thích khác nhau cho cùng một bài,
 * và không con số nào là tổng đúng.
 *
 * Sau migration này `content_reactions` là nguồn sự thật duy nhất:
 *   - `posts.like_count`     đếm RIÊNG `kind = 'LIKE'`
 *   - `posts.reaction_count` đếm mọi người đã bày tỏ, bất kể loại
 *
 * Đường API không đổi: `POST /posts/:id/like` vẫn còn, chỉ là nó ghi
 * `kind = 'LIKE'` thay vì chèn vào bảng riêng.
 */
export class MergePostLikesIntoReactions1792200000000 implements MigrationInterface {
  name = 'MergePostLikesIntoReactions1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bọc trong DO vì `post_likes` có thể đã không còn ở môi trường dựng mới
    // từ đầu. ON CONFLICT DO NOTHING là có chủ ý: ai đã thả LOVE thì GIỮ LOVE.
    // Hạ cảm xúc của người ta xuống LIKE để số liệu gọn là sửa dữ liệu thật.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.post_likes') IS NOT NULL THEN
          INSERT INTO "content_reactions"
            ("subject_type", "subject_id", "user_id", "kind", "created_at")
          SELECT 'POST', "post_id", "user_id", 'LIKE', "created_at"
          FROM "post_likes"
          ON CONFLICT ("subject_type", "subject_id", "user_id") DO NOTHING;
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_likes_post_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "post_likes"`);

    // Tính lại cả hai cột từ bảng cảm xúc. Không cộng dồn từ giá trị cũ: giá
    // trị cũ do hai đường ghi khác nhau nuôi nên chính nó mới là thứ đáng ngờ.
    await queryRunner.query(`
      UPDATE "posts" SET
        "like_count" = COALESCE((
          SELECT COUNT(*) FROM "content_reactions"
          WHERE "subject_type" = 'POST'
            AND "subject_id" = "posts"."global_id"
            AND "kind" = 'LIKE'
        ), 0),
        "reaction_count" = COALESCE((
          SELECT COUNT(*) FROM "content_reactions"
          WHERE "subject_type" = 'POST'
            AND "subject_id" = "posts"."global_id"
        ), 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "post_likes" (
        "id"         BIGSERIAL     NOT NULL,
        "user_id"    UUID          NOT NULL,
        "post_id"    UUID          NOT NULL,
        "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_post_likes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_post_likes_user_post" UNIQUE ("user_id", "post_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_post_likes_post_id"
      ON "post_likes" ("post_id")
    `);

    // Chỉ dựng lại được phần LIKE. Ai đã đổi sang LOVE sau khi gộp thì lượt
    // thích cũ của họ không quay lại — nói trước cho rõ chứ không giả vờ là
    // migration này đảo ngược trọn vẹn.
    await queryRunner.query(`
      INSERT INTO "post_likes" ("user_id", "post_id", "created_at")
      SELECT "user_id", "subject_id", "created_at"
      FROM "content_reactions"
      WHERE "subject_type" = 'POST' AND "kind" = 'LIKE'
      ON CONFLICT ON CONSTRAINT "UQ_post_likes_user_post" DO NOTHING
    `);
  }
}
