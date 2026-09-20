import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGiftRequests1790300000000 implements MigrationInterface {
  name = 'CreateGiftRequests1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."gift_requests_status_enum" AS ENUM(
        'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'WITHDRAWN', 'STANDBY'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_requests" (
        "id" SERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "post_id" uuid NOT NULL,
        "requester_id" uuid NOT NULL,
        "message" varchar(500) NOT NULL,
        "status" "public"."gift_requests_status_enum" NOT NULL DEFAULT 'PENDING',
        "queue_joined_at" timestamptz NOT NULL DEFAULT now(),
        "withdrawn_at" timestamptz,
        CONSTRAINT "PK_gift_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gift_requests_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_gift_requests_post" FOREIGN KEY ("post_id") REFERENCES "posts"("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_gift_requests_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("global_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_gift_requests_post_requester" ON "gift_requests" ("post_id", "requester_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gift_requests_post_status" ON "gift_requests" ("post_id", "status") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gift_requests_requester_status" ON "gift_requests" ("requester_id", "status") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gift_requests"`);
    await queryRunner.query(`DROP TYPE "public"."gift_requests_status_enum"`);
  }
}
