import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Banner Tài Trợ / Quảng Cáo (SRS UC-ADM-06, UC-POST-04, F65).
 *
 * ## Hai cột đếm NÀY là nguồn sự thật, không phải bản sao
 *
 * Trong dự án này tôi đã gỡ nhiều cột đếm lưu sẵn vì chúng là bản sao của một bảng khác và
 * bản sao thì trôi (`posts.reaction_count`, `notification_broadcasts.audience_count`), và ở
 * `campaigns` tôi cố ý KHÔNG thêm `participant_count` vì đếm được từ
 * `campaign_participations`.
 *
 * `impression_count` và `click_count` khác hẳn: không có bảng sự kiện nào để đếm lại từ đó.
 * Dựng một bảng ghi từng lượt hiển thị là thêm một hàng cho mỗi lần cuộn Home của mỗi
 * người — hàng triệu hàng mỗi tuần để trả lời một câu hỏi "thống kê cơ bản".
 *
 * Nên hai cột này LÀ nguồn, và mọi lượt cộng đi bằng `count = count + n` ngay trong
 * database, không đọc-rồi-ghi ở tầng ứng dụng. `ctr` thì KHÔNG có cột — nó suy ra từ hai số
 * kia, và lưu nó là tạo đúng loại bản sao sẽ trôi.
 *
 * ## `EXCLUDE` chống trùng khung thời gian: KHÔNG áp
 *
 * `home_campaign_configs` có ràng buộc đó vì mỗi lúc chỉ một bố cục Home được hiệu lực.
 * Banner thì ngược lại — nhiều banner chạy song song cùng một vị trí là chuyện bình thường,
 * và `display_order` quyết định thứ tự.
 *
 * ## `approved_at` phải khớp `approval_status`
 *
 * Cùng lối `CHK_campaigns_approved_at` và `CHK_blogs_published_at`. Một banner
 * `PENDING_APPROVAL` mà mang `approved_at` là một hàng không ai đọc nổi.
 */
export class CreateSponsorBanners1798500000000 implements MigrationInterface {
  name = 'CreateSponsorBanners1798500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sponsor_banners" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "partner_name" varchar(200) NOT NULL,
        "partner_contact" varchar(200),
        "title" varchar(200) NOT NULL,
        "image_url" text NOT NULL,
        "target_url" text NOT NULL,
        "placement" varchar(40) NOT NULL,
        "display_order" int NOT NULL DEFAULT 1,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "approval_status" varchar(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
        "approval_note" text,
        "approved_at" timestamptz,
        "approved_by" uuid,
        "impression_count" bigint NOT NULL DEFAULT 0,
        "click_count" bigint NOT NULL DEFAULT 0,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_sponsor_banners" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sponsor_banners_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_sponsor_banners_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "FK_sponsor_banners_approver"
          FOREIGN KEY ("approved_by") REFERENCES users("global_id") ON DELETE SET NULL,
        -- Allowlist ở database, không chỉ ở DTO. Một vị trí không client nào dựng nghĩa là
        -- banner không hiện ở đâu mà KHÔNG có lỗi nào — Admin thấy bản ghi đã lưu, đối tác
        -- đã trả tiền, và không ai biết nó chưa từng xuất hiện.
        CONSTRAINT "CHK_sponsor_banners_placement"
          CHECK ("placement" IN ('HOME_HERO', 'HOME_INLINE', 'POST_LIST', 'MERIT_PAGE')),
        CONSTRAINT "CHK_sponsor_banners_approval_status"
          CHECK ("approval_status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
        CONSTRAINT "CHK_sponsor_banners_window" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "CHK_sponsor_banners_image_url"
          CHECK ("image_url" LIKE 'https://%'),
        -- Lược đồ javascript: trong một link do đối tác gửi là đúng nơi để thử chèn mã, và
        -- chỉ cần một WebView cấu hình lỏng là nó chạy. Chặn ở lớp cuối, không chỉ ở DTO.
        CONSTRAINT "CHK_sponsor_banners_target_url"
          CHECK ("target_url" LIKE 'https://%' OR "target_url" LIKE 'chantam://%'),
        CONSTRAINT "CHK_sponsor_banners_partner_name"
          CHECK (length(btrim("partner_name")) > 0),
        CONSTRAINT "CHK_sponsor_banners_title"
          CHECK (length(btrim("title")) > 0),
        CONSTRAINT "CHK_sponsor_banners_display_order" CHECK ("display_order" >= 0),
        CONSTRAINT "CHK_sponsor_banners_counts"
          CHECK ("impression_count" >= 0 AND "click_count" >= 0),
        CONSTRAINT "CHK_sponsor_banners_approved_at"
          CHECK (
            ("approval_status" = 'PENDING_APPROVAL' AND "approved_at" IS NULL)
            OR ("approval_status" <> 'PENDING_APPROVAL' AND "approved_at" IS NOT NULL)
          )
      )
    `);

    // Đường phục vụ banner: một vị trí, đã duyệt, còn bật, đang trong khung giờ. Index
    // phần nên nó không phình theo số banner đã hết hạn — mà banner hết hạn sẽ nhiều, vì
    // không ai xoá hồ sơ đã chạy.
    await queryRunner.query(`
      CREATE INDEX "IDX_sponsor_banners_serving"
        ON "sponsor_banners" ("placement", "display_order" ASC, "id" ASC)
        WHERE "approval_status" = 'APPROVED'
          AND "is_active"
          AND "deleted_at" IS NULL
    `);
    // Hàng đợi duyệt của Admin, cũ nhất trước.
    await queryRunner.query(`
      CREATE INDEX "IDX_sponsor_banners_pending"
        ON "sponsor_banners" ("created_at" ASC)
        WHERE "approval_status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sponsor_banners_pending"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sponsor_banners_serving"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "sponsor_banners"`);
  }
}
