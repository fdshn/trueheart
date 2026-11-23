import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR 22/11/2026 đợt 5 — bản sửa chờ duyệt. Sau khi duyệt, các trường cần duyệt (tiêu đề, mô tả,
 * media, đơn vị nhận, loại tiếp nhận, hệ số điểm) chỉ đổi qua một bản sửa Admin duyệt.
 *
 * - `proposed`: các khoá chủ dự án đề xuất; `base`: ảnh chụp bản đã duyệt lúc gửi LẦN ĐẦU.
 * - Mỗi chiến dịch tối đa MỘT bản `PENDING` (index duy nhất một phần).
 * - `decided_at` có ⇔ không còn `PENDING` (rút cũng ghi `decided_at`).
 */
export class CharityChangeRequests1804400000000 implements MigrationInterface {
  name = 'CharityChangeRequests1804400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_change_requests" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "status" varchar(10) NOT NULL DEFAULT 'PENDING',
        "proposed" jsonb NOT NULL,
        "base" jsonb NOT NULL,
        "submitted_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "submitted_at" timestamptz NOT NULL DEFAULT now(),
        "decided_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "decided_at" timestamptz,
        "decision_reason" varchar(1000),
        CONSTRAINT "UQ_campaign_change_requests_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_change_requests_status"
          CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
        CONSTRAINT "CHK_campaign_change_requests_decided"
          CHECK (("status" = 'PENDING') = ("decided_at" IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_campaign_change_requests_pending" ON "campaign_change_requests" ("campaign_id") WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_change_requests_status" ON "campaign_change_requests" ("status", "submitted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_change_requests"`);
  }
}
