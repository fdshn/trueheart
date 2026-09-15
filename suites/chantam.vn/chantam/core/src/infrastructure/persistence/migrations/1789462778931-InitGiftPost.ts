import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitGiftPost1789462778931 implements MigrationInterface {
  name = 'InitGiftPost1789462778931';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extension phải có trước mọi thứ: cột `location` dùng kiểu geography của
    // PostGIS. docker/postgres/init.sql cũng tạo chúng, nhưng file đó chỉ chạy
    // một lần lúc khởi tạo volume — migration phải tự đủ trên database trắng.
    // IF NOT EXISTS để không hỏng khi DBA đã tạo sẵn (database quản trị thường
    // không cho quyền CREATE EXTENSION).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
            CREATE TYPE "public"."gift_posts_category_enum" AS ENUM(
                'HOUSEHOLD',
                'CLOTHING',
                'BOOKS',
                'ELECTRONICS',
                'FURNITURE',
                'VEHICLE',
                'MEDICAL',
                'FOOD',
                'NON_MATERIAL',
                'OTHER'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."gift_posts_condition_enum" AS ENUM('NEW', 'LIKE_NEW', 'USED', 'NOT_APPLICABLE')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."gift_posts_status_enum" AS ENUM(
                'DRAFT',
                'PENDING_REVIEW',
                'REJECTED',
                'PUBLISHED',
                'RESERVED',
                'DELIVERING',
                'COMPLETED',
                'CANCELLED',
                'EXPIRED',
                'ARCHIVED'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "gift_posts" (
                "id" SERIAL NOT NULL,
                "global_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "title" character varying(200) NOT NULL,
                "description" text NOT NULL,
                "category" "public"."gift_posts_category_enum" NOT NULL,
                "condition" "public"."gift_posts_condition_enum" NOT NULL,
                "estimated_value" bigint NOT NULL DEFAULT '0',
                "location" geography(Point, 4326) NOT NULL,
                "area_label" character varying(200) NOT NULL,
                "status" "public"."gift_posts_status_enum" NOT NULL DEFAULT 'DRAFT',
                "total_quantity" integer NOT NULL DEFAULT '1',
                "remaining_quantity" integer NOT NULL DEFAULT '1',
                "giver_id" uuid NOT NULL,
                CONSTRAINT "UQ_dcd428658a9474f06d55298428a" UNIQUE ("global_id"),
                CONSTRAINT "PK_9443bf0709072dea3023302168b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_0e132677b2e1ad472d221c962d" ON "gift_posts" ("created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c5519620a53f0ce5da39ac9fb9" ON "gift_posts" ("updated_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_28b1909cac87f7aad3b45a4115" ON "gift_posts" ("deleted_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_ef71247a77e2a4a9b5129cc59e" ON "gift_posts" ("category")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_4f03a695ef68ca12ecb00634de" ON "gift_posts" USING GiST ("location")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_46504ba47576e72c2107b16b5a" ON "gift_posts" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_5fe34c4367dd94076b908e15ae" ON "gift_posts" ("giver_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_231dfc0d68ce885b8831408634" ON "gift_posts" ("status", "category")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_231dfc0d68ce885b8831408634"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5fe34c4367dd94076b908e15ae"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_46504ba47576e72c2107b16b5a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4f03a695ef68ca12ecb00634de"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ef71247a77e2a4a9b5129cc59e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_28b1909cac87f7aad3b45a4115"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c5519620a53f0ce5da39ac9fb9"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0e132677b2e1ad472d221c962d"
        `);
    await queryRunner.query(`
            DROP TABLE "gift_posts"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."gift_posts_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."gift_posts_condition_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."gift_posts_category_enum"
        `);
  }
}
