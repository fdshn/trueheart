import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hợp đồng thuê (lease) cho lượt gửi hàng loạt (CMS B11, 16/10/2026).
 *
 * Trước đây `findNextPending` nhặt cả `SENDING` để nối lại lượt chết giữa đường — đúng ý,
 * nhưng KHÔNG có gì ngăn hai tiến trình nhặt cùng một lượt: hai cron chồng nhau, hoặc cron
 * với nút "Gửi ngay" trên CMS. Khoá chống trùng vẫn chặn gửi đôi cho một người, nhưng cả
 * hai cùng cộng `audience_count`/`notified_count`, nên báo cáo nói gấp đôi số thật.
 *
 * `lease_until` là mốc hết hạn của người đang giữ lượt gửi. Nhận một lượt = một câu
 * `UPDATE` chỉ khớp khi lease trống hoặc đã hết hạn; mỗi lô gia hạn thêm; xong hoặc hỏng
 * thì trả lease. Tiến trình chết giữa đường thì lease tự hết hạn và lượt sau nhặt lại —
 * giữ đúng ý cũ, chỉ bỏ đi khả năng hai người cùng làm.
 */
export class AddBroadcastLease1800900000000 implements MigrationInterface {
  name = 'AddBroadcastLease1800900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_broadcasts"
      ADD COLUMN IF NOT EXISTS "lease_until" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_broadcasts" DROP COLUMN IF EXISTS "lease_until"
    `);
  }
}
