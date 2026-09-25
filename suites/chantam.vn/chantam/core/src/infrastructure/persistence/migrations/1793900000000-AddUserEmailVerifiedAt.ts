import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mốc xác minh email.
 *
 * Trước migration này, email chỉ cần gõ vào hồ sơ là dùng được làm kênh đặt lại
 * mật khẩu — và nó còn được ưu tiên hơn SĐT, thứ đã có xác minh OTP đàng hoàng.
 * Gõ nhầm một ký tự là trao cho người lạ đường chiếm tài khoản: họ bấm quên mật
 * khẩu, nhận mã, đổi mật khẩu, và mọi phiên của chủ thật bị thu hồi.
 *
 * Mọi email đang có đều để `NULL` — tức CHƯA xác minh. Đánh dấu chúng là đã
 * xác minh sẽ hợp thức hoá đúng những địa chỉ mà không ai từng kiểm.
 */
export class AddUserEmailVerifiedAt1793900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at"
    `);
  }
}
