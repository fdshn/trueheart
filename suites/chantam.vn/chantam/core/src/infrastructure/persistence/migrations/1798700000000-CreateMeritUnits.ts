import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Công đức / Hồi hướng (SRS UI-MERIT-01, F65 phân hệ 4).
 *
 * ## `declared_amount` là LỜI KHAI, và schema nói ra điều đó
 *
 * Bên A đã chốt: số tiền người dùng tự khai thì CÓ lưu. Nhưng hệ thống không có đường nào
 * đối chiếu với ngân hàng (UI-MERIT-01: *"hệ thống không mặc định xác minh giao dịch ngân
 * hàng"*), nên cột mang tên `declared_amount` chứ không `amount`, và `status` chỉ có
 * `INTENDED` / `COMPLETED` — hai trạng thái của một LỜI KHAI, không phải của một giao dịch.
 *
 * **KHÔNG có cột tổng trên `merit_units`.** Đó là chỗ dễ sai nhất của cả phân hệ: một cột
 * `total_received` dựng từ lời khai sẽ hiện "Chùa X đã nhận 500 triệu" trên trang công khai,
 * và Bên A sẽ bị hỏi con số đó rồi không trả lời được. Muốn con số thì phải `SUM` có chủ ý,
 * và tên hàm phải chứa chữ "declared".
 *
 * ## `is_anonymous` giữ nguyên `user_id`
 *
 * Ẩn danh là ẩn TÊN ở đường đọc công khai, không phải ẩn hàng. `user_id` vẫn `NOT NULL`:
 * cần để người dùng xem lại lịch sử của chính mình, và để Admin xử lý khi có tranh chấp.
 * Xoá `user_id` để "ẩn danh cho chắc" là đổi một tuỳ chọn hiển thị thành mất dữ liệu.
 *
 * ## Không `UNIQUE` trên (đơn vị, người)
 *
 * Khác `campaign_participations` — một người công đức cho cùng một chùa nhiều lần trong năm
 * là chuyện bình thường và mỗi lần là một hàng riêng trong Sổ vàng. Ràng buộc một-hàng-một-
 * người ở đây sẽ ghi đè lần trước.
 */
export class CreateMeritUnits1798700000000 implements MigrationInterface {
  name = 'CreateMeritUnits1798700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "merit_units" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(200) NOT NULL,
        "slug" varchar(200) NOT NULL,
        "unit_type" varchar(30) NOT NULL,
        "purpose" text NOT NULL,
        "description" text,
        "cover_url" text,
        "address_label" varchar(255),
        "location" geography(Point, 4326),
        "bank_bin" varchar(6) NOT NULL,
        "bank_account_number" varchar(50) NOT NULL,
        "bank_account_name" varchar(200) NOT NULL,
        "bank_name" varchar(200),
        "display_order" int NOT NULL DEFAULT 1,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_merit_units" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_merit_units_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_merit_units_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_merit_units_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_merit_units_type"
          CHECK ("unit_type" IN ('TEMPLE', 'FUND', 'ORGANIZATION')),
        CONSTRAINT "CHK_merit_units_slug_shape"
          CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        -- BIN Napas đúng sáu chữ số. Sai BIN thì mã VietQR không quét được, và người dùng
        -- chỉ phát hiện sau khi đã mở app ngân hàng.
        CONSTRAINT "CHK_merit_units_bank_bin" CHECK ("bank_bin" ~ '^[0-9]{6}$'),
        CONSTRAINT "CHK_merit_units_bank_account"
          CHECK ("bank_account_number" ~ '^[0-9A-Za-z]{4,}$'),
        CONSTRAINT "CHK_merit_units_bank_account_name"
          CHECK (length(btrim("bank_account_name")) > 0),
        CONSTRAINT "CHK_merit_units_purpose" CHECK (length(btrim("purpose")) >= 10),
        CONSTRAINT "CHK_merit_units_cover_url"
          CHECK ("cover_url" IS NULL OR "cover_url" LIKE 'https://%'),
        CONSTRAINT "CHK_merit_units_display_order" CHECK ("display_order" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_merit_units_public"
        ON "merit_units" ("display_order" ASC, "id" ASC)
        WHERE "is_active" AND "deleted_at" IS NULL
    `);
    // Map Discovery — đơn vị Công đức cũng hiện trên bản đồ như hoạt động Từ thiện.
    await queryRunner.query(`
      CREATE INDEX "IDX_merit_units_location"
        ON "merit_units" USING gist ("location")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "merit_declarations" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "unit_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "declared_amount" bigint NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'INTENDED',
        "is_anonymous" boolean NOT NULL DEFAULT false,
        "note" varchar(500),
        "declared_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "PK_merit_declarations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_merit_declarations_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_merit_declarations_unit"
          FOREIGN KEY ("unit_id") REFERENCES merit_units("global_id") ON DELETE CASCADE,
        -- ON DELETE CASCADE trên người dùng: xoá tài khoản thì lời khai của họ đi theo.
        -- Giữ lại hàng mồ côi để "Sổ vàng đủ số" là giữ dữ liệu của một người đã yêu cầu
        -- xoá, và con số đó vốn chỉ là lời khai nên không có nghĩa vụ kế toán nào.
        CONSTRAINT "FK_merit_declarations_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_merit_declarations_status"
          CHECK ("status" IN ('INTENDED', 'COMPLETED')),
        CONSTRAINT "CHK_merit_declarations_amount"
          CHECK ("declared_amount" >= 1000 AND "declared_amount" <= 10000000000),
        -- Cùng lối CHK_blogs_published_at: COMPLETED thì PHẢI có mốc, INTENDED thì PHẢI
        -- không. Một hàng INTENDED mang completed_at không ai đọc nổi.
        CONSTRAINT "CHK_merit_declarations_completed_at"
          CHECK (
            ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
            OR ("status" = 'INTENDED' AND "completed_at" IS NULL)
          )
      )
    `);

    // Sổ vàng của một đơn vị: mới nhất trước.
    await queryRunner.query(`
      CREATE INDEX "IDX_merit_declarations_unit"
        ON "merit_declarations" ("unit_id", "declared_at" DESC)
    `);
    // "Tôi đã công đức những đâu".
    await queryRunner.query(`
      CREATE INDEX "IDX_merit_declarations_user"
        ON "merit_declarations" ("user_id", "declared_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "merit_declarations"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_merit_units_location"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_merit_units_public"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merit_units"`);
  }
}
