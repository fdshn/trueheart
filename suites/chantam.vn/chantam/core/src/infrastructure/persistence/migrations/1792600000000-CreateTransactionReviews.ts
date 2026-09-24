import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đánh giá sau giao dịch (F42) và chỉ số Giver Accuracy (F43).
 *
 * **Một bảng cho cả hai.** Người nhận chấm hai thứ trong cùng một lần: trải
 * nghiệm chung, và mức chính xác của mô tả so với hàng thật. Tách đôi bảng thì
 * phải giữ hai bản ghi cho một hành động, và chúng sẽ lệch nhau.
 *
 * **Chỉ người nhận chấm `accuracy_percent`.** Người tặng không ở vị trí đánh
 * giá mô tả của chính mình, nên ràng buộc ở database chứ không để tầng ứng
 * dụng tự hứa.
 *
 * **Chỉ ghi thêm.** Chỉ số accuracy quyết định một tài khoản có bị đưa vào
 * diện xem xét hay không; một đánh giá sửa được sau đó là một chỉ số không
 * chứng minh được điều gì.
 *
 * **`REVIEW_REQUIRED` là CỜ RIÊNG, không phải giá trị của `users.status`.**
 * Enum đó (ACTIVE/SUSPENDED/BANNED) đang gác đăng nhập và phân quyền — thêm
 * một giá trị vào là vô tình khoá tài khoản, trong khi F43 ghi rõ "không tự
 * động phạt".
 */
export class CreateTransactionReviews1792600000000 implements MigrationInterface {
  name = 'CreateTransactionReviews1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."transaction_review_role_enum"
      AS ENUM ('GIVER', 'RECEIVER')
    `);

    await queryRunner.query(`
      CREATE TABLE "transaction_reviews" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "reviewee_id" uuid NOT NULL,
        "reviewer_role" "public"."transaction_review_role_enum" NOT NULL,
        "rating" smallint NOT NULL,
        "accuracy_percent" smallint,
        "comment" varchar(1000),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transaction_reviews_global_id" UNIQUE ("global_id"),
        -- Mỗi người đánh giá một lượt trao ĐÚNG một lần.
        CONSTRAINT "UQ_transaction_reviews_one_per_reviewer"
          UNIQUE ("transaction_id", "reviewer_id"),
        CONSTRAINT "FK_transaction_reviews_transaction"
          FOREIGN KEY ("transaction_id")
          REFERENCES "gift_transactions"("global_id"),
        CONSTRAINT "FK_transaction_reviews_reviewer"
          FOREIGN KEY ("reviewer_id") REFERENCES "users"("global_id"),
        CONSTRAINT "FK_transaction_reviews_reviewee"
          FOREIGN KEY ("reviewee_id") REFERENCES "users"("global_id"),
        CONSTRAINT "CHK_transaction_reviews_not_self"
          CHECK ("reviewer_id" <> "reviewee_id"),
        CONSTRAINT "CHK_transaction_reviews_rating"
          CHECK ("rating" BETWEEN 1 AND 5),
        -- Chỉ người nhận chấm độ chính xác của mô tả; người tặng thì không.
        CONSTRAINT "CHK_transaction_reviews_accuracy_role"
          CHECK (
            ("reviewer_role" = 'RECEIVER'
              AND "accuracy_percent" IS NOT NULL
              AND "accuracy_percent" BETWEEN 0 AND 100)
            OR
            ("reviewer_role" = 'GIVER' AND "accuracy_percent" IS NULL)
          )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_transaction_reviews_reviewee"
      ON "transaction_reviews" ("reviewee_id", "created_at" DESC)
    `);

    // Chỉ ghi thêm, cùng lối với point_ledger: chỉ số accuracy quyết định một
    // tài khoản có vào diện xem xét hay không, nên đánh giá sửa được sau đó là
    // một chỉ số không chứng minh được gì.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION transaction_reviews_append_only()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'transaction_reviews chi duoc ghi them, khong sua hoac xoa';
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_transaction_reviews_append_only"
      BEFORE UPDATE OR DELETE ON "transaction_reviews"
      FOR EACH ROW EXECUTE FUNCTION transaction_reviews_append_only()
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "giver_accuracy_percent" smallint,
        ADD COLUMN IF NOT EXISTS "giver_accuracy_samples" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "accuracy_review_required" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_users_giver_accuracy"
          CHECK (
            "giver_accuracy_percent" IS NULL
            OR "giver_accuracy_percent" BETWEEN 0 AND 100
          ),
        ADD CONSTRAINT "CHK_users_giver_accuracy_samples"
          CHECK ("giver_accuracy_samples" >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "CHK_users_giver_accuracy_samples",
        DROP CONSTRAINT IF EXISTS "CHK_users_giver_accuracy",
        DROP COLUMN IF EXISTS "accuracy_review_required",
        DROP COLUMN IF EXISTS "giver_accuracy_samples",
        DROP COLUMN IF EXISTS "giver_accuracy_percent"
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_transaction_reviews_append_only" ON "transaction_reviews"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS transaction_reviews_append_only()`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_reviews"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."transaction_review_role_enum"`,
    );
  }
}
