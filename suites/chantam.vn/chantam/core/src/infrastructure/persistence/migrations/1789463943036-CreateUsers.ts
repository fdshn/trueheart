import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1789463943036 implements MigrationInterface {
  name = 'CreateUsers1789463943036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "user_sessions" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "user_id" uuid NOT NULL,
                "refresh_token_hash" character varying(100) NOT NULL,
                "device_id" character varying(100) NOT NULL,
                "fcm_token" character varying(255),
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_e93e031a5fed190d4789b6bfd83" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_3c7d38f304121da68fb6b04c01" ON "user_sessions" ("created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_af427450b884f683d92101d5f8" ON "user_sessions" ("updated_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_e9658e959c490b0a634dfc5478" ON "user_sessions" ("user_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_cc132fa5f7a96610010e293e52" ON "user_sessions" ("refresh_token_hash")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_dbc81ff542b1b3366bae195f2a" ON "user_sessions" ("expires_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_33a357d1ac46fe6a8a1ad09955" ON "user_sessions" ("user_id", "device_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."users_rank_enum" AS ENUM('VIEWER', 'MEMBER', 'SILVER', 'GOLD', 'DIAMOND')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'BANNED')
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" SERIAL NOT NULL,
                "global_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "username" character varying(50) NOT NULL,
                "password_hash" character varying(100) NOT NULL,
                "email" character varying(255),
                "phone" character varying(20),
                "full_name" character varying(100),
                "avatar_url" character varying(500),
                "default_location" geography(Point, 4326),
                "rank" "public"."users_rank_enum" NOT NULL DEFAULT 'VIEWER',
                "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "phone_verified_at" TIMESTAMP WITH TIME ZONE,
                "suspended_until" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "UQ_b11b406cfa7b326058ac5a5e951" UNIQUE ("global_id"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c9b5b525a96ddc2c5647d7f7fa" ON "users" ("created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_6d596d799f9cb9dac6f7bf7c23" ON "users" ("updated_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_073999dfec9d14522f0cf58cd6" ON "users" ("deleted_at")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e2dd77cb8a46c78d8ea34de039" ON "users" ("email")
            WHERE "email" IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_875541f7dbe1b8565414f9f80b" ON "users" ("phone")
            WHERE "phone" IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_d2927fb9b565bcab123081b8ce" ON "users" USING GiST ("default_location")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f8ea2dbf7ea1da116877ec7b20" ON "users" ("rank")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_3676155292d72c67cd4e090514" ON "users" ("status")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3676155292d72c67cd4e090514"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f8ea2dbf7ea1da116877ec7b20"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d2927fb9b565bcab123081b8ce"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_875541f7dbe1b8565414f9f80b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e2dd77cb8a46c78d8ea34de039"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_fe0bb3f6520ee0469504521e71"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_073999dfec9d14522f0cf58cd6"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_6d596d799f9cb9dac6f7bf7c23"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c9b5b525a96ddc2c5647d7f7fa"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."users_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."users_rank_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_33a357d1ac46fe6a8a1ad09955"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_dbc81ff542b1b3366bae195f2a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_cc132fa5f7a96610010e293e52"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e9658e959c490b0a634dfc5478"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_af427450b884f683d92101d5f8"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3c7d38f304121da68fb6b04c01"
        `);
    await queryRunner.query(`
            DROP TABLE "user_sessions"
        `);
  }
}
