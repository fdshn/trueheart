import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dữ liệu riêng tư của NGƯỜI THỤ HƯỞNG (F65b §2).
 *
 * *"`INDIVIDUAL_APPEAL` phải khai `beneficiaryRelation = SELF | OTHER`. Với `OTHER`,
 * organizer phải khai quan hệ và trạng thái đồng ý/xác minh trước khi public. Địa chỉ,
 * số điện thoại và tài liệu xác minh của beneficiary luôn là dữ liệu riêng tư."*
 *
 * ## Bảng RIÊNG, không thêm cột vào `campaigns`
 *
 * Mọi lượt đọc `campaigns` — kể cả đường công khai — dùng chung một danh sách cột
 * (`Columns` trong repository). Một cột riêng tư nằm cạnh cột công khai là một lần ai đó
 * thêm nó vào danh sách đó là lộ ra `GET /campaigns`. Bảng riêng thì muốn đọc phải JOIN
 * có chủ đích, và chỉ một đường làm việc đó.
 *
 * ## Đồng ý là trạng thái, không phải một lần bấm
 *
 * `consent_status = 'CONFIRMED'` là điều kiện để một kêu gọi `OTHER` được public. Người
 * thụ hưởng có thể rút lại; chuyển về `PENDING` lúc đang public thì hoạt động tự ẩn
 * (repository làm trong cùng transaction).
 */
export class CreateCampaignBeneficiaries1800400000000 implements MigrationInterface {
  name = 'CreateCampaignBeneficiaries1800400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_beneficiaries" (
        "campaign_id" uuid NOT NULL,
        "full_name" varchar(200) NOT NULL,
        -- Quan hệ CỤ THỂ ("mẹ", "hàng xóm"); campaigns.beneficiary_relation chỉ nói
        -- SELF hay OTHER.
        "relation_note" varchar(200) NOT NULL,
        "phone" varchar(30),
        "address" varchar(500),
        "consent_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "verification_note" varchar(1000),
        "updated_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_beneficiaries" PRIMARY KEY ("campaign_id"),
        CONSTRAINT "FK_campaign_beneficiaries_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_beneficiaries_updater"
          FOREIGN KEY ("updated_by") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "CHK_campaign_beneficiaries_consent"
          CHECK ("consent_status" IN ('PENDING', 'CONFIRMED'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_beneficiaries"`);
  }
}
