import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền hoàn điểm (F39).
 *
 * Tách khỏi `config.write`: sửa một RULE và đảo một bút toán trên tài khoản cụ
 * thể là hai việc khác nhau. Người chỉnh chính sách không nhất thiết được đụng
 * vào số dư của một người.
 */
export class AddPointAdjustPermission1792800000000 implements MigrationInterface {
  name = 'AddPointAdjustPermission1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('point.adjust', 'Hoàn một bút toán điểm đã ghi')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'SUPER_ADMIN'
        AND permission.code = 'point.adjust'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions WHERE code = 'point.adjust'
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code = 'point.adjust'`,
    );
  }
}
