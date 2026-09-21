import { MigrationInterface, QueryRunner } from 'typeorm';

export class SnapshotRankMaintenancePolicy1792100000000 implements MigrationInterface {
  public name = 'SnapshotRankMaintenancePolicy1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rank_maintenance_cycles
        ADD COLUMN "required_gifts" integer,
        ADD COLUMN "required_referrals" integer,
        ADD COLUMN "policy_version" integer
    `);
    await queryRunner.query(`
      UPDATE rank_maintenance_cycles cycle
      SET required_gifts = tier.maintenance_gifts,
          required_referrals = tier.maintenance_referrals,
          policy_version = tier.version
      FROM rank_tiers tier
      WHERE tier.rank = cycle.rank
    `);
    await queryRunner.query(`
      ALTER TABLE rank_maintenance_cycles
        ALTER COLUMN "required_gifts" SET NOT NULL,
        ALTER COLUMN "required_referrals" SET NOT NULL,
        ALTER COLUMN "policy_version" SET NOT NULL,
        ADD CONSTRAINT "CHK_rank_maintenance_cycles_requirements"
          CHECK ("required_gifts" >= 0 AND "required_referrals" >= 0 AND "policy_version" > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rank_maintenance_cycles
        DROP CONSTRAINT "CHK_rank_maintenance_cycles_requirements",
        DROP COLUMN "policy_version",
        DROP COLUMN "required_referrals",
        DROP COLUMN "required_gifts"
    `);
  }
}
