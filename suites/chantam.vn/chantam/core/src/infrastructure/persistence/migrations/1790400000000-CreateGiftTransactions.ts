import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGiftTransactions1790400000000 implements MigrationInterface {
  name = 'CreateGiftTransactions1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gift_transactions" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "post_id" uuid NOT NULL,
        "giver_id" uuid NOT NULL,
        "receiver_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "status" varchar(20) NOT NULL DEFAULT 'REQUESTED',
        "requested_at" timestamptz NOT NULL DEFAULT now(),
        "accepted_at" timestamptz,
        "completed_at" timestamptz,
        "closed_at" timestamptz,
        "close_reason" varchar(200),
        CONSTRAINT "PK_gift_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gift_transactions_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_gift_transactions_post"
          FOREIGN KEY ("post_id") REFERENCES posts("global_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_gift_transactions_giver"
          FOREIGN KEY ("giver_id") REFERENCES users("global_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_gift_transactions_receiver"
          FOREIGN KEY ("receiver_id") REFERENCES users("global_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_gift_transactions_status" CHECK ("status" IN (
          'REQUESTED', 'ACCEPTED', 'DELIVERING', 'COMPLETED', 'CANCELLED', 'REJECTED'
        )),
        CONSTRAINT "CHK_gift_transactions_quantity" CHECK ("quantity" > 0),
        -- Tự tặng cho chính mình là đường farm điểm rẻ nhất. Chặn ở schema chứ
        -- không chỉ ở tầng nghiệp vụ.
        CONSTRAINT "CHK_gift_transactions_not_self" CHECK ("giver_id" <> "receiver_id"),
        -- COMPLETED thì bắt buộc có mốc hoàn tất: bộ đếm hoạt động rank đếm
        -- theo completed_at, thiếu nó là giao dịch vô hình với rank.
        CONSTRAINT "CHK_gift_transactions_completed_at" CHECK (
          ("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)
        )
      )
    `);

    // Một người chỉ được có MỘT yêu cầu đang mở trên cùng một bài. Không có
    // ràng buộc này thì bấm nhiều lần là chiếm hết suất của người khác.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_gift_transactions_open_request"
      ON "gift_transactions" ("post_id", "receiver_id")
      WHERE "status" IN ('REQUESTED', 'ACCEPTED', 'DELIVERING')
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_gift_transactions_post_status" ON "gift_transactions" ("post_id", "status")`,
    );
    // Bộ đếm hoạt động của rank luôn hỏi theo người tặng và mốc hoàn tất.
    await queryRunner.query(
      `CREATE INDEX "IDX_gift_transactions_giver_completed" ON "gift_transactions" ("giver_id", "completed_at")`,
    );
    // Job tự hoàn tất quét theo trạng thái và thời điểm nhận.
    await queryRunner.query(
      `CREATE INDEX "IDX_gift_transactions_due_autocomplete" ON "gift_transactions" ("status", "accepted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gift_transactions"`);
  }
}
