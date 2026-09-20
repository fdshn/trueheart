import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cho phép lọc danh mục theo phân hệ (F14).
 *
 * Mảng chứ không phải một giá trị scope: "Đồ điện tử" vừa đem tặng vừa rao bán
 * được. Tách thành hai bản ghi cùng tên khác id thì mọi thống kê theo danh mục
 * bị chẻ đôi, và người dùng thấy hai mục trùng tên trong form.
 *
 * DEFAULT phủ đủ năm loại nên mọi danh mục đang có vẫn dùng được ở khắp nơi —
 * thêm cột này không được phép làm biến mất danh mục nào khỏi form đăng bài.
 */
export class AddCategoryPostTypes1790600000000 implements MigrationInterface {
  name = 'AddCategoryPostTypes1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN "post_types" text[] NOT NULL
      DEFAULT ARRAY['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT']::text[]
    `);
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD CONSTRAINT "CHK_categories_post_types_not_empty"
      CHECK (array_length("post_types", 1) >= 1)
    `);
    // Danh mục không gắn với loại bài nào là danh mục không bao giờ chọn được;
    // và mã lạ thì lọc kiểu gì cũng trượt, im lặng.
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD CONSTRAINT "CHK_categories_post_types_known"
      CHECK ("post_types" <@ ARRAY['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT']::text[])
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "CHK_categories_post_types_known"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "CHK_categories_post_types_not_empty"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN "post_types"`,
    );
  }
}
