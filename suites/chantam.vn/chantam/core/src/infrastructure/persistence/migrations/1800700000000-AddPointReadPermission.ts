import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền `point.read` — xem sổ điểm của một người dùng bất kỳ (CMS backlog A7, 15/10/2026).
 *
 * Tách khỏi `point.adjust`: xem không phải can thiệp. AUDITOR là vai chỉ đọc, cần thấy sổ
 * điểm để đối soát mà KHÔNG được cộng/trừ; POLICY_ADMIN giữ quy tắc điểm nên cần thấy quy
 * tắc chạy ra số nào. Ai đảo bút toán thì vẫn cần `point.adjust` riêng.
 */
export class AddPointReadPermission1800700000000 implements MigrationInterface {
  name = 'AddPointReadPermission1800700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description)
      VALUES ('point.read', 'Xem sổ điểm của người dùng')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code IN ('SUPER_ADMIN', 'POLICY_ADMIN', 'AUDITOR')
        AND permission.code = 'point.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id = (SELECT id FROM admin_permissions WHERE code = 'point.read')
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code = 'point.read'`,
    );
  }
}
