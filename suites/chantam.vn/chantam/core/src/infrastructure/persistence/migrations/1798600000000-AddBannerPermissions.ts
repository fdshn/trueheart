import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền quản lý Banner Tài Trợ / Quảng Cáo (UC-ADM-06, F65).
 *
 * ## Vì sao KHÔNG dùng lại `campaign.*` lần thứ ba
 *
 * Ở phân hệ Từ thiện tôi đã nới nghĩa `campaign.read` / `campaign.manage` để trùm luôn hồ
 * sơ hoạt động, và ghi rõ cái giá: `POLICY_ADMIN` từ đó duyệt được hồ sơ Từ thiện. Nới thêm
 * lần nữa cho banner là dồn ba việc khác hẳn nhau vào một ô tick.
 *
 * Banner tài trợ có TIỀN ở giữa. Duyệt một banner là xác nhận với đối tác rằng nội dung của
 * họ sẽ chạy đúng khung giờ đã bán, và `impression_count` là con số đối soát. Người biên tập
 * bố cục Home không nhất thiết là người làm việc đó, và ngược lại.
 *
 * ## Cấp cho ai
 *
 * `SUPER_ADMIN` phải cấp TAY: migration `1790200000000` cấp cho vai đó bằng
 * `CROSS JOIN admin_permissions` không kèm điều kiện, tức toàn bộ quyền **có mặt lúc đó**.
 * Quyền thêm sau không tự vào, và quên dòng này thì endpoint trả 403 cho cả SUPER_ADMIN —
 * trông như lỗi phân quyền chứ không như một dòng seed thiếu.
 *
 * `CAMPAIGN_MANAGER` ("Quản lý chiến dịch và nội dung", migration `1798000000000`) là vai
 * đúng nghĩa nhất cho việc này nên cấp cả hai quyền.
 *
 * `POLICY_ADMIN` thì KHÔNG: vai đó giữ `config.*` — ngưỡng hạng, quy tắc điểm, chính sách
 * phân bổ. Thêm quyền thương mại vào đó là mở rộng một vai đã rất rộng.
 */
export class AddBannerPermissions1798600000000 implements MigrationInterface {
  name = 'AddBannerPermissions1798600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('banner.read', 'Xem banner tài trợ/quảng cáo và số liệu hiển thị'),
        ('banner.manage', 'Tạo, sửa, duyệt và bật/tắt banner tài trợ/quảng cáo')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code IN ('SUPER_ADMIN', 'CAMPAIGN_MANAGER')
        AND permission.code IN ('banner.read', 'banner.manage')
      ON CONFLICT DO NOTHING
    `);
    // `AUDITOR` chỉ đọc — số liệu banner là thứ họ cần thấy khi đối soát, nhưng không sửa.
    //
    // Bản đầu của dòng này cấp cho cả `VIEWER`, và `test:banner` bắt được: **`VIEWER` không
    // phải vai Admin**, nó là một HẠNG người dùng (`users_rank_enum`). Câu `INSERT ... SELECT`
    // với một `role.code` không tồn tại không ném gì — nó chèn 0 hàng, báo thành công, và
    // một dòng seed vô nghĩa nằm lại trong migration mãi mãi.
    //
    // Danh sách vai Admin thật, tính tới migration này: `SUPER_ADMIN`, `POLICY_ADMIN`,
    // `AUDITOR` (`1790200000000`), `MODERATOR` (`1791800000000`), `CAMPAIGN_MANAGER`
    // (`1798000000000`).
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'AUDITOR'
        AND permission.code = 'banner.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions
        WHERE code IN ('banner.read', 'banner.manage')
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code IN ('banner.read', 'banner.manage')`,
    );
  }
}
