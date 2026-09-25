import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đưa nốt các con số của vòng đời điểm ra cho Admin chỉnh (F40, F74, chu kỳ
 * duy trì).
 *
 * Trước migration này, **hoàn tất một lượt trao không cộng điểm nào** — không
 * có rule nào tồn tại để mà gọi. Hệ quả số học: ngưỡng Bạc là 672 điểm mà
 * đường kiếm điểm duy nhất còn lại là giới thiệu (56/lượt), tức phải mời 12
 * người mới lên nổi Bạc, còn tặng đồ — việc chính của nền tảng — đóng góp 0.
 *
 * **Vì sao 56.** Toàn bộ hệ điểm đã chốt là bội số của 56: giới thiệu 56,
 * xác minh SĐT 28 (= 56/2), onboarding 224 (= 56×4), và các ngưỡng rank 224 /
 * 672 / 896 / 1792 lần lượt là 56 × 4 / 12 / 16 / 32. Một lượt trao hoàn tất
 * được đánh giá 100% đáng bằng một lượt giới thiệu hợp lệ.
 *
 * Mọi giá trị ở đây là **điểm khởi đầu hợp lý**, không phải hằng số thiêng:
 * cả bốn đều sửa được lúc chạy qua Admin CMS, có audit và có phiên bản.
 */
export class SeedPointEconomyConfig1793100000000 implements MigrationInterface {
  name = 'SeedPointEconomyConfig1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Điểm cho một lượt trao hoàn tất — KHÔNG seed mã mới.
    //
    // `GIFT_COMPLETED_GIVER` (56) đã tồn tại từ migration `1791200000000`. Bản
    // đầu của migration này seed thêm một mã `GIFT_COMPLETED`, và đó là lỗi:
    // hai mã nghĩa là hai khoá chống trùng, nên người tặng được cộng hai lần
    // cho một lượt trao. Migration `1793400000000` gỡ mã trùng đó.
    //
    // Số điểm thực nhận = `points` của `GIFT_COMPLETED_GIVER` × phần trăm chính
    // xác do NGƯỜI NHẬN chấm (F40), nên 56 là mức TRẦN của một lượt.

    // 2. Tỷ lệ quy đổi điểm sang VNĐ khi ĐỔI vật phẩm (F74).
    //
    // 2.000 VNĐ/điểm: món khai 1.000.000 VNĐ cần 500 điểm, tức khoảng 9 lượt
    // trao hoàn tất ở mức 100%. Chọn theo câu hỏi trả lời được — "tặng bao
    // nhiêu món thì đổi được một món tương đương" — chứ không theo cảm giác về
    // giá trị một điểm.
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES (
        'point.redemption',
        '{"vndPerPoint": 2000}',
        'JSON', 1, 'PUBLISHED',
        'Tỷ lệ quy đổi điểm khi đổi vật phẩm (F74): giá trị tham khảo chia cho số này ra số điểm cần có'
      )
      ON CONFLICT DO NOTHING
    `);

    // 3. Nhánh "người nhận không đánh giá" (F40).
    //
    // Phần lớn người nhận sẽ nhận đồ rồi biến mất. Cho 0 điểm là phạt người
    // tặng vì việc của người khác; cho thẳng 100% thì người nhận có động cơ
    // *không* đánh giá để giúp người tặng, và chỉ số accuracy mất nghĩa.
    //
    // 7 ngày khớp nhịp countdown chọn người nhận đã có trong sản phẩm. 80% nằm
    // trên ngưỡng gắn cờ (75) nên một lượt không được đánh giá không bao giờ tự
    // nó kéo ai vào diện Admin xem xét.
    //
    // Mức này KHÔNG tính vào mẫu Giver Accuracy — nó là giá trị hệ thống tự
    // điền, không phải ý kiến người thật.
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES (
        'review.grace',
        '{"graceDays": 7, "defaultAccuracyPercent": 80}',
        'JSON', 1, 'PUBLISHED',
        'Chờ bao lâu rồi áp mức phần trăm mặc định khi người nhận không đánh giá (F40). Mức mặc định không tính vào mẫu Giver Accuracy'
      )
      ON CONFLICT DO NOTHING
    `);

    // 4. Mức phạt khi trượt nhiệm vụ chu kỳ 3 tháng.
    //
    // Đặt ở `rank_tiers` chứ không phải một point rule phẳng, vì nhiệm vụ vốn
    // đã khác nhau theo bậc (2+2 / 3+3 / 4+4) — một mức phạt chung sẽ hoặc quá
    // nhẹ với Kim Cương hoặc quá nặng với Bạc.
    //
    // Giá trị = đúng số điểm đáng lẽ kiếm được nếu làm đủ nhiệm vụ quý đó:
    // Bạc (2 lượt trao + 2 giới thiệu) × 56 = 224, Vàng 336, Kim Cương 448.
    // Trượt thì mất đúng phần mình không làm, không hơn.
    //
    // Rank do balance quyết (chốt 2026-09-24) nên khoản phạt tác động tới hạng
    // GIÁN TIẾP qua điểm. Cho nhiệm vụ trực tiếp hạ hạng sẽ tạo hai cơ chế cùng
    // quyết một thứ: hệ thống tụt người ta xuống Bạc, rồi lần xét kế tiếp thấy
    // balance vẫn ở mức Vàng và đẩy ngược lên.
    await queryRunner.query(`
      ALTER TABLE "rank_tiers"
      ADD COLUMN IF NOT EXISTS "maintenance_penalty_points" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "rank_tiers"
      ADD CONSTRAINT "CHK_rank_tiers_maintenance_penalty"
      CHECK ("maintenance_penalty_points" >= 0)
    `);
    await queryRunner.query(`
      UPDATE "rank_tiers" SET "maintenance_penalty_points" = CASE "rank"
        WHEN 'SILVER' THEN 224
        WHEN 'GOLD' THEN 336
        WHEN 'DIAMOND' THEN 448
        ELSE 0
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rank_tiers"
      DROP CONSTRAINT IF EXISTS "CHK_rank_tiers_maintenance_penalty"
    `);
    await queryRunner.query(`
      ALTER TABLE "rank_tiers"
      DROP COLUMN IF EXISTS "maintenance_penalty_points"
    `);
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" IN ('point.redemption', 'review.grace')`,
    );
  }
}
