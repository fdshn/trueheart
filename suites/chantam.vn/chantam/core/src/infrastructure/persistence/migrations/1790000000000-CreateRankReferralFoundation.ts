import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRankReferralFoundation1790000000000
  implements MigrationInterface
{
  name = 'CreateRankReferralFoundation1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN "referral_code" varchar(12),
        ADD COLUMN "rank_attained_at" timestamptz,
        ADD COLUMN "promotion_locked_until" timestamptz
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_referral_code" ON users ("referral_code")`,
    );
    await queryRunner.query(`
      CREATE TABLE "point_rules" (
        "id" SERIAL NOT NULL,
        "code" varchar(100) NOT NULL,
        "points" integer NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "affects_lifetime" boolean NOT NULL DEFAULT true,
        "daily_cap" integer,
        "version" integer NOT NULL DEFAULT 1,
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_point_rules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_point_rules_code_version" UNIQUE ("code", "version"),
        CONSTRAINT "CHK_point_rules_points" CHECK ("points" >= 0),
        CONSTRAINT "CHK_point_rules_daily_cap" CHECK ("daily_cap" IS NULL OR "daily_cap" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_point_balances" (
        "user_id" uuid NOT NULL,
        "balance" integer NOT NULL DEFAULT 0,
        "lifetime" integer NOT NULL DEFAULT 0,
        "last_entry_id" bigint,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_point_balances" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_user_point_balances_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_user_point_balances_balance" CHECK ("balance" >= 0),
        CONSTRAINT "CHK_user_point_balances_lifetime" CHECK ("lifetime" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "point_ledger" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "rule_code" varchar(100) NOT NULL,
        "rule_version" integer NOT NULL,
        "delta" integer NOT NULL,
        "balance_after" integer NOT NULL,
        "lifetime_after" integer NOT NULL,
        "reference_type" varchar(100) NOT NULL,
        "reference_id" varchar(200) NOT NULL,
        "idempotency_key" varchar(200) NOT NULL,
        "actor" varchar(100) NOT NULL,
        "source" varchar(100) NOT NULL,
        "reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_point_ledger" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_point_ledger_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_point_ledger_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_point_ledger_balance_after" CHECK ("balance_after" >= 0),
        CONSTRAINT "CHK_point_ledger_lifetime_after" CHECK ("lifetime_after" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_point_ledger_user_created" ON point_ledger ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(`
      CREATE TABLE "rank_tiers" (
        "rank" users_rank_enum NOT NULL,
        "threshold_points" integer NOT NULL,
        "warning_points" integer NOT NULL,
        "required_gifts" integer NOT NULL DEFAULT 0,
        "required_referrals" integer NOT NULL DEFAULT 0,
        "maintenance_gifts" integer NOT NULL DEFAULT 0,
        "maintenance_referrals" integer NOT NULL DEFAULT 0,
        "post_quota" integer NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_rank_tiers" PRIMARY KEY ("rank"),
        CONSTRAINT "CHK_rank_tiers_non_negative" CHECK (
          "threshold_points" >= 0 AND "warning_points" >= 0 AND
          "required_gifts" >= 0 AND "required_referrals" >= 0 AND
          "maintenance_gifts" >= 0 AND "maintenance_referrals" >= 0 AND
          "post_quota" >= 0
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "rank_transitions" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "from_rank" users_rank_enum NOT NULL,
        "to_rank" users_rank_enum NOT NULL,
        "reason" varchar(100) NOT NULL,
        "lifetime_points" integer NOT NULL,
        "cycle_id" bigint,
        "actor" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rank_transitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rank_transitions_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "rank_maintenance_cycles" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "rank" users_rank_enum NOT NULL,
        "cycle_start" timestamptz NOT NULL,
        "cycle_end" timestamptz NOT NULL,
        "gifts_done" integer NOT NULL DEFAULT 0,
        "referrals_done" integer NOT NULL DEFAULT 0,
        "status" varchar(30) NOT NULL DEFAULT 'OPEN',
        "evaluated_at" timestamptz,
        CONSTRAINT "PK_rank_maintenance_cycles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rank_maintenance_cycles_user_start" UNIQUE ("user_id", "cycle_start"),
        CONSTRAINT "FK_rank_maintenance_cycles_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_rank_maintenance_cycles_dates" CHECK ("cycle_end" > "cycle_start"),
        CONSTRAINT "CHK_rank_maintenance_cycles_counters" CHECK ("gifts_done" >= 0 AND "referrals_done" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_rank_maintenance_cycles_due" ON rank_maintenance_cycles ("status", "cycle_end")`,
    );
    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" BIGSERIAL NOT NULL,
        "referrer_id" uuid NOT NULL,
        "referee_id" uuid NOT NULL,
        "code" varchar(12) NOT NULL,
        "qualified_at" timestamptz,
        "reward_entry_id" bigint,
        "signup_ip_hash" varchar(128),
        "signup_device_hash" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_referrals" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_referrals_referee_id" UNIQUE ("referee_id"),
        CONSTRAINT "FK_referrals_referrer"
          FOREIGN KEY ("referrer_id") REFERENCES users("global_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_referrals_referee"
          FOREIGN KEY ("referee_id") REFERENCES users("global_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_referrals_not_self" CHECK ("referrer_id" <> "referee_id")
      )
    `);
    await queryRunner.query(`
      CREATE FUNCTION prevent_point_ledger_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'point_ledger is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER prevent_point_ledger_mutation
      BEFORE UPDATE OR DELETE ON point_ledger
      FOR EACH ROW EXECUTE FUNCTION prevent_point_ledger_mutation()
    `);
    await queryRunner.query(`
      CREATE FUNCTION enforce_referral_qualification_transition() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'referrals cannot be deleted';
        END IF;

        IF NEW."referrer_id" IS DISTINCT FROM OLD."referrer_id"
          OR NEW."referee_id" IS DISTINCT FROM OLD."referee_id"
          OR NEW."code" IS DISTINCT FROM OLD."code"
          OR NEW."signup_ip_hash" IS DISTINCT FROM OLD."signup_ip_hash"
          OR NEW."signup_device_hash" IS DISTINCT FROM OLD."signup_device_hash"
          OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
          RAISE EXCEPTION 'referral identity is immutable';
        END IF;

        IF OLD."qualified_at" IS NOT NULL
          OR NEW."qualified_at" IS NULL THEN
          RAISE EXCEPTION 'referral qualification can occur exactly once';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER enforce_referral_qualification_transition
      BEFORE UPDATE OR DELETE ON referrals
      FOR EACH ROW EXECUTE FUNCTION enforce_referral_qualification_transition()
    `);
    await queryRunner.query(`
      INSERT INTO point_rules (code, points, daily_cap, version)
      VALUES
        ('PHONE_VERIFIED_FIRST_TIME', 28, NULL, 1),
        ('REFERRAL_QUALIFIED', 56, 3, 1)
    `);
    await queryRunner.query(`
      INSERT INTO rank_tiers (
        rank, threshold_points, warning_points, required_gifts, required_referrals,
        maintenance_gifts, maintenance_referrals, post_quota, version
      ) VALUES
        ('VIEWER', 0, 0, 0, 0, 0, 0, 0, 1),
        ('MEMBER', 224, 157, 0, 0, 0, 0, 3, 1),
        ('SILVER', 672, 470, 1, 1, 2, 2, 10, 1),
        ('GOLD', 896, 627, 0, 0, 3, 3, 20, 1),
        ('DIAMOND', 1792, 1254, 0, 0, 4, 4, 50, 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER enforce_referral_qualification_transition ON referrals`,
    );
    await queryRunner.query(`DROP FUNCTION enforce_referral_qualification_transition`);
    await queryRunner.query(`DROP TRIGGER prevent_point_ledger_mutation ON point_ledger`);
    await queryRunner.query(`DROP FUNCTION prevent_point_ledger_mutation`);
    await queryRunner.query(`DROP TABLE referrals`);
    await queryRunner.query(`DROP TABLE rank_maintenance_cycles`);
    await queryRunner.query(`DROP TABLE rank_transitions`);
    await queryRunner.query(`DROP TABLE rank_tiers`);
    await queryRunner.query(`DROP TABLE point_ledger`);
    await queryRunner.query(`DROP TABLE user_point_balances`);
    await queryRunner.query(`DROP TABLE point_rules`);
    await queryRunner.query(`DROP INDEX "UQ_users_referral_code"`);
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN "promotion_locked_until",
        DROP COLUMN "rank_attained_at",
        DROP COLUMN "referral_code"
    `);
  }
}
