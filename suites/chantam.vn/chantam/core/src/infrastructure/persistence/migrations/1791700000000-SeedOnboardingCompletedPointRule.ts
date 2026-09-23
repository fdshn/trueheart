import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thưởng điểm khi hoàn thành Onboarding (Member threshold = 224 điểm).
 *
 * Theo BR-PROF-RANK-02 trong SRS, mốc Member là 224 điểm cống hiến.
 * Hoàn thành các nhiệm vụ bắt buộc trong Onboarding mở quyền Member và
 * cấp đủ 224 điểm để user đạt mốc cấp bậc này trên Point Ledger.
 */
export class SeedOnboardingCompletedPointRule1791700000000 implements MigrationInterface {
  name = 'SeedOnboardingCompletedPointRule1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO point_rules
        (code, points, affects_lifetime, daily_cap, version)
      VALUES
        ('ONBOARDING_COMPLETED', 224, true, NULL, 1)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM point_rules
      WHERE code = 'ONBOARDING_COMPLETED'
    `);
  }
}
