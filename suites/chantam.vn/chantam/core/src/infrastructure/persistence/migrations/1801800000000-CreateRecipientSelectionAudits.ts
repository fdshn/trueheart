import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit lý do hệ thống tự chọn người nhận (PR #46 §9).
 *
 * Một dòng cho MỖI lượt trao do job tạo, khoá chính là `transaction_id` — ghi trong CÙNG
 * transaction với lượt trao, nên có lượt trao tự chọn là có lý do, và hai lượt chạy song
 * song không thể để lại hai lý do cho một lượt.
 *
 * Lưu số đo của người thắng và người về nhì tại THỜI ĐIỂM chọn: số đo thay đổi theo thời
 * gian (đã nhận thêm quà, đổi vị trí), và "vì sao lúc đó chọn người này" phải trả lời được
 * từ chính dòng này.
 */
export class CreateRecipientSelectionAudits1801800000000 implements MigrationInterface {
  name = 'CreateRecipientSelectionAudits1801800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recipient_selection_audits" (
        "transaction_id" uuid NOT NULL,
        "post_id" uuid NOT NULL,
        "request_id" uuid NOT NULL,
        "requester_id" uuid NOT NULL,
        "trigger" varchar(16) NOT NULL,
        "deciding_criterion" varchar(40) NOT NULL,
        "criteria_order" jsonb NOT NULL,
        "winner_metrics" jsonb NOT NULL,
        "runner_up_metrics" jsonb,
        "candidate_count" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recipient_selection_audits" PRIMARY KEY ("transaction_id"),
        CONSTRAINT "FK_recipient_selection_audits_transaction" FOREIGN KEY ("transaction_id")
          REFERENCES "gift_transactions"("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_recipient_selection_audits_trigger" CHECK ("trigger" IN ('AUTOMATIC')),
        CONSTRAINT "CHK_recipient_selection_audits_candidates" CHECK ("candidate_count" > 0),
        CONSTRAINT "CHK_recipient_selection_audits_runner_up" CHECK (
          ("deciding_criterion" = 'ONLY_CANDIDATE') = ("runner_up_metrics" IS NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_recipient_selection_audits_post" ON "recipient_selection_audits" ("post_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "recipient_selection_audits"`);
  }
}
