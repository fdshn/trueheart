import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Điều kiện tham gia chiến dịch từ thiện (PR #54, chốt 18/11).
 *
 * - `minimum_participants`: số người tham gia tối thiểu, `0` = không đặt. Chỉ để tổng kết
 *   cảnh báo — không cột nào tự huỷ chiến dịch theo nó.
 * - `minimum_participant_rank`: hạng tối thiểu để đăng ký, `NULL` = không giới hạn. Đọc ở
 *   lượt đăng ký, so với hạng HIỆN TẠI trong `users` — không theo token.
 *
 * Chiến dịch có sẵn nhận `0` / `NULL`, tức giữ đúng hành vi cũ. Danh sách hạng viết cứng —
 * migration là ảnh chụp lịch sử, khớp `RankOrder` ở core-lib lúc viết.
 */
export class CampaignParticipationRequirements1803600000000 implements MigrationInterface {
  name = 'CampaignParticipationRequirements1803600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN "minimum_participants" integer NOT NULL DEFAULT 0,
        ADD COLUMN "minimum_participant_rank" varchar(20),
        ADD CONSTRAINT "CHK_campaigns_minimum_participants"
          CHECK ("minimum_participants" BETWEEN 0 AND 100000),
        ADD CONSTRAINT "CHK_campaigns_minimum_participant_rank"
          CHECK ("minimum_participant_rank" IS NULL
                 OR "minimum_participant_rank" IN ('VIEWER', 'MEMBER', 'SILVER', 'GOLD', 'DIAMOND'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_minimum_participant_rank",
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_minimum_participants",
        DROP COLUMN IF EXISTS "minimum_participant_rank",
        DROP COLUMN IF EXISTS "minimum_participants"
    `);
  }
}
