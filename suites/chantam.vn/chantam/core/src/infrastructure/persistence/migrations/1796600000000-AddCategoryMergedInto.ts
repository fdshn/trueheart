import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `categories.merged_into_id` — dấu vết của một lượt gộp danh mục, 30/09.
 *
 * Gộp là CHUYỂN bài rồi TẮT nguồn, không xoá nguồn — cùng lý do §22.2 chọn tắt thay
 * vì xoá: bài cũ trỏ vào đó vẫn cần đọc được tên để hiển thị lịch sử.
 *
 * Nhưng "đã tắt" một mình không đủ. Thiếu cột này thì sau ba tháng không ai trả lời
 * được "danh mục này tắt vì đã gộp vào chỗ khác, hay vì Admin tắt tay" — và hai câu
 * đó dẫn tới hai hành động khác nhau: một cái bật lại được, một cái bật lại là tạo ra
 * hai danh mục trùng nghĩa lần nữa.
 *
 * `ON DELETE SET NULL` chứ không `RESTRICT`: danh mục đích về sau có thể bị gộp tiếp
 * vào chỗ khác, và một chuỗi gộp không nên chặn việc dọn dữ liệu.
 */
export class AddCategoryMergedInto1796600000000 implements MigrationInterface {
  name = 'AddCategoryMergedInto1796600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "merged_into_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "merge_reason" varchar(500)
    `);
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD CONSTRAINT "FK_categories_merged_into"
        FOREIGN KEY ("merged_into_id") REFERENCES "categories"("global_id")
        ON DELETE SET NULL
    `);
    // Đã gộp thì bắt buộc đã tắt, và ngược lại KHÔNG bắt buộc: Admin vẫn tắt tay
    // được một danh mục chưa gộp đi đâu. Thiếu vế này thì một danh mục "đã gộp" vẫn
    // hiện trên cây và người ta chọn được nó, rồi bài mới lại chảy vào chỗ vừa dọn.
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD CONSTRAINT "CHK_categories_merged_is_inactive" CHECK (
        "merged_into_id" IS NULL OR "is_active" = false
      )
    `);
    // Không tự gộp vào chính mình.
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD CONSTRAINT "CHK_categories_merge_not_self" CHECK (
        "merged_into_id" IS NULL OR "merged_into_id" <> "global_id"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of [
      'CHK_categories_merge_not_self',
      'CHK_categories_merged_is_inactive',
      'FK_categories_merged_into',
    ])
      await queryRunner.query(
        `ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "${name}"`,
      );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN IF EXISTS "merge_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN IF EXISTS "merged_into_id"`,
    );
  }
}
