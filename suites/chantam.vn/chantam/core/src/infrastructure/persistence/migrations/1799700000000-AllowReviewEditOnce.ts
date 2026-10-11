import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cho mỗi bên sửa đánh giá của chính mình ĐÚNG một lần (CHỐT-10 mục 4).
 *
 * ## Vì sao nới một bảng cố ý bất biến
 *
 * `CreateTransactionReviews` khoá bảng này bằng một trigger chặn mọi `UPDATE` và
 * `DELETE`, với lý do ghi thẳng trong đó: *"một đánh giá sửa được sau đó là một
 * chỉ số không chứng minh được điều gì."* Lý do ấy vẫn đúng — nên lát này KHÔNG
 * mở bảng ra, mà đổi bất biến từ *"không bao giờ sửa"* sang *"sửa đúng một lần,
 * và lần sửa đó không xoá được dấu vết"*.
 *
 * CHỐT-10 mục 4: *"Mỗi người được sửa review của chính mình tối đa một lần trước
 * `completed_at + N ngày`. Lần sửa giữ audit trước/sau; sau hạn hoặc đã sửa một
 * lần thì khoá."*
 *
 * ## Audit nằm TRONG hàng, không ở bảng riêng
 *
 * Vì "tối đa một lần" làm bản ghi cũ có kích cỡ cố định: đúng một phiên bản
 * trước. Một bảng revision cho một hàng duy nhất là ba câu JOIN để đọc thứ mà
 * bốn cột nói xong, và nó mở cửa cho câu hỏi "revision thứ ba ở đâu" mà nghiệp
 * vụ không có câu trả lời.
 *
 * ## Trigger TỰ chụp ảnh, không tin nơi gọi
 *
 * `NEW.previous_* := OLD.*` nằm trong trigger chứ không trong câu `UPDATE` của
 * repository. Để nơi gọi tự ghi bản sao thì một lượt `UPDATE` viết tay — một lần
 * sửa dữ liệu trên production, một migration sau này — sẽ sửa đánh giá mà không
 * để lại gì, và đó đúng là thứ bảng này được dựng để chống.
 *
 * Hạn `N ngày` KHÔNG vào trigger: `N` là `review.grace.graceDays`, một cấu hình
 * động trong `system_configs` mà Admin đổi được. Trigger giữ phần không phụ thuộc
 * cấu hình (một lần, có dấu vết, không xoá được); use case giữ phần cửa sổ thời
 * gian.
 */
export class AllowReviewEditOnce1799700000000 implements MigrationInterface {
  name = 'AllowReviewEditOnce1799700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transaction_reviews"
        ADD COLUMN IF NOT EXISTS "edited_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "previous_rating" smallint,
        ADD COLUMN IF NOT EXISTS "previous_accuracy_percent" smallint,
        ADD COLUMN IF NOT EXISTS "previous_comment" varchar(1000)
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction_reviews"
        DROP CONSTRAINT IF EXISTS "CHK_transaction_reviews_edit_audit",
        DROP CONSTRAINT IF EXISTS "CHK_transaction_reviews_previous_rating",
        DROP CONSTRAINT IF EXISTS "CHK_transaction_reviews_previous_accuracy"
    `);

    // "Đã sửa" và "có bản cũ" phải đi cùng nhau. `rating` là `NOT NULL` nên bản
    // cũ luôn có nó — còn `previous_comment` thì không kiểm được, vì bình luận
    // rỗng là hợp lệ và `null` ở đó nghĩa là "lần đầu không viết gì".
    await queryRunner.query(`
      ALTER TABLE "transaction_reviews"
        ADD CONSTRAINT "CHK_transaction_reviews_edit_audit"
          CHECK (("edited_at" IS NULL) = ("previous_rating" IS NULL)),
        ADD CONSTRAINT "CHK_transaction_reviews_previous_rating"
          CHECK ("previous_rating" IS NULL OR "previous_rating" BETWEEN 1 AND 5),
        ADD CONSTRAINT "CHK_transaction_reviews_previous_accuracy"
          CHECK (
            "previous_accuracy_percent" IS NULL
            OR "previous_accuracy_percent" BETWEEN 0 AND 100
          )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION transaction_reviews_edit_once()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'transaction_reviews khong duoc xoa';
        END IF;

        IF OLD.edited_at IS NOT NULL THEN
          RAISE EXCEPTION 'danh gia chi duoc sua MOT lan';
        END IF;

        IF NEW.id <> OLD.id
           OR NEW.global_id <> OLD.global_id
           OR NEW.transaction_id <> OLD.transaction_id
           OR NEW.reviewer_id <> OLD.reviewer_id
           OR NEW.reviewee_id <> OLD.reviewee_id
           OR NEW.reviewer_role <> OLD.reviewer_role
           OR NEW.created_at <> OLD.created_at THEN
          RAISE EXCEPTION 'chi sua duoc rating, accuracy_percent va comment';
        END IF;

        -- Trigger chụp ảnh, không phải nơi gọi: một lượt UPDATE viết tay cũng
        -- phải để lại bản cũ.
        NEW.previous_rating := OLD.rating;
        NEW.previous_accuracy_percent := OLD.accuracy_percent;
        NEW.previous_comment := OLD.comment;
        NEW.edited_at := now();
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_transaction_reviews_append_only"
      ON "transaction_reviews"
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_transaction_reviews_edit_once"
      ON "transaction_reviews"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_transaction_reviews_edit_once"
      BEFORE UPDATE OR DELETE ON "transaction_reviews"
      FOR EACH ROW EXECUTE FUNCTION transaction_reviews_edit_once()
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS transaction_reviews_append_only()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dựng lại hàm chặn-tất-cả của `CreateTransactionReviews`.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION transaction_reviews_append_only()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'transaction_reviews chi duoc ghi them, khong sua hoac xoa';
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_transaction_reviews_edit_once"
      ON "transaction_reviews"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_transaction_reviews_append_only"
      BEFORE UPDATE OR DELETE ON "transaction_reviews"
      FOR EACH ROW EXECUTE FUNCTION transaction_reviews_append_only()
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS transaction_reviews_edit_once()
    `);

    // Bản cũ của những đánh giá đã sửa mất theo bốn cột này. `down()` ở đây là
    // đường quay lại một thiết kế KHÔNG có chỗ chứa chúng, nên không có cách nào
    // giữ — ghi rõ ra để người chạy biết mình mất gì.
    await queryRunner.query(`
      ALTER TABLE "transaction_reviews"
        DROP CONSTRAINT IF EXISTS "CHK_transaction_reviews_previous_accuracy",
        DROP CONSTRAINT IF EXISTS "CHK_transaction_reviews_previous_rating",
        DROP CONSTRAINT IF EXISTS "CHK_transaction_reviews_edit_audit",
        DROP COLUMN IF EXISTS "previous_comment",
        DROP COLUMN IF EXISTS "previous_accuracy_percent",
        DROP COLUMN IF EXISTS "previous_rating",
        DROP COLUMN IF EXISTS "edited_at"
    `);
  }
}
