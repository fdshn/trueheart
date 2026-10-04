import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phật Pháp: engine nội dung dùng chung và lịch sử tụng kinh (SRS UC-DHARMA-01,
 * UC-DHARMA-02, BR-DHARMA-01, F73).
 *
 * ## MỘT bảng cho ba loại nội dung
 *
 * BR-DHARMA-01 đòi mô hình `content_type`/`category` dùng chung thay vì một engine riêng cho
 * từng loại. Nên `dharma_contents` giữ cả Kinh sách, Thông tin và Giới thiệu chùa, phân biệt
 * bằng `content_type`.
 *
 * ## `category` KHÔNG có CHECK, và đó là chủ ý
 *
 * Khác `CHK_sponsor_banners_placement`: một vị trí banner sai nghĩa là banner **không hiện
 * mà không có lỗi nào**, nên phải chặn ở database. Còn một danh mục sai thì hiện ngay thành
 * một giá trị lọc riêng cạnh giá trị đúng trong danh sách Admin — sai mà thấy được.
 *
 * Đổi lại, cột chỉ nhận dạng slug đã chuẩn hoá (`CHK_dharma_contents_category_shape`), để
 * "Kinh Đại Thừa" và "kinh dai thua" không thành hai danh mục.
 *
 * ## `is_published` và `published_at` phải khớp nhau
 *
 * Cùng lối `CHK_blogs_published_at`. Một bản nháp mang `published_at` là một hàng không ai
 * đọc nổi: nó từng xuất bản rồi bị rút, hay chưa bao giờ?
 *
 * ## KHÔNG có cột `recitation_count`
 *
 * Bản đầu của tôi có cột đó, và nó vi phạm chính luật tôi đặt ra ở `sponsor_banners`: cột đếm
 * chỉ được lưu khi **không có bảng sự kiện nào để đếm lại từ đó**. Ở đây có hẳn
 * `dharma_recitations`, nên một cột đếm là bản sao — và bản sao thì trôi, đúng như
 * `posts.reaction_count` đã trôi.
 *
 * `view_count` thì GIỮ: không có bảng nào ghi từng lượt xem, và dựng một bảng như thế là thêm
 * một hàng cho mỗi lần mở một trang. Cùng lý lẽ với `blogs.view_count`.
 *
 * ## `dharma_recitations`: một hàng mỗi LƯỢT tụng, không mỗi (người, kinh)
 *
 * Khác `campaign_participations` (một hàng mỗi người). Tụng một bộ kinh nhiều lần là chính
 * việc người dùng làm, và UC-DHARMA-02 đòi *"lưu lịch sử cơ bản"* — một hàng một người thì
 * không còn lịch sử nào.
 */
export class CreateDharmaContents1798900000000 implements MigrationInterface {
  name = 'CreateDharmaContents1798900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dharma_contents" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "content_type" varchar(30) NOT NULL,
        "category" varchar(50),
        "title" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "summary" text,
        "body_text" text NOT NULL DEFAULT '',
        "audio_url" text,
        "cover_url" text,
        "display_order" int NOT NULL DEFAULT 1,
        "is_featured" boolean NOT NULL DEFAULT false,
        "is_published" boolean NOT NULL DEFAULT false,
        "published_at" timestamptz,
        "view_count" int NOT NULL DEFAULT 0,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_dharma_contents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dharma_contents_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_dharma_contents_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_dharma_contents_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_dharma_contents_type"
          CHECK ("content_type" IN ('SUTRA', 'INFO', 'TEMPLE_INTRO')),
        CONSTRAINT "CHK_dharma_contents_slug_shape"
          CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        -- Danh mục không có allowlist nhưng PHẢI đúng dạng slug: xem docblock trên.
        CONSTRAINT "CHK_dharma_contents_category_shape"
          CHECK ("category" IS NULL OR "category" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT "CHK_dharma_contents_published_at"
          CHECK (
            ("is_published" AND "published_at" IS NOT NULL)
            OR (NOT "is_published" AND "published_at" IS NULL)
          ),
        -- Đã xuất bản thì phải có nội dung. Một bộ kinh CÔNG KHAI mà rỗng thì người dùng mở
        -- ra thấy trang trắng, và đường duy nhất tạo ra nó là SQL tay.
        CONSTRAINT "CHK_dharma_contents_published_has_body"
          CHECK (NOT "is_published" OR length(btrim("body_text")) > 0),
        CONSTRAINT "CHK_dharma_contents_audio_url"
          CHECK ("audio_url" IS NULL OR "audio_url" LIKE 'https://%'),
        CONSTRAINT "CHK_dharma_contents_cover_url"
          CHECK ("cover_url" IS NULL OR "cover_url" LIKE 'https://%'),
        CONSTRAINT "CHK_dharma_contents_display_order" CHECK ("display_order" >= 0),
        CONSTRAINT "CHK_dharma_contents_view_count" CHECK ("view_count" >= 0)
      )
    `);

    // Đường công khai: một loại nội dung, đã xuất bản, sắp theo thứ tự Admin đặt.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_contents_public"
        ON "dharma_contents" ("content_type", "display_order" ASC, "id" ASC)
        WHERE "is_published" AND "deleted_at" IS NULL
    `);
    // Lọc theo danh mục trong cùng một loại.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_contents_category"
        ON "dharma_contents" ("content_type", "category")
        WHERE "is_published" AND "deleted_at" IS NULL
    `);
    // Nội dung nổi bật cho Dharma Hub.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_contents_featured"
        ON "dharma_contents" ("display_order" ASC)
        WHERE "is_featured" AND "is_published" AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "dharma_recitations" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "content_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "duration_seconds" int,
        CONSTRAINT "PK_dharma_recitations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dharma_recitations_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_dharma_recitations_content"
          FOREIGN KEY ("content_id") REFERENCES dharma_contents("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_dharma_recitations_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        -- Xong thì phải có mốc xong, chưa xong thì phải không có. Cùng lối
        -- CHK_merit_declarations_completed_at.
        CONSTRAINT "CHK_dharma_recitations_completed_at"
          CHECK (
            ("completed_at" IS NULL AND "duration_seconds" IS NULL)
            OR ("completed_at" IS NOT NULL AND "completed_at" >= "started_at")
          ),
        CONSTRAINT "CHK_dharma_recitations_duration"
          CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0)
      )
    `);

    // "Tôi đã tụng những gì" — mới nhất trước.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_recitations_user"
        ON "dharma_recitations" ("user_id", "started_at" DESC)
    `);
    // Đếm lượt tụng hoàn tất của một bộ kinh.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_recitations_content"
        ON "dharma_recitations" ("content_id")
        WHERE "completed_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dharma_recitations"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dharma_contents_featured"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dharma_contents_category"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dharma_contents_public"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "dharma_contents"`);
  }
}
