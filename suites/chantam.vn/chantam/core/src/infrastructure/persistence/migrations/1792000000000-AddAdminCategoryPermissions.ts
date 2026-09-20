import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminCategoryPermissions1792000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('category.read', 'Xem toàn bộ cây danh mục quản trị'),
        ('category.manage', 'Tạo, sửa và bật tắt danh mục')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'SUPER_ADMIN'
        AND permission.code IN ('category.read', 'category.manage')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions
        WHERE code IN ('category.read', 'category.manage')
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code IN ('category.read', 'category.manage')`,
    );
  }
}
