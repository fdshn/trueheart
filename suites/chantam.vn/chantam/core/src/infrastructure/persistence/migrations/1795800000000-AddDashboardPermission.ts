import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền đọc bảng số liệu điều hành (F59) — 29/09.
 *
 * Quyền RIÊNG, không ghép vào `config.read`. Xem số liệu tổng hợp và sửa chính sách
 * là hai việc khác nhau, và người cần theo dõi tăng trưởng không nhất thiết là người
 * được phép đổi ngưỡng điểm. Guard mặc định đóng nên endpoint mới không khai quyền sẽ
 * khoá ngay lần gọi đầu — dựa vào đó thay vì mượn một quyền sẵn có cho gần đúng.
 *
 * Gán cho `SUPER_ADMIN` và `AUDITOR`: cả hai đều là vai đọc-để-biết. `MODERATOR` thì
 * không — họ xử nội dung từng cái, số liệu tăng trưởng không giúp gì cho việc đó, và
 * quyền nào cũng nên hẹp nhất có thể.
 */
export class AddDashboardPermission1795800000000 implements MigrationInterface {
  name = 'AddDashboardPermission1795800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_permissions" ("code", "description")
      VALUES ('dashboard.read', 'Đọc bảng số liệu điều hành')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" IN ('SUPER_ADMIN', 'AUDITOR')
        AND permission."code" = 'dashboard.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "admin_permissions" WHERE "code" = 'dashboard.read'
      )
    `);
    await queryRunner.query(
      `DELETE FROM "admin_permissions" WHERE "code" = 'dashboard.read'`,
    );
  }
}
