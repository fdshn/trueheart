import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mốc hoạt động của tài khoản — nền cho định nghĩa "Active Member" (F56).
 *
 * **Vì sao không phải `last_login_at` theo nghĩa đen.** App mobile giữ refresh
 * token, nên một người mở app hằng ngày vẫn có thể không "đăng nhập" lần nào
 * suốt 90 ngày. Hiểu cột này theo nghĩa hẹp sẽ đánh nhầm người đang dùng đều
 * thành không hoạt động, và họ mất phần chia affiliate mà không hiểu vì sao.
 *
 * Nên mốc được ghi ở MỌI lần cấp phiên: đăng ký, đăng nhập, và làm mới token.
 * `SessionIssuer` là chỗ chung của cả ba đường, nên chỉ có một chỗ ghi.
 *
 * Giá trị khởi tạo là `created_at`: tài khoản vừa tạo hôm qua mà `NULL` sẽ bị
 * mọi phép so sánh "trong 90 ngày" coi là im lìm.
 */
export class AddUserLastActiveAt1793200000000 implements MigrationInterface {
  name = 'AddUserLastActiveAt1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "last_active_at" timestamptz
    `);
    await queryRunner.query(`
      UPDATE "users" SET "last_active_at" = "created_at"
      WHERE "last_active_at" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "last_active_at" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "last_active_at" SET DEFAULT now()
    `);
    // Job kiểm Active Member quét theo đúng cột này trên toàn bảng người dùng;
    // không có index thì nó là một lần quét tuần tự mỗi lần chạy.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_last_active_at"
      ON "users" ("last_active_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_last_active_at"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "last_active_at"`,
    );
  }
}
