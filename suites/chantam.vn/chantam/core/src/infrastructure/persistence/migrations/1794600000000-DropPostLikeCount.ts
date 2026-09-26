import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ cột đếm thích riêng — chốt 26/09.
 *
 * `LIKE` là MỘT trong năm loại cảm xúc, không phải một hệ thống song song. Giao
 * diện cũng chỉ có một nút: chạm là `LIKE`, giữ thì chọn loại khác. Nên giữ
 * `posts.like_count` bên cạnh `reaction_count` là bắt cả hệ thống nuôi hai con
 * số cho một hành vi, và bắt client đoán xem nên hiện con số nào.
 *
 * `reaction_count` GIỮ NGUYÊN và không cần tính lại: nó vốn đã đếm mọi loại,
 * và lần gộp `post_likes` trước đó đã backfill xong.
 *
 * `down()` dựng lại cột và đếm lại từ `content_reactions` — dữ liệu không mất,
 * vì nguồn sự thật vẫn luôn là bảng cảm xúc chứ không phải cột đếm.
 */
export class DropPostLikeCount1794600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts" DROP COLUMN IF EXISTS "like_count"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD COLUMN IF NOT EXISTS "like_count" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "posts" post
      SET "like_count" = (
        SELECT COUNT(*) FROM "content_reactions"
        WHERE "subject_type" = 'POST'
          AND "subject_id" = post."global_id"
          AND "kind" = 'LIKE'
      )
    `);
  }
}
