import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đóng góp NGOÀI APP (F65b, lát D — thiết kế §7).
 *
 * Vật phẩm nhận trực tiếp từ người không có tài khoản vẫn phải thành một bản ghi —
 * nếu không, tiến độ của chiến dịch chỉ phản ánh phần đi qua app, và người tổ chức sẽ
 * quay về gõ tay một con số tổng, đúng thứ §7 cấm.
 *
 * ## Không có cột người tặng — và đó là cả điểm chính
 *
 * Tiêu chí §11.10: *"đóng góp ngoài app có audit và không tự cộng điểm cho bất kỳ tài
 * khoản nào"*. Không có cột `contributor_id` nghĩa là không có đường nào, kể cả một lỗi
 * tương lai, gắn được bản ghi này vào một tài khoản để cộng điểm. `source_label` là
 * một nhãn chữ do người tổ chức ghi, không phải một khoá ngoại.
 *
 * ## Sửa sai = huỷ + ghi mới, không UPDATE số lượng
 *
 * §7: *"Sửa sai bằng cách điều chỉnh/hủy bản ghi external contribution có lý do, không
 * ghi đè lịch sử."* Nên:
 *
 * - **Huỷ** đặt `status = 'VOIDED'` kèm ai/lúc nào/vì sao, và hàng vẫn nằm đó.
 * - **Điều chỉnh** là huỷ hàng cũ rồi chèn hàng mới với `replaces_id` trỏ về hàng cũ,
 *   trong cùng một transaction. Đọc chuỗi `replaces_id` là đọc được toàn bộ lịch sử
 *   của một con số.
 *
 * Trigger `TRG_campaign_external_contributions_immutable` canh điều đó ở database:
 * mọi `UPDATE` ngoài việc chuyển `ACTIVE → VOIDED` đều bị từ chối, và không có `DELETE`.
 * Một bản ghi tiến độ sửa được tại chỗ là một bản ghi không chứng minh được gì — cùng
 * lý do với bảng đánh giá.
 *
 * Chỉ bản ghi `ACTIVE` tham gia `received_quantity` của dòng nhu cầu (§7).
 */
export class CreateCharityExternalContributions1800100000000 implements MigrationInterface {
  name = 'CreateCharityExternalContributions1800100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_external_contributions" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "need_item_id" uuid NOT NULL,
        "quantity" int NOT NULL,
        -- Nhãn chữ, không phải khoá ngoại tới users. Xem docblock đầu file.
        "source_label" varchar(200) NOT NULL,
        "received_at" timestamptz NOT NULL,
        "evidence_note" varchar(1000),
        "recorded_by" uuid NOT NULL,
        "status" varchar(10) NOT NULL DEFAULT 'ACTIVE',
        "replaces_id" uuid,
        "voided_at" timestamptz,
        "voided_by" uuid,
        "void_reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_external_contributions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_external_contributions_global_id"
          UNIQUE ("global_id"),
        CONSTRAINT "FK_campaign_external_contributions_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_external_contributions_need"
          FOREIGN KEY ("need_item_id") REFERENCES "campaign_need_items"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_external_contributions_recorder"
          FOREIGN KEY ("recorded_by") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_external_contributions_voider"
          FOREIGN KEY ("voided_by") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_external_contributions_replaces"
          FOREIGN KEY ("replaces_id")
          REFERENCES "campaign_external_contributions"("global_id")
          ON DELETE RESTRICT,
        -- Một hàng chỉ bị THAY bởi tối đa một hàng: chuỗi điều chỉnh là một dãy
        -- thẳng, không rẽ nhánh — rẽ nhánh thì không nói được con số nào là cuối.
        CONSTRAINT "UQ_campaign_external_contributions_replaces"
          UNIQUE ("replaces_id"),
        CONSTRAINT "CHK_campaign_external_contributions_quantity"
          CHECK ("quantity" > 0 AND "quantity" <= 1000000),
        CONSTRAINT "CHK_campaign_external_contributions_status"
          CHECK ("status" IN ('ACTIVE', 'VOIDED')),
        CONSTRAINT "CHK_campaign_external_contributions_voided" CHECK (
          ("status" = 'VOIDED')
            = ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL
               AND "void_reason" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_external_contributions_campaign"
      ON "campaign_external_contributions" ("campaign_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION campaign_external_contributions_immutable()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'campaign_external_contributions khong duoc xoa';
        END IF;

        -- Chỉ một chuyển đổi hợp lệ: ACTIVE -> VOIDED, và chỉ đổi đúng bốn cột của
        -- việc huỷ. Mọi cột còn lại phải giữ nguyên.
        IF OLD.status <> 'ACTIVE' OR NEW.status <> 'VOIDED' THEN
          RAISE EXCEPTION 'chi duoc chuyen ACTIVE sang VOIDED';
        END IF;
        IF NEW.global_id <> OLD.global_id
           OR NEW.campaign_id <> OLD.campaign_id
           OR NEW.need_item_id <> OLD.need_item_id
           OR NEW.quantity <> OLD.quantity
           OR NEW.source_label <> OLD.source_label
           OR NEW.received_at <> OLD.received_at
           OR NEW.recorded_by <> OLD.recorded_by
           OR NEW.created_at <> OLD.created_at
           OR NEW.replaces_id IS DISTINCT FROM OLD.replaces_id
           OR NEW.evidence_note IS DISTINCT FROM OLD.evidence_note THEN
          RAISE EXCEPTION 'khong sua duoc noi dung ban ghi, chi huy duoc';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_campaign_external_contributions_immutable"
      ON "campaign_external_contributions"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_campaign_external_contributions_immutable"
      BEFORE UPDATE OR DELETE ON "campaign_external_contributions"
      FOR EACH ROW EXECUTE FUNCTION campaign_external_contributions_immutable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "campaign_external_contributions"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS campaign_external_contributions_immutable()`,
    );
  }
}
