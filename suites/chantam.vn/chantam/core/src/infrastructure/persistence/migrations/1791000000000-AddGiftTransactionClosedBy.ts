import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ai đã đóng một lượt trao, và vì thế đếm được số lần huỷ (F35).
 *
 * `close_at` và `close_reason` đã có từ migration 1790400000000 nhưng KHÔNG ghi
 * người đóng, nên "ghi lại số lần huỷ" không thực hiện được: huỷ bởi người cho
 * và huỷ bởi người nhận là hai việc khác nhau hoàn toàn khi đánh giá độ tin cậy,
 * mà cả hai đều chỉ để lại một dòng `CANCELLED` giống nhau.
 *
 * Cột này là **bản ghi**, không phải bộ đếm: số lần huỷ đếm từ đây bằng một câu
 * `COUNT`. Một cột `cancelled_count` trên `users` sẽ là con số thứ hai nói về
 * cùng một sự thật, và hai con số thì sớm muộn lệch nhau.
 *
 * Index partial theo `closed_by` chỉ cho dòng đã đóng: dòng đang sống có
 * `closed_by IS NULL` và chiếm chỗ vô ích trong index.
 */
export class AddGiftTransactionClosedBy1791000000000 implements MigrationInterface {
  name = 'AddGiftTransactionClosedBy1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
      ADD COLUMN "closed_by" uuid,
      ADD CONSTRAINT "FK_gift_transactions_closed_by"
        FOREIGN KEY ("closed_by") REFERENCES "users"("global_id")
    `);

    // Có người đóng thì phải có mốc đóng, và ngược lại — nửa vời thì không đọc
    // được là đã đóng hay chưa.
    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
      ADD CONSTRAINT "CHK_gift_transactions_closed_pairing"
      CHECK (
        ("closed_by" IS NULL AND "closed_at" IS NULL)
        OR ("closed_by" IS NOT NULL AND "closed_at" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gift_transactions_closed_by"
      ON "gift_transactions" ("closed_by", "status")
      WHERE "closed_by" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_gift_transactions_closed_by"`);
    await queryRunner.query(
      `ALTER TABLE "gift_transactions" DROP CONSTRAINT "CHK_gift_transactions_closed_pairing"`,
    );
    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
      DROP CONSTRAINT "FK_gift_transactions_closed_by",
      DROP COLUMN "closed_by"
    `);
  }
}
