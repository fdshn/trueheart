import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR 22/11/2026 đợt 3 — giám sát viên là một VAI trong luồng tham gia.
 *
 * - `campaign_participations.role` (`PARTICIPANT` | `SUPERVISOR`), mặc định `PARTICIPANT`; giữ
 *   unique `(campaign_id, user_id)` — mỗi người một vai.
 * - `campaigns.minimum_participants` → `minimum_supervisors`, `minimum_participant_rank` →
 *   `minimum_supervisor_rank` (kèm đổi tên CHECK): số tối thiểu và hạng tối thiểu nay áp cho
 *   giám sát viên.
 */
export class CharitySupervisorRole1804200000000 implements MigrationInterface {
  name = 'CharitySupervisorRole1804200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_participations"
        ADD COLUMN "role" varchar(12) NOT NULL DEFAULT 'PARTICIPANT',
        ADD CONSTRAINT "CHK_campaign_participations_role"
          CHECK ("role" IN ('PARTICIPANT', 'SUPERVISOR'))
    `);
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME COLUMN "minimum_participants" TO "minimum_supervisors"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME COLUMN "minimum_participant_rank" TO "minimum_supervisor_rank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME CONSTRAINT "CHK_campaigns_minimum_participants" TO "CHK_campaigns_minimum_supervisors"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME CONSTRAINT "CHK_campaigns_minimum_participant_rank" TO "CHK_campaigns_minimum_supervisor_rank"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME CONSTRAINT "CHK_campaigns_minimum_supervisor_rank" TO "CHK_campaigns_minimum_participant_rank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME CONSTRAINT "CHK_campaigns_minimum_supervisors" TO "CHK_campaigns_minimum_participants"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME COLUMN "minimum_supervisor_rank" TO "minimum_participant_rank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME COLUMN "minimum_supervisors" TO "minimum_participants"`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_participations"
        DROP CONSTRAINT IF EXISTS "CHK_campaign_participations_role",
        DROP COLUMN IF EXISTS "role"
    `);
  }
}
