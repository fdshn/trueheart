import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Login/user repository compares username and email with LOWER(), so the DB
 * uniqueness constraint must use the same rule. Without this, `An` and `an`
 * can both register then login becomes ambiguous.
 */
export class NormalizeUserIdentityIndexes1789700000000 implements MigrationInterface {
  name = 'NormalizeUserIdentityIndexes1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_fe0bb3f6520ee0469504521e71"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_e2dd77cb8a46c78d8ea34de039"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_username_lower" ON "users" (LOWER("username"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email_lower" ON "users" (LOWER("email")) WHERE "email" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_users_email_lower"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_users_username_lower"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e2dd77cb8a46c78d8ea34de039" ON "users" ("email") WHERE "email" IS NOT NULL`,
    );
  }
}
