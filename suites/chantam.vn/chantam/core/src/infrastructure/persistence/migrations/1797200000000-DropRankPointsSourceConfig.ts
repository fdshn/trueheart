import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ khoá cấu hình `rank.points_source` — nguồn tính hạng chốt cứng là SỐ DƯ, 02/10.
 *
 * Phải xoá hàng, không chỉ xoá nhánh code: một khoá còn trong `system_configs` mà
 * không đường nào đọc là đúng thứ `test/config-inventory.check.ts` được viết ra để
 * bắt — nó làm ô cấu hình của Admin mang một cái núm không nối với gì.
 *
 * Và khoá này còn tệ hơn một núm vô nghĩa: nó chưa bao giờ nằm trong
 * `SupportedSystemConfigKeys`, nên `POST /admin/system-configs` luôn từ chối nó.
 * Đổi được chỉ bằng `UPDATE` SQL tay. Tức một người có quyền database đổi được hành
 * vi xét hạng của toàn hệ thống mà không để lại dòng nào trong `admin_audit_logs`.
 *
 * `BR-POINT-06` và `BR-PROF-RANK-06` của SRS cùng nói Phase 1 không dùng lifetime
 * rank point riêng, nên nhánh đó không chỉ không cần thiết — nó trái đặc tả.
 *
 * KHÔNG đụng tới cột `lifetime`: nó vẫn là bộ đếm điểm tích luỹ hợp lệ
 * (`point_ledger.lifetime_after`, `user_point_balances.lifetime`, `lifetimePoints`
 * trên hồ sơ công khai). Chỉ việc DÙNG nó để quyết hạng là bị gỡ.
 */
export class DropRankPointsSourceConfig1797200000000 implements MigrationInterface {
  name = 'DropRankPointsSourceConfig1797200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Xoá MỌI version của khoá, không chỉ bản đang PUBLISHED: bảng này là
    // copy-on-write nên một bản ARCHIVED còn lại vẫn hiện ra ở đường đọc lịch sử
    // như một cấu hình từng tồn tại và có thể quay lại.
    await queryRunner.query(`
      DELETE FROM "system_configs" WHERE "config_key" = 'rank.points_source'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dựng lại hàng với giá trị BALANCE để `down` không để schema ở trạng thái
    // thiếu khoá mà `config-inventory` bản cũ đòi. Nhánh `lifetime` trong code thì
    // không quay lại được bằng migration — đó là việc của `git revert`.
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "config_value", "value_type", "version", "status", "description")
      VALUES (
        'rank.points_source',
        '{"source": "BALANCE"}',
        'JSON', 1, 'PUBLISHED',
        'Cột điểm quyết định thứ hạng. Dựng lại bởi down() của migration 1797200000000'
      )
      ON CONFLICT DO NOTHING
    `);
  }
}
