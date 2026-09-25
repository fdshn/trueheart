import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mẫu thông báo về thứ hạng, và bỏ cột `lifetime_points` khỏi vai quyết định.
 *
 * **Vì sao cần cảnh báo.** Từ 2026-09-24 hạng do balance quyết, nên tiêu điểm
 * làm tụt hạng. Không báo trước thì người dùng đổi một vật phẩm rồi sáng hôm sau
 * phát hiện mình đã xuống Bạc — mất quota bài, mất quyền SOS — mà không ai nói.
 * Mốc cảnh báo đã có trong `rank_tiers.warning_points` từ đầu nhưng chưa có
 * đường nào gửi.
 *
 * `{rank}` / `{balancePoints}` / `{thresholdPoints}` / `{fromRank}` / `{toRank}`
 * là chỗ trống Admin sửa được lúc chạy (F62).
 */
export class SeedRankNotificationTemplates1793300000000 implements MigrationInterface {
  name = 'SeedRankNotificationTemplates1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "notification_templates" ("type", "title", "body") VALUES
        ('RANK_DEMOTION_WARNING',
         'Bạn sắp tụt hạng',
         'Bạn còn {balancePoints} điểm, gần mốc {thresholdPoints} điểm để giữ hạng {rank}. Tiêu thêm có thể làm bạn tụt hạng.'),
        ('RANK_DEMOTED',
         'Thứ hạng của bạn đã thay đổi',
         'Bạn đã chuyển từ hạng {fromRank} xuống {toRank} vì số điểm hiện tại đã giảm dưới ngưỡng.')
      ON CONFLICT ("type") DO NOTHING
    `);

    // Cột này giữ ảnh chụp số điểm lúc đổi hạng, nhưng tên nó nói sai kể từ khi
    // hạng do balance quyết: giá trị đang được ghi vào đó ở nhánh xét lại chính
    // là BALANCE, không phải lifetime. Đổi tên để người đọc audit sau này không
    // kết luận sai về căn cứ của một lần đổi hạng.
    await queryRunner.query(`
      ALTER TABLE "rank_transitions"
      RENAME COLUMN "lifetime_points" TO "points_at_transition"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rank_transitions"
      RENAME COLUMN "points_at_transition" TO "lifetime_points"
    `);
    await queryRunner.query(
      `DELETE FROM "notification_templates"
       WHERE "type" IN ('RANK_DEMOTION_WARNING', 'RANK_DEMOTED')`,
    );
  }
}
