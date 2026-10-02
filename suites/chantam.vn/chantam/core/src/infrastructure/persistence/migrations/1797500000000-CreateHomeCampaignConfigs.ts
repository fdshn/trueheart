import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Home động theo chiến dịch (SRS §6.2.11, UC-ADM-03, F63).
 *
 * ## BR_CAMP_01 là một ràng buộc, không phải một nhánh `if`
 *
 * *"chỉ một cấu hình được chọn làm featured_home tại một thời điểm"*. Viết thành nhánh
 * kiểm trong use case thì hai request song song cùng vượt qua được — cùng lỗi TOCTOU mà
 * repo này đã gặp ở `hasLiked()` rồi mới ghi. Nên nó là `EXCLUDE USING gist`: hai cấu hình
 * ĐANG BẬT không được giao nhau về thời gian, và Postgres là nơi quyết định, không phải
 * thứ tự tới của hai request.
 *
 * `WHERE (is_active)` là phần làm cho ràng buộc này dùng được trong thực tế: bản nháp
 * (`is_active = false`) muốn trùng giờ bao nhiêu cũng được, nên Admin dựng trước chiến
 * dịch tháng sau mà không phải chờ chiến dịch tháng này hết hạn.
 *
 * Dùng `tstzrange(start_time, end_time, '[)')`: hai chiến dịch liền kề, một cái kết thúc
 * đúng lúc cái sau bắt đầu, KHÔNG được coi là giao nhau. Lấy `'[]'` thì mọi lượt nối tiếp
 * khít giờ đều bị từ chối, và Admin không có cách nào xếp hai chiến dịch liên tiếp.
 *
 * ## Không có cột `status`
 *
 * Cùng lối `affiliate_policy_revisions` và `check_in_policy_revisions`: trạng thái SUY RA
 * từ `is_active` cộng khoảng thời gian, không lưu thành cột. Bài học `config_revisions` —
 * ở đó `status` giữ `PUBLISHED` trong khi `effective_to` đã đóng, nên cột nói sai suốt N
 * lượt publish và phải có một migration đi dọn.
 */
export class CreateHomeCampaignConfigs1797500000000 implements MigrationInterface {
  name = 'CreateHomeCampaignConfigs1797500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "home_campaign_configs" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_name" varchar(150) NOT NULL,
        "theme_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "marquee_text" varchar(255),
        "popup_config" jsonb,
        "floating_banner" jsonb,
        "banners" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "sections_order" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "start_time" timestamptz NOT NULL,
        "end_time" timestamptz NOT NULL,
        "is_active" boolean NOT NULL DEFAULT false,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_home_campaign_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_home_campaign_configs_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_home_campaign_configs_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "FK_home_campaign_configs_editor"
          FOREIGN KEY ("updated_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_home_campaign_configs_window"
          CHECK ("end_time" > "start_time"),
        -- Ba cột JSON có hình dạng cố định: object cho theme/popup/floating, array cho
        -- banners/sections. Lưu sai kiểu thì mọi hàm normalize đều lặng lẽ lùi về mặc
        -- định, và Admin thấy cấu hình mình lưu không có tác dụng mà không có lỗi nào.
        CONSTRAINT "CHK_home_campaign_configs_theme_object"
          CHECK (jsonb_typeof("theme_config") = 'object'),
        CONSTRAINT "CHK_home_campaign_configs_popup_object"
          CHECK ("popup_config" IS NULL OR jsonb_typeof("popup_config") = 'object'),
        CONSTRAINT "CHK_home_campaign_configs_floating_object"
          CHECK ("floating_banner" IS NULL OR jsonb_typeof("floating_banner") = 'object'),
        CONSTRAINT "CHK_home_campaign_configs_banners_array"
          CHECK (jsonb_typeof("banners") = 'array'),
        CONSTRAINT "CHK_home_campaign_configs_sections_array"
          CHECK (jsonb_typeof("sections_order") = 'array')
      )
    `);

    // BR_CAMP_01 — xem docblock. `'[)'` để hai chiến dịch nối tiếp khít giờ vẫn xếp được.
    await queryRunner.query(`
      ALTER TABLE "home_campaign_configs"
        ADD CONSTRAINT "EXCL_home_campaign_configs_active_overlap"
        EXCLUDE USING gist (
          tstzrange("start_time", "end_time", '[)') WITH &&
        ) WHERE ("is_active")
    `);

    // Truy vấn nóng nhất của cả bảng: `GET /config/home-layout` tìm bản đang hiệu lực.
    // Chỉ index dòng đang bật — số dòng tắt sẽ nhiều hơn hẳn số dòng bật.
    await queryRunner.query(`
      CREATE INDEX "IDX_home_campaign_configs_window"
        ON "home_campaign_configs" ("start_time" DESC, "end_time")
        WHERE "is_active"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_home_campaign_configs_window"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "home_campaign_configs"`);
  }
}
