import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeCanonicalPostMediaIdempotent1789900000002 implements MigrationInterface {
  name = 'MakeCanonicalPostMediaIdempotent1789900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post_media"
      ADD CONSTRAINT "UQ_post_media_key" UNIQUE ("post_id", "r2_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post_media"
      DROP CONSTRAINT "UQ_post_media_key"
    `);
  }
}
