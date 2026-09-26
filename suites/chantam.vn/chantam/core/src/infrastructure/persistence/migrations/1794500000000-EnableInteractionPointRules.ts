import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bật hai rule điểm tương tác (F41) — chốt 26/09.
 *
 * `POST_COMMENTED` và `POST_REACTED` được seed TẮT sẵn vì lúc dựng bảng chưa ai
 * chốt có thưởng cho bình luận hay không. Nay Bên A đã chốt: bật.
 *
 * Mở van tối đa **40đ/người/ngày** (10 lượt × 2đ + 20 lượt × 1đ) vào `balance`.
 * `affects_lifetime` GIỮ NGUYÊN `false` — `lifetime` là sàn của Rank, và cho
 * bình luận đẩy hạng thì gõ 300 dòng "hay quá ạ" là lên Bạc trong khi tặng một
 * món đồ thật được 56 điểm.
 *
 * Ghi thành **phiên bản mới** chứ không `UPDATE` dòng cũ: `point_rules` là bảng
 * copy-on-write, đọc bằng `DISTINCT ON (code) … ORDER BY version DESC`. Sửa tại
 * chỗ là xoá mất bằng chứng rằng rule từng tắt, và Admin mở lịch sử ra sẽ thấy
 * nó luôn luôn bật.
 *
 * `REPORT_UPHELD` CỐ Ý để nguyên trạng thái tắt: thưởng cho người báo xấu có
 * động lực lệch hẳn so với thưởng cho người bình luận, và Bên A chưa chốt.
 */
export class EnableInteractionPointRules1794500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "point_rules"
        ("code", "points", "is_enabled", "affects_lifetime", "daily_cap", "version")
      SELECT DISTINCT ON ("code")
        "code", "points", TRUE, "affects_lifetime", "daily_cap", "version" + 1
      FROM "point_rules"
      WHERE "code" IN ('POST_COMMENTED', 'POST_REACTED')
        AND "is_enabled" = FALSE
      ORDER BY "code" ASC, "version" DESC
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ gỡ đúng phiên bản do migration này thêm vào. Xoá theo `code` là xoá cả
    // những lần Admin tự sửa sau đó — thứ migration này chưa bao giờ ghi.
    await queryRunner.query(`
      DELETE FROM "point_rules"
      WHERE "code" IN ('POST_COMMENTED', 'POST_REACTED')
        AND "is_enabled" = TRUE
        AND "updated_by" IS NULL
        AND "version" > 1
    `);
  }
}
