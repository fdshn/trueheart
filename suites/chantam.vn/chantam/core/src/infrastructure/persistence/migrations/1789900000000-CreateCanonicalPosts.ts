import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2.1 expand/backfill: canonical posts model alongside gift_posts prototype.
 *
 * Additive only. Do not drop gift_posts/static enums here: old API clients and
 * rollback must remain possible during the compatibility window.
 */
export class CreateCanonicalPosts1789900000000 implements MigrationInterface {
  name = 'CreateCanonicalPosts1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."posts_type_enum" AS ENUM(
        'OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "posts" (
        "id" SERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "post_type" "public"."posts_type_enum" NOT NULL,
        "author_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "location" geography(Point,4326) NOT NULL,
        "area_label" varchar(200) NOT NULL,
        "status" "public"."gift_posts_status_enum" NOT NULL,
        "total_quantity" integer NOT NULL DEFAULT 1,
        "remaining_quantity" integer NOT NULL DEFAULT 1,
        "details" jsonb NOT NULL DEFAULT '{}',
        "expires_at" timestamptz,
        "renewed_count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_posts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_posts_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_posts_category" FOREIGN KEY ("category_id") REFERENCES "categories"("global_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_posts_location" ON "posts" USING GiST ("location")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_posts_author_status" ON "posts" ("author_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_posts_type_status_category" ON "posts" ("post_type", "status", "category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_posts_expiry" ON "posts" ("status", "expires_at")`,
    );
    await queryRunner.query(`
      CREATE TABLE "post_media" (
        "id" SERIAL NOT NULL,
        "post_id" uuid NOT NULL,
        "r2_key" varchar(500) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_post_media" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_post_media_order" UNIQUE ("post_id", "sort_order"),
        CONSTRAINT "FK_post_media_post" FOREIGN KEY ("post_id") REFERENCES "posts"("global_id") ON DELETE CASCADE
      )
    `);

    // Every legacy enum has an explicit canonical category. phi-vat-chat is
    // deliberately added for NON_MATERIAL rather than silently collapsing it
    // into Khác.
    await queryRunner.query(`
      INSERT INTO categories (global_id, name, slug, icon, sort_order, is_active, parent_id)
      VALUES ('30000000-0000-4000-8000-000000000010', 'Phi vật chất', 'phi-vat-chat', 'heart-handshake', 85, true, NULL)
      ON CONFLICT (global_id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO posts (
        global_id, created_at, updated_at, deleted_at, post_type, author_id,
        category_id, title, description, location, area_label, status,
        total_quantity, remaining_quantity, details, expires_at, renewed_count
      )
      SELECT
        g.global_id, g.created_at, g.updated_at, g.deleted_at, 'OFFER', g.giver_id,
        CASE g.category::text
          WHEN 'HOUSEHOLD' THEN '30000000-0000-4000-8000-000000000001'::uuid
          WHEN 'CLOTHING' THEN '30000000-0000-4000-8000-000000000002'::uuid
          WHEN 'BOOKS' THEN '30000000-0000-4000-8000-000000000003'::uuid
          WHEN 'ELECTRONICS' THEN '30000000-0000-4000-8000-000000000004'::uuid
          WHEN 'FURNITURE' THEN '30000000-0000-4000-8000-000000000005'::uuid
          WHEN 'VEHICLE' THEN '30000000-0000-4000-8000-000000000006'::uuid
          WHEN 'MEDICAL' THEN '30000000-0000-4000-8000-000000000007'::uuid
          WHEN 'FOOD' THEN '30000000-0000-4000-8000-000000000008'::uuid
          WHEN 'NON_MATERIAL' THEN '30000000-0000-4000-8000-000000000010'::uuid
          WHEN 'OTHER' THEN '30000000-0000-4000-8000-000000000009'::uuid
        END,
        g.title, g.description, g.location, g.area_label, g.status,
        g.total_quantity, g.remaining_quantity,
        jsonb_build_object('condition', g.condition::text, 'estimatedValue', g.estimated_value),
        CASE WHEN g.status IN ('PUBLISHED', 'RESERVED', 'DELIVERING') THEN g.created_at + interval '3 months' ELSE NULL END,
        0
      FROM gift_posts g
      ON CONFLICT (global_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "post_media"`);
    await queryRunner.query(`DROP TABLE "posts"`);
    await queryRunner.query(`DROP TYPE "public"."posts_type_enum"`);
  }
}
