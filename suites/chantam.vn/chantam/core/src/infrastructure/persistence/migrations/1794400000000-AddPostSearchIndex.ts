import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tìm kiếm bài đăng theo từ khoá, KHÔNG phân biệt dấu.
 *
 * Người Việt gõ "noi com dien" nhiều không kém "nồi cơm điện", và một ô tìm
 * kiếm không ra kết quả vì thiếu dấu thì người dùng kết luận là không có món
 * đó — rồi thôi.
 *
 * `unaccent` mặc định là STABLE nên KHÔNG đánh index được. Bọc lại thành một
 * hàm IMMUTABLE có chỉ rõ từ điển: phiên bản một tham số phải tra từ điển mặc
 * định lúc chạy nên Postgres không dám coi là bất biến, còn phiên bản hai tham
 * số thì cố định hẳn.
 *
 * Biểu thức trong index phải TRÙNG KHÍT với biểu thức trong câu truy vấn của
 * `findNearbyPosts`. Sai một ký tự là Postgres bỏ index và quét tuần tự cả
 * bảng — không ai thấy gì cho tới khi bảng đủ lớn.
 */
export class AddPostSearchIndex1794400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION chantam_unaccent(text)
      RETURNS text
      LANGUAGE sql
      IMMUTABLE STRICT PARALLEL SAFE
      AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_posts_search"
      ON "posts"
      USING GIN (
        to_tsvector(
          'simple',
          chantam_unaccent(coalesce("title", '') || ' ' || coalesce("description", ''))
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_posts_search"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS chantam_unaccent(text)`);
  }
}
