import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mẫu cho bốn thông báo còn thiếu, và cột mốc chống nhắc trùng.
 *
 * **Vì sao ba lời nhắc này quan trọng hơn vẻ ngoài của chúng:**
 *
 * - Không nhắc người nhận đánh giá thì phần lớn sẽ không đánh giá, và nhánh "áp
 *   mức mặc định sau 7 ngày" thành đường chạy CHÍNH chứ không phải ngoại lệ —
 *   tức chỉ số Giver Accuracy chỉ còn mẫu của người chịu khó chấm, và cả cơ chế
 *   đo độ chính xác mất nghĩa.
 * - Trượt chu kỳ duy trì nay bị TRỪ ĐIỂM và có thể tụt hạng. Báo muộn hơn thời
 *   điểm còn kịp làm nhiệm vụ là báo vô nghĩa.
 * - Báo xấu xử xong mà không báo ai thì người báo không biết mình đúng hay sai,
 *   không hiểu vì sao được cộng 5 điểm; còn người bị xử lý thấy bài mình biến
 *   mất mà không ai nói vì sao.
 *
 * `reminded_at` trên `rank_maintenance_cycles`: thông báo có khoá chống trùng
 * riêng, nhưng cột này giúp câu quét bỏ qua chu kỳ đã nhắc ngay ở tầng SQL thay
 * vì nạp hết rồi lọc — job chạy mỗi ngày trên toàn bảng.
 */
export class SeedReminderNotificationTemplates1793500000000 implements MigrationInterface {
  name = 'SeedReminderNotificationTemplates1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "notification_templates" ("type", "title", "body") VALUES
        ('REVIEW_REMINDER',
         'Bạn chưa đánh giá lượt trao',
         'Hãy chấm mức chính xác của mô tả so với món đồ thật. Còn {daysLeft} ngày trước khi hệ thống áp mức mặc định.'),
        ('RANK_MAINTENANCE_REMINDER',
         'Nhiệm vụ duy trì hạng {rank} sắp hết hạn',
         'Còn {daysLeft} ngày. Bạn đã hoàn tất {giftsDone}/{requiredGifts} lượt trao và {referralsDone}/{requiredReferrals} lượt mời. Không đủ chỉ tiêu sẽ bị trừ {penaltyPoints} điểm.'),
        ('REPORT_REVIEWED',
         'Báo xấu của bạn đã được xem xét',
         'Kết luận: {outcome}. Cảm ơn bạn đã báo.'),
        ('CONTENT_MODERATED',
         'Nội dung của bạn đã bị xử lý',
         'Một nội dung của bạn bị {action} sau khi được xem xét. Lý do: {reason}.')
      ON CONFLICT ("type") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "rank_maintenance_cycles"
      ADD COLUMN IF NOT EXISTS "reminded_at" timestamptz
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rank_maintenance_cycles_reminder"
      ON "rank_maintenance_cycles" ("status", "cycle_end")
      WHERE "reminded_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rank_maintenance_cycles_reminder"`,
    );
    await queryRunner.query(`
      ALTER TABLE "rank_maintenance_cycles"
      DROP COLUMN IF EXISTS "reminded_at"
    `);
    await queryRunner.query(`
      DELETE FROM "notification_templates"
      WHERE "type" IN (
        'REVIEW_REMINDER', 'RANK_MAINTENANCE_REMINDER',
        'REPORT_REVIEWED', 'CONTENT_MODERATED'
      )
    `);
  }
}
