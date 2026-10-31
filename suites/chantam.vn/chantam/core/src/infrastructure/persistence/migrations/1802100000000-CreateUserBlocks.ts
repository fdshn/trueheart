import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chặn người dùng. Một dòng = A chặn B (một chiều khi lưu); mọi phép kiểm hiệu lực xét HAI
 * chiều nên chỉ mục ngược `(blocked_id, blocker_id)` cho phép hỏi "ai đã chặn tôi" nhanh như
 * "tôi đã chặn ai".
 *
 * Tài khoản bị xoá cứng (hiếm — xoá thường là xoá mềm) thì dòng chặn đi theo: một quan hệ
 * chặn trỏ vào người không còn tồn tại không bảo vệ ai.
 */
export class CreateUserBlocks1802100000000 implements MigrationInterface {
  name = 'CreateUserBlocks1802100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_blocks" (
        "blocker_id" uuid NOT NULL,
        "blocked_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_blocks" PRIMARY KEY ("blocker_id", "blocked_id"),
        CONSTRAINT "FK_user_blocks_blocker"
          FOREIGN KEY ("blocker_id") REFERENCES "users"("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_blocks_blocked"
          FOREIGN KEY ("blocked_id") REFERENCES "users"("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_blocks_blocked" ON "user_blocks" ("blocked_id", "blocker_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_blocks"`);
  }
}
