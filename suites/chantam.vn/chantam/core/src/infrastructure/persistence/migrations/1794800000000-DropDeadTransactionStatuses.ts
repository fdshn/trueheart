import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dọn hai trạng thái lượt trao không còn đường nào ghi — chốt 28/09.
 *
 * `REQUESTED` chỉ sinh ra được từ `POST /transactions`, cửa đã gỡ vì nó tạo
 * lượt trao mà bỏ qua mọi cổng của luồng xin nhận. `REJECTED` thì chưa đường nào
 * từng ghi: từ chối một **yêu cầu** là việc của `gift_requests`, không phải của
 * `gift_transactions`.
 *
 * Cột `status` là `varchar` chứ không phải enum, nên không có kiểu nào để drop.
 * Nhưng nó mang **DEFAULT `'REQUESTED'`** — một cái bẫy: bất kỳ câu INSERT nào
 * quên truyền `status` sẽ rơi thẳng vào một trạng thái chết mà không endpoint
 * nào đẩy đi tiếp được. Bỏ default, và thay bằng một ràng buộc chỉ cho phép bốn
 * trạng thái còn sống.
 *
 * Dòng cũ đổi sang `CANCELLED` chứ không xoá: sổ sách một lượt trao là bằng
 * chứng cho tranh chấp, và `REQUESTED` nghĩa là chưa ai duyệt nên đóng lại là
 * mô tả đúng chuyện đã xảy ra.
 */
export class DropDeadTransactionStatuses1794800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "gift_transactions"
      SET "status" = 'CANCELLED',
          "closed_at" = COALESCE("closed_at", now()),
          -- closed_by bắt buộc đi kèm closed_at theo
          -- CHK_gift_transactions_closed_pairing. Không có người thật để ghi,
          -- nên ghi chính người tặng: họ là bên duy nhất từng có quyền duyệt
          -- những lượt này.
          "closed_by" = COALESCE("closed_by", "giver_id"),
          "close_reason" = COALESCE(
            "close_reason",
            'Đóng khi dọn trạng thái không còn dùng (28/09)'
          )
      WHERE "status" IN ('REQUESTED', 'REJECTED')
    `);

    await queryRunner.query(`
      ALTER TABLE "gift_transactions" ALTER COLUMN "status" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
      ADD CONSTRAINT "CHK_gift_transactions_live_status"
      CHECK ("status" IN ('ACCEPTED', 'DELIVERING', 'COMPLETED', 'CANCELLED'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
      DROP CONSTRAINT IF EXISTS "CHK_gift_transactions_live_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "gift_transactions"
      ALTER COLUMN "status" SET DEFAULT 'REQUESTED'
    `);
    // Những dòng đã đổi sang CANCELLED thì KHÔNG dựng lại: sau bước trên chúng
    // lẫn hẳn vào các lượt vốn đã bị huỷ, và đẩy tất cả về REQUESTED là mở lại
    // cả những lượt chưa bao giờ ở trạng thái đó.
  }
}
