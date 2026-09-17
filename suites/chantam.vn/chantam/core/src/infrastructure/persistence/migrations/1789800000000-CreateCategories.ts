import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateCategories1789800000000 implements MigrationInterface {
  name = 'CreateCategories1789800000000';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE "categories" ("id" SERIAL NOT NULL,"global_id" uuid NOT NULL,"created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now(),"slug" varchar(100) NOT NULL,"name" varchar(100) NOT NULL,"icon" varchar(100),"sort_order" int NOT NULL DEFAULT 0,"is_active" boolean NOT NULL DEFAULT true,"parent_id" uuid,"deleted_at" timestamptz,CONSTRAINT "PK_categories" PRIMARY KEY ("id"),CONSTRAINT "UQ_categories_global_id" UNIQUE ("global_id"),CONSTRAINT "UQ_categories_slug" UNIQUE ("slug"))`,
    );
    await q.query(
      `CREATE INDEX "IDX_categories_parent" ON "categories" ("parent_id")`,
    );
    await q.query(
      `CREATE INDEX "IDX_categories_active" ON "categories" ("is_active")`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(`DROP TABLE "categories"`);
  }
}
