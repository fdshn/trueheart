import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cài đặt hiện trạng thái online (PR #46 §10.5). Mặc định TẮT cho mọi tài khoản, kể cả tài
 * khoản cũ: công khai danh tính người đang online phải là việc người dùng tự chọn.
 */
export class AddShowOnlineStatus1802000000000 implements MigrationInterface {
  name = 'AddShowOnlineStatus1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "show_online_status" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "show_online_status"`,
    );
  }
}
