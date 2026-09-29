import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bật `REPORT_UPHELD` — chốt 29/09.
 *
 * Rule này seed TẮT từ migration `1792700000000` và cố ý không được bật cùng hai
 * rule tương tác ở `1794500000000`: thưởng cho người báo xấu có động lực lệch hẳn
 * so với thưởng cho người bình luận, nên phải chờ Bên A quyết riêng. Nay đã quyết.
 *
 * **Trần 5 lượt/ngày là phần chống lạm dụng, không phải trang trí.** 5 điểm một
 * lượt được xử lý nghe nhỏ, nhưng báo xấu là hành động tạo VIỆC cho người khác:
 * mỗi lượt là một mục trong hàng đợi Admin. Không có trần thì cách cày điểm rẻ
 * nhất là rải báo xấu vu vơ, và cái giá rơi vào thời gian của Admin chứ không
 * phải vào người cày.
 *
 * Trần ở đây là MẤT, không phải hoãn: báo xấu là hành động lặp được, nên trần
 * chính là hàng rào — xem `RetryablePointRuleCodes`.
 *
 * Ghi thành **phiên bản mới** chứ không `UPDATE` dòng cũ: `point_rules` là bảng
 * copy-on-write, đọc bằng `DISTINCT ON (code) … ORDER BY version DESC`. Sửa tại
 * chỗ là xoá mất bằng chứng rằng rule từng tắt.
 */
export class EnableReportUpheldPointRule1795300000000 implements MigrationInterface {
  name = 'EnableReportUpheldPointRule1795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "point_rules"
        ("code", "points", "is_enabled", "affects_lifetime", "daily_cap", "version")
      SELECT DISTINCT ON ("code")
        "code", "points", TRUE, "affects_lifetime", "daily_cap", "version" + 1
      FROM "point_rules"
      WHERE "code" = 'REPORT_UPHELD'
        AND "is_enabled" = FALSE
      ORDER BY "code" ASC, "version" DESC
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ gỡ đúng phiên bản do migration này thêm. Xoá theo `code` là xoá cả
    // những lần Admin tự sửa sau đó — thứ migration này chưa bao giờ ghi.
    await queryRunner.query(`
      DELETE FROM "point_rules"
      WHERE "code" = 'REPORT_UPHELD'
        AND "is_enabled" = TRUE
        AND "updated_by" IS NULL
        AND "version" > 1
    `);
  }
}
