import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bước trao đồ và ảnh làm bằng chứng (H1, H5, CH-2).
 *
 * **Vì sao cần `handed_over_at`.** `DELIVERING` có trong enum từ đầu nhưng không
 * câu lệnh nào chuyển giao dịch sang nó — không có bước "đã trao". Hệ quả: đồng
 * hồ tự hoàn tất đếm từ `accepted_at`, nên ship liên tỉnh 4–5 ngày hoặc hai bên
 * hẹn cuối tuần sau thì cron đóng lượt trao TRƯỚC KHI hàng tới nơi.
 *
 * Tên cột là `handed_over_at` chứ không phải `shipped_at`: tự đến lấy cũng có
 * lúc trao đồ, và tranh chấp "tôi chưa hề nhận được" vẫn xảy ra khi không có
 * ship.
 *
 * **Vì sao ảnh nằm ở bảng riêng, không phải cột trên giao dịch.** Ba loại ảnh,
 * mỗi loại tối đa ba tấm, do hai người khác nhau tải lên ở ba thời điểm khác
 * nhau. Nhồi vào jsonb thì mất kiểm soát số lượng và mất khoá ngoại tới người
 * tải; một bảng cho phép database tự chặn tấm thứ tư.
 *
 * Trần ba tấm được ràng bằng `slot` 1–3 + UNIQUE, tức **database** chặn chứ
 * không phải một phép đếm ở tầng ứng dụng vốn thua cuộc khi hai request vào
 * cùng lúc.
 *
 * **Ảnh KHÔNG bị xoá theo hạn lưu trữ chat.** Chat là hội thoại tạm; ảnh là
 * bằng chứng. Tách bảng là điều làm cho việc xoá chat sau 1–3 tuần trở nên an
 * toàn.
 */
export class AddHandoverAndEvidence1791300000000 implements MigrationInterface {
  name = 'AddHandoverAndEvidence1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
      ADD COLUMN "handed_over_at" timestamptz
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."gift_transaction_evidence_kind_enum"
      AS ENUM ('HANDOVER', 'RECEIPT', 'RETURNED')
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_transaction_evidence" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "kind" "public"."gift_transaction_evidence_kind_enum" NOT NULL,
        "slot" smallint NOT NULL,
        "uploaded_by" uuid NOT NULL,
        "storage_key" varchar(500) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gift_transaction_evidence" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gift_transaction_evidence_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_gift_transaction_evidence_key" UNIQUE ("storage_key"),
        -- Trần ba tấm mỗi loại, do database giữ. Một phép đếm ở tầng ứng dụng
        -- thua cuộc khi hai request tải ảnh vào cùng một lúc.
        CONSTRAINT "UQ_gift_transaction_evidence_slot"
          UNIQUE ("transaction_id", "kind", "slot"),
        CONSTRAINT "CHK_gift_transaction_evidence_slot"
          CHECK ("slot" BETWEEN 1 AND 3),
        -- Không ON DELETE CASCADE: bằng chứng không được biến mất cùng thứ nó
        -- làm chứng cho.
        CONSTRAINT "FK_gift_transaction_evidence_transaction"
          FOREIGN KEY ("transaction_id")
          REFERENCES "gift_transactions"("global_id"),
        CONSTRAINT "FK_gift_transaction_evidence_uploader"
          FOREIGN KEY ("uploaded_by") REFERENCES "users"("global_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_gift_transaction_evidence_lookup"
       ON "gift_transaction_evidence" ("transaction_id", "kind", "slot")`,
    );

    // Bằng chứng cũng chỉ ghi thêm: sửa hay xoá một tấm ảnh sau khi tranh chấp
    // nổ ra thì nó thôi là bằng chứng.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gift_transaction_evidence_append_only()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'gift_transaction_evidence chi duoc ghi them';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_gift_transaction_evidence_append_only"
      BEFORE UPDATE OR DELETE ON "gift_transaction_evidence"
      FOR EACH ROW EXECUTE FUNCTION gift_transaction_evidence_append_only()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_gift_transaction_evidence_append_only" ON "gift_transaction_evidence"`,
    );
    await queryRunner.query(
      `DROP FUNCTION gift_transaction_evidence_append_only()`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_gift_transaction_evidence_lookup"`,
    );
    await queryRunner.query(`DROP TABLE "gift_transaction_evidence"`);
    await queryRunner.query(
      `DROP TYPE "public"."gift_transaction_evidence_kind_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gift_transactions" DROP COLUMN "handed_over_at"`,
    );
  }
}
