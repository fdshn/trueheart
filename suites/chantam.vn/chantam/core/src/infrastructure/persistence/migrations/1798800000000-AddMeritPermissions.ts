import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền quản lý đơn vị Công đức (UI-MERIT-01, F65).
 *
 * Cặp riêng `merit.read` / `merit.manage`, không dùng lại `campaign.*` hay `banner.*`.
 *
 * Lý do nặng hơn ở hai phân hệ trước: đơn vị Công đức mang **số tài khoản ngân hàng**. Sửa
 * được `bank_account_number` của một chùa là chuyển dòng tiền công đức sang tài khoản khác,
 * và người dùng không có cách nào biết — họ quét mã QR do hệ thống dựng và tin nó. Đó là
 * quyền nhạy nhất trong cả Admin CMS, nên nó phải là một ô tick riêng mà Bên A bật có ý
 * thức, không phải thứ đi kèm quyền biên tập nội dung.
 *
 * Vì vậy CHỈ `SUPER_ADMIN` được `merit.manage`. `CAMPAIGN_MANAGER` được `merit.read` để xem
 * và đối soát, nhưng không sửa.
 *
 * `SUPER_ADMIN` phải cấp TAY: migration `1790200000000` cấp cho vai đó bằng
 * `CROSS JOIN admin_permissions` không kèm điều kiện, tức toàn bộ quyền có mặt LÚC ĐÓ. Quyền
 * thêm sau không tự vào.
 */
export class AddMeritPermissions1798800000000 implements MigrationInterface {
  name = 'AddMeritPermissions1798800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('merit.read', 'Xem đơn vị Công đức và Sổ vàng'),
        ('merit.manage', 'Tạo/sửa đơn vị Công đức, GỒM số tài khoản ngân hàng')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'SUPER_ADMIN'
        AND permission.code IN ('merit.read', 'merit.manage')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code IN ('CAMPAIGN_MANAGER', 'AUDITOR')
        AND permission.code = 'merit.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions
        WHERE code IN ('merit.read', 'merit.manage')
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code IN ('merit.read', 'merit.manage')`,
    );
  }
}
