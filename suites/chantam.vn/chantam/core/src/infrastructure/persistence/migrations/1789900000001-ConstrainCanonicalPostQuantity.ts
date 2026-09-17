import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConstrainCanonicalPostQuantity1789900000001 implements MigrationInterface {
  name = 'ConstrainCanonicalPostQuantity1789900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD CONSTRAINT "CHK_posts_total_quantity_positive"
      CHECK ("total_quantity" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD CONSTRAINT "CHK_posts_remaining_quantity_valid"
      CHECK (
        "remaining_quantity" >= 0
        AND "remaining_quantity" <= "total_quantity"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts"
      DROP CONSTRAINT "CHK_posts_remaining_quantity_valid"
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
      DROP CONSTRAINT "CHK_posts_total_quantity_positive"
    `);
  }
}
