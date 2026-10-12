import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Coordinator của hoạt động có tổ chức (F65b §2).
 *
 * *"Coordinator: thành viên được organizer giao quyền ở `ORGANIZED_CAMPAIGN`; có quyền
 * điều phối nhưng không được đổi chủ sở hữu hoặc xoá audit."*
 *
 * ## Điều phối được gì, và không được gì
 *
 * ĐƯỢC: xét đề nghị, hoàn tất/huỷ lượt giao nhận, ghi và sửa đóng góp ngoài app, đọc
 * danh sách đề nghị. KHÔNG được: đóng hay gia hạn hoạt động, và giao/thu quyền
 * coordinator — đó là quyết định của chủ sở hữu, và để coordinator tự giao quyền cho
 * người khác là một đường chuyển quyền chủ sở hữu từng bước.
 *
 * ## Thu quyền là đặt `revoked_at`, không xoá hàng
 *
 * Lượt giao nhận ghi `organizer_id` là người đã xét — có thể là một coordinator. Xoá
 * hàng coordinator là để lượt giao nhận trỏ vào một người không còn dấu vết vì sao họ
 * từng được quyết. Một người được giao lại sau khi bị thu là một hàng MỚI, nên chỉ mục
 * duy nhất là một chỉ mục MỘT PHẦN trên các hàng còn hiệu lực.
 */
export class CreateCampaignCoordinators1800300000000 implements MigrationInterface {
  name = 'CreateCampaignCoordinators1800300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_coordinators" (
        "id" BIGSERIAL NOT NULL,
        "campaign_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "granted_by" uuid NOT NULL,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz,
        "revoked_by" uuid,
        CONSTRAINT "PK_campaign_coordinators" PRIMARY KEY ("id"),
        CONSTRAINT "FK_campaign_coordinators_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_coordinators_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_coordinators_granter"
          FOREIGN KEY ("granted_by") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_coordinators_revoker"
          FOREIGN KEY ("revoked_by") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "CHK_campaign_coordinators_revoked"
          CHECK (("revoked_at" IS NULL) = ("revoked_by" IS NULL)),
        -- Tự giao quyền cho chính mình không có nghĩa: người tổ chức vốn có mọi quyền
        -- của coordinator.
        CONSTRAINT "CHK_campaign_coordinators_not_self"
          CHECK ("user_id" <> "granted_by")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_campaign_coordinators_active"
      ON "campaign_coordinators" ("campaign_id", "user_id")
      WHERE "revoked_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_coordinators"`);
  }
}
