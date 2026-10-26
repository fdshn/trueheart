import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mã chia sẻ bài (PR #46 §4): ngắn, không tuần tự, duy nhất.
 *
 * Sinh ở Postgres chứ không ở ứng dụng: mọi lối tạo bài (use case, seed, script) đều có mã mà
 * không phải nhớ, và `ADD COLUMN ... DEFAULT <hàm VOLATILE>` chạy hàm cho TỪNG dòng cũ — tức
 * backfill nằm sẵn trong câu thêm cột.
 *
 * Bảng chữ và độ dài khớp `PostShareCodeAlphabet`/`PostShareCodeLength` ở core-lib. Lấy 10 byte
 * NGẪU NHIÊN của UUID v4 (bỏ byte 6 và 8 vì mang bit phiên bản/biến thể); `% 31` lệch rất nhẹ
 * về vài chữ đầu — không đáng kể với mã chỉ cần không đoán dò được.
 */
export class AddPostShareCode1801700000000 implements MigrationInterface {
  name = 'AddPostShareCode1801700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gen_post_share_code() RETURNS varchar
      LANGUAGE sql VOLATILE AS $$
        SELECT string_agg(
                 substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                        get_byte(bytes, position) % 31 + 1, 1),
                 '' ORDER BY position)
          FROM (SELECT uuid_send(gen_random_uuid()) AS bytes) random_source,
               unnest(ARRAY[0, 1, 2, 3, 4, 5, 9, 10, 11, 12]) AS position
      $$
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
        ADD COLUMN "share_code" varchar(16) NOT NULL DEFAULT gen_post_share_code()
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_posts_share_code" ON "posts" ("share_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_posts_share_code"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "share_code"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS gen_post_share_code()`);
  }
}
