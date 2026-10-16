import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thư viện ảnh chung của CMS (CMS A2, 16/10/2026).
 *
 * Trước bảng này CMS không có đường tải ảnh: mọi ô ảnh (banner tài trợ, bìa blog, ảnh
 * chiến dịch Home, nội dung pháp) chỉ nhận một URL `https://` dán từ chỗ khác. Bảng giữ
 * mỗi ảnh Admin đã tải, để chọn lại được ở bất kỳ màn nào.
 *
 * **Vì sao cần bảng chứ không chỉ trả URL.** Job dọn object mồ côi xoá mọi thứ dưới
 * `users/` mà không bảng nào trỏ tới. Ảnh CMS được dùng ở nhiều bảng khác nhau dưới dạng
 * URL tự do — đăng ký từng cột đó là sót một cột thì mất ảnh đang chạy trên trang chủ.
 * Bảng này là MỘT nguồn trong `LiveKeySources`: ảnh đã vào thư viện thì không bị dọn.
 *
 * `uploaded_by` cho phép `NULL` (`ON DELETE SET NULL`): Admin nghỉ việc thì tài khoản bị
 * xoá, còn banner họ tải lên vẫn đang chạy.
 */
export class CreateMediaAssets1801000000000 implements MigrationInterface {
  name = 'CreateMediaAssets1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "media_assets" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "storage_key" varchar(500) NOT NULL,
        "public_url" varchar(2000) NOT NULL,
        "content_type" varchar(100) NOT NULL,
        "file_name" varchar(255),
        "uploaded_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_assets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_media_assets_global_id" UNIQUE ("global_id"),
        -- Một object một dòng: xác nhận lại cùng key trả lại đúng dòng cũ.
        CONSTRAINT "UQ_media_assets_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "FK_media_assets_uploader"
          FOREIGN KEY ("uploaded_by") REFERENCES users("global_id") ON DELETE SET NULL,
        -- Cùng luật với campaign_media: http chỉ để chạy MinIO ở máy dev.
        CONSTRAINT "CHK_media_assets_public_url"
          CHECK ("public_url" ~ '^https?://')
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_media_assets_created"
        ON "media_assets" ("created_at" DESC, "id" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "media_assets"`);
  }
}
