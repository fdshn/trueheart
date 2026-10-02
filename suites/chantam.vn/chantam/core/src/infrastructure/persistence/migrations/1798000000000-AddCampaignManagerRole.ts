import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vai `CAMPAIGN_MANAGER` (UC-ADM-03, mục mở L24).
 *
 * ## Vấn đề L24 nêu
 *
 * UC-ADM-03 ghi tác nhân là *"Admin / **Campaign Manager**"*, nhưng không vai nào như vậy
 * được seed. `campaign.*` và `blog.*` phải tạm cấp cho `POLICY_ADMIN` — nghĩa là người biên
 * tập banner Vu Lan có luôn quyền sửa ngưỡng hạng, quy tắc điểm, chính sách affiliate và
 * chính sách phân bổ. Đó là leo thang quyền do thiếu một vai, không do thiết kế.
 *
 * ## Vai này nhận gì, và cố ý KHÔNG nhận gì
 *
 * Nhận: `campaign.read`, `campaign.manage`, `blog.read`, `blog.manage` — toàn bộ nội dung
 * hiển thị. Thêm `config.read` để xem được cấu hình liên quan (ví dụ bố cục Home đang chạy)
 * mà **không** sửa được.
 *
 * KHÔNG nhận `config.write`: đó là cửa vào ngưỡng hạng và quy tắc điểm. Cũng không nhận
 * `post.moderate` hay `report.resolve` — kiểm duyệt là việc của `MODERATOR`, và một người
 * làm nội dung không cần quyền gỡ bài của người khác.
 *
 * ## Và L24 còn một nửa CHƯA đóng
 *
 * Không có đường API nào gán quyền cho VAI — `POST /admin/roles` chỉ gán *vai cho người*.
 * Nên mỗi lần đổi mapping vai→quyền vẫn phải viết một migration như file này. Dựng API đó
 * là một hạng mục riêng, và nó cần nghĩ kỹ hơn: một endpoint sửa được mapping quyền là
 * endpoint sửa được chính quyền của người đang gọi nó.
 */
export class AddCampaignManagerRole1798000000000 implements MigrationInterface {
  name = 'AddCampaignManagerRole1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_roles (code, name)
      VALUES ('CAMPAIGN_MANAGER', 'Quản lý chiến dịch và nội dung')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'CAMPAIGN_MANAGER'
        AND permission.code IN (
          'campaign.read',
          'campaign.manage',
          'blog.read',
          'blog.manage',
          'config.read'
        )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE role_id IN (
        SELECT id FROM admin_roles WHERE code = 'CAMPAIGN_MANAGER'
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_roles WHERE code = 'CAMPAIGN_MANAGER'`,
    );
  }
}
