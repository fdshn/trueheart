import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quyền quản lý Blog / Tin tức (UC-BLOG-01, F64).
 *
 * Cùng lý do `campaign.*` ở `1797600000000`: Blog là **nội dung**, không phải chính sách.
 * `config.write` hôm nay mở luôn ngưỡng hạng và quy tắc điểm — cho người soạn bài giảng
 * nguyên bộ đó là leo thang quyền không cần thiết. UC-BLOG-01 cũng ghi tác nhân là
 * *"Admin / Content Editor"*.
 *
 * Phải cấp tay cho SUPER_ADMIN: migration `1790200000000` cấp cho vai đó bằng
 * `CROSS JOIN admin_permissions` không kèm điều kiện, tức toàn bộ quyền **có mặt lúc đó**.
 * Quyền thêm sau không tự vào.
 *
 * Khác `campaign.*` một chỗ: quyền này cũng cấp cho MODERATOR. Rút một bài viết sai sự thật
 * là việc kiểm duyệt, cùng loại với ẩn một bài đăng — mà MODERATOR đã có `post.moderate`.
 */
export class AddBlogPermissions1797800000000 implements MigrationInterface {
  name = 'AddBlogPermissions1797800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('blog.read', 'Xem danh sách bài viết Blog gồm cả bản nháp'),
        ('blog.manage', 'Soạn, xuất bản, rút và xoá bài viết Blog')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code IN ('SUPER_ADMIN', 'POLICY_ADMIN', 'MODERATOR')
        AND permission.code IN ('blog.read', 'blog.manage')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions
        WHERE code IN ('blog.read', 'blog.manage')
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code IN ('blog.read', 'blog.manage')`,
    );
  }
}
