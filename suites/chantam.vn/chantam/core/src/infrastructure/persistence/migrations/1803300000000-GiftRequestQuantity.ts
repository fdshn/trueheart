import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Xin nhận theo SỐ LƯỢNG thật, và tách request thành lịch sử (12/11).
 *
 * ## `gift_requests.requested_quantity`
 *
 * Trước đây mỗi lượt trao luôn là 1 món. Nay người xin khai số món, không vượt số còn lại lúc
 * tạo; chủ bài duyệt ĐỦ số đó hoặc không duyệt — không duyệt một phần, không tự giảm số người ta
 * đã đăng ký. Dữ liệu cũ là 1, đúng với cách hệ thống đã trao.
 *
 * ## `gift_requests.status_reason`
 *
 * Mã máy đọc được cho trạng thái đang chờ / đã đóng — app tự dịch, không lưu câu chữ:
 * - `STANDBY`: `OUT_OF_STOCK` (bài hết hàng), `INSUFFICIENT_QUANTITY` (còn hàng nhưng ít hơn số xin).
 * - `CANCELLED`: `POST_COMPLETED` (bài đã trao hết, không bổ sung được), `TRANSACTION_CANCELLED`.
 * CHECK giữ tập mã: một mã gõ sai là app hiện chuỗi thô cho người dùng.
 *
 * ## Một request ĐANG MỞ, không phải một request mỗi cặp
 *
 * `UQ_gift_requests_post_requester` cũ cho đúng MỘT dòng mỗi (bài, người xin): rút rồi gửi lại
 * là ghi đè dòng cũ, nên mất lịch sử và process hiện tại có thể đọc nhầm trạng thái cũ. Nay mỗi
 * lần gửi là một dòng mới; database chỉ chặn hai request cùng ĐANG CHỜ (`PENDING`/`STANDBY`).
 * Request `ACCEPTED` với lượt trao còn sống được chặn ở tầng ứng dụng — điều kiện đó nằm ở bảng
 * khác nên index không diễn đạt được.
 *
 * ## `gift_transactions.request_id`
 *
 * Lượt trao từng nối với request qua cặp (bài, đối phương) — chỉ đúng khi cặp đó có một dòng.
 * Nay có nhiều dòng, nên lượt trao ghi thẳng request sinh ra nó. Dữ liệu cũ điền lại theo luật
 * cũ (một request mỗi cặp nên khớp đúng một dòng); lượt dựng tay không khớp thì để NULL.
 */
export class GiftRequestQuantity1803300000000 implements MigrationInterface {
  name = 'GiftRequestQuantity1803300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gift_requests"
        ADD COLUMN "requested_quantity" int NOT NULL DEFAULT 1,
        ADD COLUMN "status_reason" varchar(40),
        ADD CONSTRAINT "CHK_gift_requests_requested_quantity"
          CHECK ("requested_quantity" >= 1),
        ADD CONSTRAINT "CHK_gift_requests_status_reason"
          CHECK ("status_reason" IS NULL OR "status_reason" IN (
            'OUT_OF_STOCK', 'INSUFFICIENT_QUANTITY',
            'POST_COMPLETED', 'TRANSACTION_CANCELLED'
          ))
    `);

    // Request STANDBY cũ đều do hết hàng (luật cũ chỉ chuyển STANDBY khi kho về 0).
    await queryRunner.query(`
      UPDATE "gift_requests" SET "status_reason" = 'OUT_OF_STOCK'
      WHERE "status" = 'STANDBY' AND "deleted_at" IS NULL
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_gift_requests_post_requester"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_gift_requests_post_requester_open"
        ON "gift_requests" ("post_id", "requester_id")
        WHERE "deleted_at" IS NULL AND "status" IN ('PENDING', 'STANDBY')
    `);
    // Đọc "request mới nhất của tôi trên bài này" — detail bài và feed.
    await queryRunner.query(`
      CREATE INDEX "IDX_gift_requests_post_requester_latest"
        ON "gift_requests" ("post_id", "requester_id", "created_at" DESC, "id" DESC)
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
        ADD COLUMN "request_id" uuid,
        ADD CONSTRAINT "FK_gift_transactions_request"
          FOREIGN KEY ("request_id") REFERENCES "gift_requests"("global_id")
          ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gift_transactions_request"
        ON "gift_transactions" ("request_id")
        WHERE "request_id" IS NOT NULL
    `);
    // Người xin là bên KHÔNG phải tác giả: người nhận ở bài Muốn Tặng, người tặng ở bài Muốn Nhận.
    await queryRunner.query(`
      UPDATE "gift_transactions" deal
      SET "request_id" = request."global_id"
      FROM "posts" post, "gift_requests" request
      WHERE post."global_id" = deal."post_id"
        AND request."post_id" = deal."post_id"
        AND request."deleted_at" IS NULL
        AND request."requester_id" = CASE
              WHEN deal."giver_id" = post."author_id" THEN deal."receiver_id"
              ELSE deal."giver_id"
            END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gift_transactions_request"`,
    );
    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
        DROP CONSTRAINT IF EXISTS "FK_gift_transactions_request",
        DROP COLUMN IF EXISTS "request_id"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gift_requests_post_requester_latest"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_gift_requests_post_requester_open"`,
    );
    // Về lại một dòng mỗi cặp: giữ dòng MỚI NHẤT, xoá mềm phần lịch sử, rồi dựng lại index cũ.
    await queryRunner.query(`
      UPDATE "gift_requests" older SET "deleted_at" = now()
      WHERE older."deleted_at" IS NULL
        AND EXISTS (
          SELECT 1 FROM "gift_requests" newer
          WHERE newer."post_id" = older."post_id"
            AND newer."requester_id" = older."requester_id"
            AND newer."deleted_at" IS NULL
            AND (newer."created_at", newer."id") > (older."created_at", older."id")
        )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_gift_requests_post_requester"
        ON "gift_requests" ("post_id", "requester_id") WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "gift_requests"
        DROP CONSTRAINT IF EXISTS "CHK_gift_requests_status_reason",
        DROP CONSTRAINT IF EXISTS "CHK_gift_requests_requested_quantity",
        DROP COLUMN IF EXISTS "status_reason",
        DROP COLUMN IF EXISTS "requested_quantity"
    `);
  }
}
