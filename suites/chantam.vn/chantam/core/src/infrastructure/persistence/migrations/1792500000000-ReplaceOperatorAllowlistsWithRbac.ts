import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ allowlist username, chuyển nốt sang RBAC.
 *
 * Ba đường còn kiểm quyền bằng biến môi trường (`POST_OPERATOR_USERNAMES`,
 * `RANK_OPERATOR_USERNAMES`) trong khi phần còn lại của Admin CMS đã chạy
 * `admin_permissions`. Hai cửa song song nghĩa là gỡ quyền trong CMS không có
 * tác dụng với cửa cũ — nhìn CMS tưởng đã chặn, thực tế chưa.
 *
 * Thêm `rank.operate` cho việc chạy đánh giá chu kỳ duy trì hạng. Tách khỏi
 * `config.write`: đặt CHÍNH SÁCH hạng và CHẠY một vòng đánh giá là hai việc
 * khác nhau, và người vận hành scheduler không cần quyền sửa chính sách.
 */
export class ReplaceOperatorAllowlistsWithRbac1792500000000 implements MigrationInterface {
  name = 'ReplaceOperatorAllowlistsWithRbac1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_permissions (code, description) VALUES
        ('rank.operate', 'Chạy đánh giá chu kỳ duy trì hạng đến hạn')
      ON CONFLICT (code) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'SUPER_ADMIN'
        AND permission.code = 'rank.operate'
      ON CONFLICT DO NOTHING
    `);

    // Duyệt chuyển vật phẩm về điểm từ thiện là một quyết định kiểm duyệt trên
    // bài, nên dùng chung `post.moderate` chứ không đẻ thêm quyền thứ hai cho
    // cùng một loại việc.
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM admin_roles role
      CROSS JOIN admin_permissions permission
      WHERE role.code = 'MODERATOR'
        AND permission.code IN ('post.read', 'post.moderate', 'admin.access')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions
      WHERE permission_id IN (
        SELECT id FROM admin_permissions WHERE code = 'rank.operate'
      )
    `);
    await queryRunner.query(
      `DELETE FROM admin_permissions WHERE code = 'rank.operate'`,
    );
  }
}
