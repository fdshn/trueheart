import { MigrationInterface, QueryRunner } from 'typeorm';

/** RBAC thật cho CMS và kiểm duyệt bài; thay các username allowlist tạm. */
export class AddAdminPostPermissions1791800000000 implements MigrationInterface {
  name = 'AddAdminPostPermissions1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_permissions" ("code", "description") VALUES
        ('admin.access', 'Truy cập cổng Admin CMS'),
        ('post.read', 'Xem hàng đợi và chi tiết bài đăng quản trị'),
        ('post.moderate', 'Duyệt hoặc từ chối bài đăng')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_roles" ("code", "name")
      VALUES ('MODERATOR', 'Kiểm duyệt nội dung')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" = 'SUPER_ADMIN'
        AND permission."code" IN ('admin.access', 'post.read', 'post.moderate')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" = 'MODERATOR'
        AND permission."code" IN ('admin.access', 'post.read', 'post.moderate')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" IN ('POLICY_ADMIN', 'AUDITOR')
        AND permission."code" = 'admin.access'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "admin_permissions"
        WHERE "code" IN ('admin.access', 'post.read', 'post.moderate')
      )
    `);
    await queryRunner.query(
      `DELETE FROM "admin_roles" WHERE "code" = 'MODERATOR'`,
    );
    await queryRunner.query(`
      DELETE FROM "admin_permissions"
      WHERE "code" IN ('admin.access', 'post.read', 'post.moderate')
    `);
  }
}
