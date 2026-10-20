import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đích điều hướng của thông báo: `target_type` / `target_id`.
 *
 * `reference_*` nói đối tượng SINH RA sự kiện; `target_*` nói màn mobile phải mở.
 * Hai thứ trùng nhau với bài, lượt trao, phòng chat — nhưng khác hẳn với yêu cầu xin
 * đồ (mở bài), lượt đóng góp và giao nhận (mở hoạt động), báo xấu (mở nội dung bị
 * báo). Trước đây mobile phải đoán loại id theo `type`. Xem `NotificationTargetTypes`.
 *
 * ## Ràng buộc khớp hợp đồng
 *
 * Đích cần id thì phải có id; màn "của tôi" (`RANK`, `REFERRAL`) thì id phải NULL.
 * Một dòng sai cặp là một nút bấm 404 hoặc mở nhầm màn — chặn ở database cho cả SQL tay.
 *
 * ## Backfill
 *
 * Điền cho thông báo đã có theo đúng luật mà code mới ghi. Dòng không suy ra được
 * (báo xấu một NGƯỜI, đối tượng đã bị xoá) để NULL — mobile mở hộp thư, như trước.
 * Thông báo bị dọn sau 90 ngày nên số dòng cần điền nhỏ.
 */
export class AddNotificationTargets1801100000000 implements MigrationInterface {
  name = 'AddNotificationTargets1801100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD COLUMN IF NOT EXISTS "target_type" varchar(32),
        ADD COLUMN IF NOT EXISTS "target_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
        DROP CONSTRAINT IF EXISTS "CHK_notifications_target"
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD CONSTRAINT "CHK_notifications_target" CHECK (
          CASE
            WHEN "target_type" IS NULL THEN "target_id" IS NULL
            WHEN "target_type" IN ('RANK', 'REFERRAL') THEN "target_id" IS NULL
            WHEN "target_type" IN
              ('POST', 'GIFT_TRANSACTION', 'CHAT_ROOM', 'CHARITY_CAMPAIGN', 'DHARMA_THREAD')
              THEN "target_id" IS NOT NULL
            ELSE false
          END
        )
    `);

    // Đích chính là đối tượng tham chiếu.
    await queryRunner.query(`
      UPDATE notifications
         SET target_type = reference_type, target_id = reference_id
       WHERE target_type IS NULL
         AND reference_id IS NOT NULL
         AND reference_type IN ('POST', 'GIFT_TRANSACTION', 'CHAT_ROOM', 'DHARMA_THREAD')
    `);
    // Yêu cầu xin đồ → bài.
    await queryRunner.query(`
      UPDATE notifications n
         SET target_type = 'POST', target_id = request.post_id
        FROM gift_requests request
       WHERE n.target_type IS NULL
         AND n.reference_type = 'GIFT_REQUEST'
         AND request.global_id = n.reference_id
    `);
    // Lượt đóng góp, lượt giao nhận → hoạt động.
    await queryRunner.query(`
      UPDATE notifications n
         SET target_type = 'CHARITY_CAMPAIGN', target_id = contribution.campaign_id
        FROM campaign_contributions contribution
       WHERE n.target_type IS NULL
         AND n.reference_type = 'CHARITY_CONTRIBUTION'
         AND contribution.global_id = n.reference_id
    `);
    await queryRunner.query(`
      UPDATE notifications n
         SET target_type = 'CHARITY_CAMPAIGN', target_id = delivery.campaign_id
        FROM campaign_deliveries delivery
       WHERE n.target_type IS NULL
         AND n.reference_type = 'CHARITY_DELIVERY'
         AND delivery.global_id = n.reference_id
    `);
    // Màn "của tôi".
    await queryRunner.query(`
      UPDATE notifications
         SET target_type = 'RANK', target_id = NULL
       WHERE target_type IS NULL
         AND reference_type IN ('USER_RANK', 'RANK_MAINTENANCE_CYCLE')
    `);
    await queryRunner.query(`
      UPDATE notifications
         SET target_type = 'REFERRAL', target_id = NULL
       WHERE target_type IS NULL AND reference_type = 'REFERRAL'
    `);

    // Nội dung bị báo xấu (CONTENT_MODERATED ghi reference_type = loại nội dung;
    // REPORT_REVIEWED cũ ghi 'REPORT' kèm id NỘI DUNG, tra lại loại qua báo xấu của
    // chính người nhận). Bình luận mở bài/chủ đề chứa nó; tin nhắn mở phòng.
    await queryRunner.query(`
      WITH resolved AS (
        SELECT n.id,
               COALESCE(report.target_type::text, n.reference_type) AS content_type,
               n.reference_id AS content_id
          FROM notifications n
          LEFT JOIN LATERAL (
            SELECT r.target_type FROM reports r
             WHERE n.reference_type = 'REPORT'
               AND r.target_id = n.reference_id
               AND r.reporter_user_id = n.user_id
             LIMIT 1
          ) report ON true
         WHERE n.target_type IS NULL
           AND n.type IN ('REPORT_REVIEWED', 'CONTENT_MODERATED')
           AND n.reference_id IS NOT NULL
      ), located AS (
        SELECT resolved.id,
               CASE resolved.content_type
                 WHEN 'POST' THEN 'POST'
                 WHEN 'DHARMA_THREAD' THEN 'DHARMA_THREAD'
                 WHEN 'CHAT_MESSAGE' THEN 'CHAT_ROOM'
                 WHEN 'COMMENT' THEN comment.subject_type::text
               END AS target_type,
               CASE resolved.content_type
                 WHEN 'POST' THEN resolved.content_id
                 WHEN 'DHARMA_THREAD' THEN resolved.content_id
                 WHEN 'CHAT_MESSAGE' THEN message.room_id
                 WHEN 'COMMENT' THEN comment.subject_id
               END AS target_id
          FROM resolved
          LEFT JOIN content_comments comment
            ON resolved.content_type = 'COMMENT' AND comment.global_id = resolved.content_id
          LEFT JOIN chat_messages message
            ON resolved.content_type = 'CHAT_MESSAGE' AND message.global_id = resolved.content_id
      )
      UPDATE notifications n
         SET target_type = located.target_type, target_id = located.target_id
        FROM located
       WHERE n.id = located.id
         AND located.target_type IN ('POST', 'DHARMA_THREAD', 'CHAT_ROOM')
         AND located.target_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
        DROP CONSTRAINT IF EXISTS "CHK_notifications_target",
        DROP COLUMN IF EXISTS "target_id",
        DROP COLUMN IF EXISTS "target_type"
    `);
  }
}
