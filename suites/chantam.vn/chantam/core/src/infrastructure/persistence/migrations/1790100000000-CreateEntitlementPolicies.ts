import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEntitlementPolicies1790100000000 implements MigrationInterface {
  name = 'CreateEntitlementPolicies1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(`
      CREATE TABLE "config_bundles" (
        "id" BIGSERIAL NOT NULL,
        "code" varchar(100) NOT NULL,
        "version" integer NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PUBLISHED',
        "effective_from" timestamptz NOT NULL DEFAULT now(),
        "effective_to" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_config_bundles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_config_bundles_code_version" UNIQUE ("code", "version"),
        CONSTRAINT "CHK_config_bundles_status" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
        CONSTRAINT "CHK_config_bundles_dates" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "config_revisions" (
        "id" BIGSERIAL NOT NULL,
        "bundle_id" bigint NOT NULL,
        "scope" varchar(50) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PUBLISHED',
        "effective_from" timestamptz NOT NULL DEFAULT now(),
        "effective_to" timestamptz,
        "change_reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_config_revisions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_config_revisions_bundle" FOREIGN KEY ("bundle_id") REFERENCES "config_bundles"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_config_revisions_status" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
        CONSTRAINT "CHK_config_revisions_dates" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "config_revisions"
      ADD CONSTRAINT "EX_config_revisions_published_scope_window"
      EXCLUDE USING gist (
        "scope" WITH =,
        tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&
      ) WHERE ("status" = 'PUBLISHED')
    `);
    await queryRunner.query(`
      CREATE TABLE "capability_policies" (
        "id" BIGSERIAL NOT NULL,
        "revision_id" bigint NOT NULL,
        "code" varchar(100) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_capability_policies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_capability_policies_revision" FOREIGN KEY ("revision_id") REFERENCES "config_revisions"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_capability_policies_revision_code" UNIQUE ("revision_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "capability_rank_values" (
        "id" BIGSERIAL NOT NULL,
        "policy_id" bigint NOT NULL,
        "rank" users_rank_enum NOT NULL,
        "allowed" boolean NOT NULL DEFAULT false,
        "limit_value" integer,
        CONSTRAINT "PK_capability_rank_values" PRIMARY KEY ("id"),
        CONSTRAINT "FK_capability_rank_values_policy" FOREIGN KEY ("policy_id") REFERENCES "capability_policies"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_capability_rank_values_policy_rank" UNIQUE ("policy_id", "rank"),
        CONSTRAINT "CHK_capability_rank_values_limit" CHECK ("limit_value" IS NULL OR "limit_value" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "point_cap_decisions" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "rule_code" varchar(100) NOT NULL,
        "policy_date" date NOT NULL,
        "decision" varchar(20) NOT NULL,
        "idempotency_key" varchar(200) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_point_cap_decisions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_point_cap_decisions_user" FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_point_cap_decisions_idempotency" UNIQUE ("idempotency_key"),
        CONSTRAINT "CHK_point_cap_decisions_decision" CHECK ("decision" IN ('APPLIED', 'REJECTED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_point_cap_decisions_user_rule_date" ON "point_cap_decisions" ("user_id", "rule_code", "policy_date")`,
    );

    await queryRunner.query(`
      INSERT INTO "config_bundles" ("code", "version", "status")
      VALUES ('M6_BASE_POLICY', 1, 'PUBLISHED')
    `);
    await queryRunner.query(`
      INSERT INTO "config_revisions" ("bundle_id", "scope", "status", "change_reason")
      SELECT "id", 'ENTITLEMENT', 'PUBLISHED', 'Initial rank capability policy'
      FROM "config_bundles"
      WHERE "code" = 'M6_BASE_POLICY' AND "version" = 1
    `);

    await queryRunner.query(`
      INSERT INTO "capability_policies" ("revision_id", "code")
      SELECT "id", capability_code
      FROM "config_revisions"
      CROSS JOIN (VALUES
        ('POST_OFFER'),
        ('POST_WANTED'),
        ('POST_SOS'),
        ('CREATE_GROUP'),
        ('SELECT_REQUESTER'),
        ('SUBMIT_CHARITY_PROPOSAL')
      ) AS capabilities(capability_code)
      WHERE "scope" = 'ENTITLEMENT'
    `);

    await queryRunner.query(`
      INSERT INTO "capability_rank_values" ("policy_id", "rank", "allowed", "limit_value")
      SELECT policy."id", rank_value."rank", rank_value."allowed", rank_value."limit_value"
      FROM "capability_policies" policy
      CROSS JOIN (VALUES
        ('VIEWER'::users_rank_enum, false, 0),
        ('MEMBER'::users_rank_enum, true, 1),
        ('SILVER'::users_rank_enum, true, 3),
        ('GOLD'::users_rank_enum, true, 5),
        ('DIAMOND'::users_rank_enum, true, 10)
      ) AS rank_value("rank", "allowed", "limit_value")
      WHERE policy."code" = 'SELECT_REQUESTER'
    `);
    await queryRunner.query(`
      INSERT INTO "capability_rank_values" ("policy_id", "rank", "allowed", "limit_value")
      SELECT policy."id", rank_value."rank", rank_value."allowed", rank_value."limit_value"
      FROM "capability_policies" policy
      CROSS JOIN (VALUES
        ('VIEWER'::users_rank_enum, false, 0),
        ('MEMBER'::users_rank_enum, true, 3),
        ('SILVER'::users_rank_enum, true, 10),
        ('GOLD'::users_rank_enum, true, 20),
        ('DIAMOND'::users_rank_enum, true, 50)
      ) AS rank_value("rank", "allowed", "limit_value")
      WHERE policy."code" IN ('POST_OFFER', 'POST_WANTED')
    `);
    await queryRunner.query(`
      INSERT INTO "capability_rank_values" ("policy_id", "rank", "allowed", "limit_value")
      SELECT policy."id", rank_value."rank", rank_value."allowed", NULL
      FROM "capability_policies" policy
      CROSS JOIN (VALUES
        ('VIEWER'::users_rank_enum, false),
        ('MEMBER'::users_rank_enum, false),
        ('SILVER'::users_rank_enum, true),
        ('GOLD'::users_rank_enum, true),
        ('DIAMOND'::users_rank_enum, true)
      ) AS rank_value("rank", "allowed")
      WHERE policy."code" = 'POST_SOS'
    `);
    await queryRunner.query(`
      INSERT INTO "capability_rank_values" ("policy_id", "rank", "allowed", "limit_value")
      SELECT policy."id", rank_value."rank", rank_value."allowed", NULL
      FROM "capability_policies" policy
      CROSS JOIN (VALUES
        ('VIEWER'::users_rank_enum, false),
        ('MEMBER'::users_rank_enum, false),
        ('SILVER'::users_rank_enum, false),
        ('GOLD'::users_rank_enum, false),
        ('DIAMOND'::users_rank_enum, true)
      ) AS rank_value("rank", "allowed")
      WHERE policy."code" IN ('CREATE_GROUP', 'SUBMIT_CHARITY_PROPOSAL')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "point_cap_decisions"`);
    await queryRunner.query(`DROP TABLE "capability_rank_values"`);
    await queryRunner.query(`DROP TABLE "capability_policies"`);
    await queryRunner.query(
      `ALTER TABLE "config_revisions" DROP CONSTRAINT "EX_config_revisions_published_scope_window"`,
    );
    await queryRunner.query(`DROP TABLE "config_revisions"`);
    await queryRunner.query(`DROP TABLE "config_bundles"`);
  }
}
