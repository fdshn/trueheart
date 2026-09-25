import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ rule `GIFT_COMPLETED` trùng vai với `GIFT_COMPLETED_GIVER`.
 *
 * **Chuyện đã xảy ra.** Migration `1791200000000` seed sẵn
 * `GIFT_COMPLETED_GIVER` (56) và `GIFT_COMPLETED_RECEIVER` (28), và
 * `awardCompletionPoints` gọi cả hai lúc lượt trao `COMPLETED`. Nhưng
 * `docs/plan/GIVE-RECEIVE-FLOW.md` §H4 lại ghi "không có rule nào cho việc tặng
 * hoặc nhận, không chỗ nào gọi appendByRule khi COMPLETED" — tài liệu đã lạc
 * hậu. Tin tài liệu mà không đọc code, migration `1793100000000` seed thêm một mã
 * thứ ba là `GIFT_COMPLETED`, và đường thưởng theo % chính xác (F40) gắn vào mã
 * mới đó.
 *
 * Hệ quả: người tặng được **cộng hai lần** cho một lượt trao — 56 phẳng lúc hoàn
 * tất, rồi 56 × x% lúc người nhận đánh giá. Hai khoá chống trùng khác nhau nên
 * không cái nào chặn được cái nào.
 *
 * **Cách sửa.** Một mã duy nhất cho phần thưởng người tặng:
 * `GIFT_COMPLETED_GIVER`. Đường thưởng theo % dùng lại chính mã và chính khoá
 * chống trùng đó, còn `awardCompletionPoints` thôi cộng cho người tặng. Mã
 * `GIFT_COMPLETED` bị xoá để không ai nhầm lần nữa.
 *
 * Không phải dọn bút toán cũ: chưa có môi trường nào chạy hai đường cùng lúc, và
 * `point_ledger` là append-only — nếu có thì phải đảo bằng bút toán ngược, không
 * phải DELETE.
 */
export class DropDuplicateGiftCompletedRule1793400000000 implements MigrationInterface {
  name = 'DropDuplicateGiftCompletedRule1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Chặn trước: nếu ở đâu đó đã phát sinh bút toán theo mã trùng thì dừng
    // migration lại thay vì âm thầm xoá rule và để lại những bút toán trỏ vào
    // một mã không còn tồn tại.
    const rows = (await queryRunner.query(
      `SELECT count(*) AS total FROM point_ledger WHERE rule_code = 'GIFT_COMPLETED'`,
    )) as { total: string }[];
    const orphanCount = Number(rows[0]?.total ?? 0);
    if (orphanCount > 0)
      throw new Error(
        `Có ${orphanCount} bút toán theo mã GIFT_COMPLETED trùng vai. ` +
          'Phải đảo chúng bằng bút toán ngược trước khi gỡ rule — ' +
          'point_ledger là append-only, không DELETE được.',
      );

    await queryRunner.query(
      `DELETE FROM point_rules WHERE code = 'GIFT_COMPLETED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO point_rules (code, points, daily_cap, version)
      VALUES ('GIFT_COMPLETED', 56, 5, 1)
      ON CONFLICT (code, version) DO NOTHING
    `);
  }
}
