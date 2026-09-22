import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Điểm cho việc tặng và nhận (H4).
 *
 * Trước migration này, **hoàn tất một lượt trao không cộng điểm nào**. Rule đã
 * seed chỉ có xác thực số điện thoại (28), giới thiệu (56) và phạt ship (−50).
 * Làm phép tính thì thấy hệ quả: ngưỡng `SILVER` là 672 điểm, mà đường kiếm
 * điểm duy nhất còn lại là giới thiệu 56/lượt — phải mời 12 người mới lên nổi
 * Bạc, còn tặng đồ thì không đóng góp gì.
 *
 * Số điểm là **giá trị khởi tạo**, Admin chỉnh qua point rule versioning như
 * mọi rule khác. Code chỉ biết mã rule, không biết con số.
 *
 * **Vì sao người tặng nhiều điểm hơn người nhận.** Người tặng bỏ ra một món đồ
 * thật; người nhận đến lấy và bấm xác nhận. Cho hai bên bằng nhau là xoá mất
 * chênh lệch khuyến khích về phía việc mà nền tảng tồn tại để làm.
 *
 * **Vì sao nhận KHÔNG cộng `lifetime`.** `lifetime` là sàn của Rank. Cho việc
 * nhận đẩy hạng lên thì hai người có thể chuyền qua chuyền lại một món đồ để
 * cùng lên hạng. Nhận vẫn được điểm TIÊU ĐƯỢC — đủ để họ có lý do bấm xác nhận
 * — nhưng hạng chỉ đo thứ mình cho đi.
 *
 * Trần theo ngày là lớp chặn thứ hai, không phải lớp duy nhất: nó làm chậm việc
 * cày điểm chứ không chặn được. Chống gian lận thật thuộc F50/M5.
 */
export class SeedGiftCompletionPointRules1791200000000 implements MigrationInterface {
  name = 'SeedGiftCompletionPointRules1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO point_rules
        (code, points, affects_lifetime, daily_cap, version)
      VALUES
        ('GIFT_COMPLETED_GIVER', 56, true, 10, 1),
        ('GIFT_COMPLETED_RECEIVER', 28, false, 5, 1)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM point_rules
      WHERE code IN ('GIFT_COMPLETED_GIVER', 'GIFT_COMPLETED_RECEIVER')
    `);
  }
}
