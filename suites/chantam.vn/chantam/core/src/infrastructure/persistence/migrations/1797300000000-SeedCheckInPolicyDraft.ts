import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bản nháp policy điểm danh (F83) — ĐANG TẮT, chờ Bên A duyệt số.
 *
 * Đặc tả cấm hard-code một mặc định CÓ TÁC DỤNG phát điểm, và bản này không có tác
 * dụng gì: `enabled = false`, nên mọi đường ghi vẫn trả `CHECK_IN_POLICY_UNAVAILABLE`.
 * Nó tồn tại để Bên A mở `GET /admin/check-in-policy` ra thấy một bộ số CÓ THẬT mà
 * phản biện, thay vì một form trống — một form trống thì câu trả lời thường là im lặng.
 *
 * ## Các con số đến từ đâu
 *
 * Suy từ kinh tế điểm ĐANG CHẠY, không bốc:
 *
 * - `GIFT_COMPLETED_RECEIVER` = 56 điểm cho một lượt trao hoàn tất ở mức 100%.
 * - Tỷ lệ đổi là 2.000 VNĐ/điểm (`point.redemption`).
 *
 * Với `dailyPoints = 2` và bốn mốc 10/25/60/120, một người điểm danh liên tục 50
 * ngày nhận 100 + 215 = **315 điểm**, tức khoảng **5,6 lượt trao hoàn tất**. Đó là
 * tỷ lệ có chủ ý: điểm danh là phần thưởng cho THÓI QUEN, và nó không được trả hơn
 * việc tặng đồ thật — nếu không thì cách tối ưu để lên hạng là mở app mỗi ngày chứ
 * không phải cho ai cái gì, và cả thang điểm mất nghĩa.
 *
 * Mốc tăng nhanh hơn tuyến tính (10 → 25 → 60 → 120) vì giữ chuỗi càng dài càng
 * khó: mất một ngày ở ngày thứ 49 là mất cả quãng, nên phần thưởng cuối phải đáng.
 *
 * `transactionsPerRepair = 4`: với thiết kế tính cho CẢ HAI bên (chốt 02/10), một
 * người vừa tặng vừa nhận chỉ cần 2 lượt trao để có một lượt bù. `repairWindowDays = 7`
 * khớp đúng đồng hồ 7 ngày đã dùng ở chọn người nhận (F75), nên người dùng chỉ phải
 * nhớ MỘT con số về "bao lâu thì hết hạn".
 *
 * Không giới hạn lượt bù tích trữ: lượt bù chỉ đến từ giao dịch hoàn tất THẬT, nên
 * tích được nhiều nghĩa là đã trao nhiều. Chặn chỗ đó là phạt đúng người tích cực.
 */
export class SeedCheckInPolicyDraft1797300000000 implements MigrationInterface {
  name = 'SeedCheckInPolicyDraft1797300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CHỈ seed khi bảng còn RỖNG. Admin đã publish bản nào thì đó là quyết định của
    // người thật, và một migration chèn thêm version sẽ hoặc đụng khoá chính, hoặc
    // tệ hơn là trở thành bản mới nhất rồi lặng lẽ ghi đè lựa chọn của họ.
    await queryRunner.query(`
      INSERT INTO "check_in_policy_revisions"
        ("version", "enabled", "daily_points", "milestones_json",
         "transactions_per_repair", "repair_window_days", "effective_at", "reason")
      SELECT 1, false, 2,
        '[{"streakDays":7,"bonusPoints":10},
          {"streakDays":14,"bonusPoints":25},
          {"streakDays":30,"bonusPoints":60},
          {"streakDays":50,"bonusPoints":120}]'::jsonb,
        4, 7, now(),
        'Bản nháp do nhóm kỹ thuật đề xuất, ĐANG TẮT — chờ Bên A duyệt số rồi bật'
      WHERE NOT EXISTS (SELECT 1 FROM "check_in_policy_revisions")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ xoá đúng bản nháp của chính migration này, nhận ra bằng version 1 CỘNG
    // trạng thái tắt. Một bản version 1 đã bật là bản Admin sửa, không phải của nó.
    await queryRunner.query(`
      DELETE FROM "check_in_policy_revisions"
      WHERE "version" = 1 AND "enabled" = false
    `);
  }
}
