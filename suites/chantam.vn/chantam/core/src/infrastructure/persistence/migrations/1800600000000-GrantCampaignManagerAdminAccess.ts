import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cấp `admin.access` cho vai `CAMPAIGN_MANAGER` (CMS backlog B2, 15/10/2026).
 *
 * `admin.access` là cửa vào CMS: `GET /admin/me` đòi nó, và CMS gọi endpoint đó trước
 * mọi màn hình. Migration `1798000000000` tạo vai này với `campaign.*`, `blog.*`,
 * `config.read` — rồi các migration sau thêm banner, dharma, công đức — nhưng chưa bao
 * giờ cấp `admin.access`. Một người chỉ mang vai này có đủ quyền làm việc mà không mở
 * được CMS để làm việc đó.
 *
 * Chỉ thêm đúng một cặp vai × quyền. `admin.access` không mở thêm dữ liệu nào: mọi
 * endpoint phía sau vẫn đòi quyền riêng của nó.
 */
export class GrantCampaignManagerAdminAccess1800600000000 implements MigrationInterface {
  name = 'GrantCampaignManagerAdminAccess1800600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'CAMPAIGN_MANAGER'
        AND permission.code = 'admin.access'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE role_id = (SELECT id FROM admin_roles WHERE code = 'CAMPAIGN_MANAGER')
        AND permission_id = (
          SELECT id FROM admin_permissions WHERE code = 'admin.access'
        )
    `);
  }
}
