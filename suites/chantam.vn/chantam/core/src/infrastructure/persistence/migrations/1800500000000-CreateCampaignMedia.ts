import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ảnh/video của hoạt động từ thiện — tối đa 5, ảnh bìa là một trong số đó.
 *
 * Xem `docs/superpowers/specs/2026-10-12-charity-campaign-media-design.md`.
 *
 * ## `public_url` lưu cạnh `storage_key`
 *
 * `storage_key` cho job dọn rác và cho ràng buộc "một object chỉ thuộc một hoạt
 * động". `public_url` để repository trả URL mà không phải biết `publicBaseUrl` —
 * cùng cách `campaigns.banner_url` vẫn lưu.
 *
 * ## Luật nào database giữ, luật nào không
 *
 * Bìa là ảnh, tối đa một bìa, thứ tự 0..4, không trùng object: database giữ.
 * "ĐÚNG một bìa" và "ít nhất một ảnh" thì không ép được bằng ràng buộc trên từng dòng —
 * `charityMediaShapeGaps`/`charityMediaTypeGaps` ở core-lib giữ, và lượt thay cả bộ
 * nằm trong một transaction nên không có trạng thái dở dang nào lộ ra ngoài.
 *
 * ## Nới `CHK_campaigns_banner_url`
 *
 * CHECK cũ đòi `https://` để chặn client gửi URL `http` gây mixed-content. Giờ server
 * dựng URL từ `STORAGE_PUBLIC_BASE_URL`, và dev đặt nó là `http://localhost:19000/...` —
 * giữ CHECK cũ thì mọi lượt tạo hoạt động ở dev hỏng.
 */
export class CreateCampaignMedia1800500000000 implements MigrationInterface {
  name = 'CreateCampaignMedia1800500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_media" (
        "id" BIGSERIAL NOT NULL,
        "campaign_id" uuid NOT NULL,
        "storage_key" varchar(500) NOT NULL,
        "public_url" text NOT NULL,
        "media_type" varchar(10) NOT NULL,
        "sort_order" int NOT NULL,
        "is_cover" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_media" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_media_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "UQ_campaign_media_order" UNIQUE ("campaign_id", "sort_order"),
        CONSTRAINT "FK_campaign_media_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_campaign_media_type" CHECK ("media_type" IN ('IMAGE', 'VIDEO')),
        CONSTRAINT "CHK_campaign_media_sort_order" CHECK ("sort_order" BETWEEN 0 AND 4),
        CONSTRAINT "CHK_campaign_media_cover_is_image"
          CHECK (NOT "is_cover" OR "media_type" = 'IMAGE'),
        CONSTRAINT "CHK_campaign_media_public_url" CHECK ("public_url" ~ '^https?://')
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_campaign_media_one_cover"
        ON "campaign_media" ("campaign_id") WHERE "is_cover"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "CHK_campaigns_banner_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "CHK_campaigns_banner_url" CHECK ("banner_url" ~ '^https?://')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_media"`);
    await queryRunner.query(`
      ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "CHK_campaigns_banner_url"
    `);
    // NOT VALID: dòng `http://` ghi ở dev trong lúc migration này còn chạy sẽ làm
    // ADD CONSTRAINT thường ném, và một lượt revert hỏng giữa chừng tệ hơn một CHECK
    // chỉ canh dòng mới.
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "CHK_campaigns_banner_url" CHECK ("banner_url" LIKE 'https://%') NOT VALID
    `);
  }
}
