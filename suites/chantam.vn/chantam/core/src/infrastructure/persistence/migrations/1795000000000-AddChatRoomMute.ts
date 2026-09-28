import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tắt thông báo theo từng phòng chat — 28/09.
 *
 * Người bị làm phiền giữa chừng hiện chỉ có một cửa thoát: huỷ lượt trao, thứ
 * khoá phòng ngay nhưng cũng bỏ luôn món đồ họ đang chờ. Với người vẫn muốn
 * nhận, cái họ cần là im lặng chứ không phải mất lượt.
 *
 * **Hai cột chứ không một.** Tắt thông báo là lựa chọn của TỪNG NGƯỜI: người
 * tặng tắt không được kéo theo người nhận. Một cột chung sẽ biến một thao tác
 * riêng tư thành một thao tác áp cho cả hai.
 *
 * Mốc thời gian chứ không phải boolean: biết được người ta tắt từ lúc nào là
 * biết được điều đó xảy ra trước hay sau khi họ gửi báo xấu.
 */
export class AddChatRoomMute1795000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      ADD COLUMN IF NOT EXISTS "giver_muted_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "receiver_muted_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      DROP COLUMN IF EXISTS "giver_muted_at",
      DROP COLUMN IF EXISTS "receiver_muted_at"
    `);
  }
}
