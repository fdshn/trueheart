import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Blog / Tin tức (SRS §6.2.12, UC-BLOG-01, F64).
 *
 * ## `published_at` và `is_published` phải khớp nhau, và database canh điều đó
 *
 * Hai cột cho một trạng thái là đúng cái bẫy `config_revisions` đã mắc: ở đó `status` giữ
 * `PUBLISHED` trong khi `effective_to` đã đóng, và cột nói sai suốt N lượt publish.
 *
 * Ở đây không gộp được thành một cột — `published_at` mang thông tin riêng (thời điểm), mà
 * `is_published` thì cần để lọc nhanh. Nên thay vì tin mã nguồn giữ chúng đồng bộ,
 * `CHK_blogs_published_at` buộc: đã xuất bản thì PHẢI có mốc thời gian, chưa xuất bản thì
 * PHẢI không có. Một bản nháp mang `published_at` là một dòng không ai đọc nổi — nó từng
 * xuất bản rồi bị rút, hay chưa bao giờ?
 *
 * ## Index riêng cho đường công khai
 *
 * `GET /blogs` chỉ đọc bài đã xuất bản, sắp theo `published_at` giảm dần. Index phần
 * (`WHERE is_published`) nên nó không phình theo số bản nháp — và bản nháp sẽ nhiều, vì
 * Admin soạn bài qua nhiều buổi.
 *
 * ## `view_count` tách khỏi `updated_at`
 *
 * Tăng lượt xem KHÔNG đụng `updated_at`: nếu đụng thì mọi bài đọc nhiều sẽ luôn hiện "vừa
 * cập nhật", và Admin mất cách biết bài nào thật sự được sửa.
 */
export class CreateBlogs1797700000000 implements MigrationInterface {
  name = 'CreateBlogs1797700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "blogs" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "category" varchar(50) NOT NULL,
        "summary" text,
        "content_html" text NOT NULL DEFAULT '',
        "thumbnail_url" text,
        "author_id" uuid,
        "view_count" int NOT NULL DEFAULT 0,
        "is_published" boolean NOT NULL DEFAULT false,
        "published_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_blogs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blogs_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_blogs_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_blogs_author"
          FOREIGN KEY ("author_id") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_blogs_category"
          CHECK ("category" IN ('PHAT_PHAP', 'GUONG_SANG', 'CHIEN_DICH', 'SONG_XANH')),
        CONSTRAINT "CHK_blogs_slug_shape"
          CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT "CHK_blogs_published_at"
          CHECK (
            ("is_published" AND "published_at" IS NOT NULL)
            OR (NOT "is_published" AND "published_at" IS NULL)
          ),
        -- Đã xuất bản thì phải có nội dung và ảnh bìa. Cùng luật với \`blogGaps\`, nhưng
        -- đặt ở database vì một bản nháp rỗng được phép tồn tại, còn một bài CÔNG KHAI
        -- rỗng thì không — và đường duy nhất tạo ra nó là SQL tay.
        CONSTRAINT "CHK_blogs_published_has_content"
          CHECK (
            NOT "is_published"
            OR (length("content_html") > 0 AND "thumbnail_url" IS NOT NULL)
          ),
        CONSTRAINT "CHK_blogs_view_count" CHECK ("view_count" >= 0)
      )
    `);

    // Đường công khai: chỉ bài đã xuất bản, mới nhất trước.
    await queryRunner.query(`
      CREATE INDEX "IDX_blogs_published" ON "blogs" ("published_at" DESC)
        WHERE "is_published" AND "deleted_at" IS NULL
    `);
    // Lọc theo chuyên mục trong CMS và trên trang công khai.
    await queryRunner.query(`
      CREATE INDEX "IDX_blogs_category" ON "blogs" ("category", "published_at" DESC)
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blogs_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blogs_published"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blogs"`);
  }
}
