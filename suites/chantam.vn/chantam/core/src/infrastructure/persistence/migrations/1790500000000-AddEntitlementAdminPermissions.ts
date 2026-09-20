import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tách quyền sửa chính sách rank ra khỏi `config.*`.
 *
 * Người được sửa quota bài không đương nhiên được đọc/ghi cấu hình SMTP, và
 * ngược lại — hai thứ có bán kính thiệt hại khác hẳn nhau nếu bị lạm dụng.
 * POLICY_ADMIN ("Quản trị chính sách") là vai đúng cho việc này.
 */
export class AddEntitlementAdminPermissions1790500000000 implements MigrationInterface {
  name = 'AddEntitlementAdminPermissions1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_permissions" ("code", "description") VALUES
        ('entitlement.read', 'Xem chính sách quyền/quota theo rank'),
        ('entitlement.write', 'Publish chính sách quyền/quota theo rank')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" IN ('SUPER_ADMIN', 'POLICY_ADMIN')
        AND permission."code" IN ('entitlement.read', 'entitlement.write')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "admin_permissions"
        WHERE "code" IN ('entitlement.read', 'entitlement.write')
      )
    `);
    await queryRunner.query(`
      DELETE FROM "admin_permissions"
      WHERE "code" IN ('entitlement.read', 'entitlement.write')
    `);
  }
}
