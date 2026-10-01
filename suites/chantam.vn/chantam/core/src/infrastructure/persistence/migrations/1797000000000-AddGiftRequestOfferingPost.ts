import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bài mang ra tặng, gắn vào yêu cầu xin nhận — cho `POST /posts/{id}/offer-gift`.
 *
 * Trên một bài Muốn Nhận, người gửi yêu cầu KHÔNG phải người xin đồ mà là người
 * chủ động mang đồ tới (SRS §19). Trước 01/10 họ chỉ gửi được một dòng
 * `message`, nên chủ bài phải tin vào lời kể: không có đường nào trỏ sang bài
 * Muốn Tặng có ảnh, có danh mục, có vị trí của người kia.
 *
 * `ON DELETE SET NULL` chứ không `CASCADE`: người tặng xoá bài Muốn Tặng của họ
 * thì lời tặng vẫn còn — họ vẫn có món đó, chỉ là không rao nữa. `CASCADE` sẽ
 * xoá luôn yêu cầu và làm bay mất một ứng viên khỏi hàng đợi của chủ bài, kèm cả
 * `queue_joined_at` quyết định thứ tự.
 *
 * Không index: cột này chỉ đọc kèm theo một yêu cầu đã tìm được bằng
 * `post_id`/`global_id`, không có truy vấn nào lọc theo nó.
 */
export class AddGiftRequestOfferingPost1797000000000 implements MigrationInterface {
  name = 'AddGiftRequestOfferingPost1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gift_requests"
      ADD COLUMN IF NOT EXISTS "offering_post_id" uuid
    `);

    // Tách khỏi `ADD COLUMN` để chạy lại được sau một lần thất bại giữa đường:
    // `ADD CONSTRAINT` không có `IF NOT EXISTS` nên phải tự kiểm.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_gift_requests_offering_post'
        ) THEN
          ALTER TABLE "gift_requests"
          ADD CONSTRAINT "FK_gift_requests_offering_post"
          FOREIGN KEY ("offering_post_id") REFERENCES "posts"("global_id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gift_requests"
      DROP CONSTRAINT IF EXISTS "FK_gift_requests_offering_post"
    `);
    await queryRunner.query(`
      ALTER TABLE "gift_requests" DROP COLUMN IF EXISTS "offering_post_id"
    `);
  }
}
