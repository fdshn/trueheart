import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền quản lý chiến dịch & Home động (UC-ADM-03, F63).
 *
 * ## Vì sao KHÔNG dùng lại `config.write`
 *
 * Home động là **nội dung**, không phải chính sách. `config.write` hôm nay mở luôn ngưỡng
 * hạng, quy tắc điểm, chính sách affiliate và chính sách phân bổ — cho người biên tập
 * banner Vu Lan nguyên bộ đó là leo thang quyền không cần thiết. UC-ADM-03 cũng ghi tác
 * nhân là *"Admin / Campaign Manager"*, tức một vai riêng.
 *
 * Đặt tên theo lối `category.read` / `category.manage` chứ không `read` / `write`: đây là
 * quản lý bản ghi nội dung, cùng loại việc với danh mục.
 *
 * ## Vì sao phải cấp tay cho SUPER_ADMIN
 *
 * Migration `1790200000000` cấp cho SUPER_ADMIN bằng `CROSS JOIN admin_permissions` KHÔNG
 * kèm điều kiện — tức toàn bộ quyền **có mặt lúc đó**. Quyền thêm sau không tự vào. Quên
 * dòng cấp này thì endpoint trả 403 cho cả SUPER_ADMIN, và trông như lỗi phân quyền chứ
 * không như một dòng seed thiếu.
 *
 * ## Còn thiếu: vai CAMPAIGN_MANAGER
 *
 * Không có đường API nào gán quyền cho VAI (chỉ gán vai cho NGƯỜI, qua
 * `POST /admin/roles`), nên một vai mới vẫn phải mở bằng migration. Tạm cấp cho
 * POLICY_ADMIN — vai gần nhất đang giữ `config.*`. Dựng vai riêng là việc chờ Bên A xác
 * nhận có thật một người "Campaign Manager" không kiêm quản trị chính sách.
 */
export class AddCampaignPermissions1797600000000 implements MigrationInterface {
  name = 'AddCampaignPermissions1797600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('campaign.read', 'Xem cấu hình chiến dịch và bố cục Home'),
        ('campaign.manage', 'Tạo, sửa và kích hoạt chiến dịch Home động')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code IN ('SUPER_ADMIN', 'POLICY_ADMIN')
        AND permission.code IN ('campaign.read', 'campaign.manage')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions
        WHERE code IN ('campaign.read', 'campaign.manage')
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code IN ('campaign.read', 'campaign.manage')`,
    );
  }
}
