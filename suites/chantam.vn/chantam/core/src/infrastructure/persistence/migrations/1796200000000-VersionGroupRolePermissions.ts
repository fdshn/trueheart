import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đánh phiên bản cho `group_role_permissions` — 30/09.
 *
 * ## Vì sao
 *
 * `18-group.md` §18.4 từng nói bảng này *"có audit và đánh phiên bản như mọi cấu
 * hình động khác"*. Sai cả ba vế: không endpoint nào chạm tới bảng (đổi quyền phải
 * chạy SQL tay), không có cột `version`, và `updated_by` có sẵn nhưng chưa bao giờ
 * được ghi.
 *
 * Bên A yêu cầu bổ sung đường Admin, nên bảng phải mang được lịch sử trước đã —
 * một endpoint ghi đè tại chỗ thì không tra lại được bộ quyền nào đang chạy lúc
 * một trưởng nhóm bị từ chối.
 *
 * ## Copy-on-write theo VAI, không theo dòng
 *
 * Bộ quyền là một TẬP, nên phiên bản phải gắn với tập. Mỗi lần Admin sửa vai nào
 * thì cả tập của vai đó được ghi lại ở `version + 1`; dòng cũ nằm nguyên. Bộ đang
 * hiệu lực là `version = MAX(version)` của từng vai — tính riêng từng vai, vì sửa
 * `SUBTEAM_ADMIN` không được làm bộ quyền của `OWNER` trông như cũ hơn.
 *
 * UNIQUE đổi từ `(role, permission)` sang `(role, permission, version)`: cái cũ
 * chặn luôn việc giữ lịch sử.
 *
 * ## Vì sao không tách bảng revision riêng
 *
 * `system_configs` và `capability_policies` dùng `config_revisions`. Ở đây tập nhỏ
 * (mười mấy dòng), đổi rất thưa, và mỗi vai độc lập với vai khác — thêm một bảng
 * nối chỉ để đếm là bắt mọi câu đọc quyền phải JOIN thêm một tầng. Câu đọc quyền
 * chạy ở MỌI endpoint nhóm, nên nó là chỗ cần ít tầng nhất.
 */
export class VersionGroupRolePermissions1796200000000 implements MigrationInterface {
  name = 'VersionGroupRolePermissions1796200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions"
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions"
      ADD COLUMN IF NOT EXISTS "change_reason" varchar(500)
    `);
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions"
      DROP CONSTRAINT IF EXISTS "UQ_group_role_permissions"
    `);
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions"
      ADD CONSTRAINT "UQ_group_role_permissions_versioned"
        UNIQUE ("role", "permission", "version")
    `);
    // Câu đọc quyền chạy ở mọi endpoint nhóm và luôn lọc theo (role, version).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_group_role_permissions_role_version"
      ON "group_role_permissions" ("role", "version")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Về UNIQUE cũ thì mọi dòng lịch sử trùng `(role, permission)` sẽ chặn nó.
    // Giữ bộ ĐANG HIỆU LỰC, bỏ lịch sử — mất dữ liệu, nhưng `down` không có đường
    // nào khác và thà nói rõ ở đây hơn là để nó chết giữa chừng.
    await queryRunner.query(`
      DELETE FROM "group_role_permissions" old_row
      WHERE old_row."version" < (
        SELECT MAX(newer."version") FROM "group_role_permissions" newer
        WHERE newer."role" = old_row."role"
      )
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_group_role_permissions_role_version"
    `);
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions"
      DROP CONSTRAINT IF EXISTS "UQ_group_role_permissions_versioned"
    `);
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions"
      ADD CONSTRAINT "UQ_group_role_permissions" UNIQUE ("role", "permission")
    `);
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions" DROP COLUMN IF EXISTS "change_reason"
    `);
    await queryRunner.query(`
      ALTER TABLE "group_role_permissions" DROP COLUMN IF EXISTS "version"
    `);
  }
}
