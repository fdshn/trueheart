import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền quản lý nội dung Phật Pháp (UC-DHARMA-01, F73).
 *
 * Cặp riêng `dharma.*`, không dùng lại `blog.*`. Hai phân hệ đều là nội dung biên tập nên
 * thoạt nhìn gộp được, nhưng nội dung Phật Pháp là **kinh sách** — một bản kinh sai chữ là
 * chuyện khác hẳn một bài tin sai chính tả, và Bên A có thể muốn chỉ một người được sửa nó.
 * Để hai ô tick riêng thì họ chọn được; gộp một ô thì không.
 *
 * `SUPER_ADMIN` phải cấp TAY: migration `1790200000000` cấp cho vai đó bằng
 * `CROSS JOIN admin_permissions` không kèm điều kiện, tức toàn bộ quyền có mặt LÚC ĐÓ.
 *
 * `CAMPAIGN_MANAGER` ("Quản lý chiến dịch và nội dung") được cả hai quyền — đây đúng loại
 * việc của vai đó. `AUDITOR` chỉ đọc.
 *
 * Danh sách vai Admin thật, tính tới migration này: `SUPER_ADMIN`, `POLICY_ADMIN`, `AUDITOR`,
 * `MODERATOR`, `CAMPAIGN_MANAGER`. `VIEWER` KHÔNG phải vai Admin — nó là một hạng người dùng,
 * và `test:banner` đã bắt được tôi cấp quyền cho nó một lần.
 */
export class AddDharmaPermissions1799000000000 implements MigrationInterface {
  name = 'AddDharmaPermissions1799000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('dharma.read', 'Xem nội dung Phật Pháp, gồm bản nháp'),
        ('dharma.manage', 'Tạo, sửa và xuất bản Kinh sách / Thông tin / Giới thiệu chùa')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code IN ('SUPER_ADMIN', 'CAMPAIGN_MANAGER')
        AND permission.code IN ('dharma.read', 'dharma.manage')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'AUDITOR' AND permission.code = 'dharma.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions
        WHERE code IN ('dharma.read', 'dharma.manage')
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code IN ('dharma.read', 'dharma.manage')`,
    );
  }
}
