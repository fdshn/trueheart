import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ `point.referral_daily_cap` và `point.transaction_daily_cap` — 30/09.
 *
 * ## Vì sao BỎ chứ không nối vào code
 *
 * Yêu cầu là "sửa thành lấy từ config" cho mọi khoá đang nằm im. Với bốn khoá kia
 * đó đúng là việc cần làm. Với hai khoá này thì nối vào là **đi lùi**, nên tôi bỏ
 * chúng và ghi lý do ở đây.
 *
 * Trần ngày THẬT đã có và đang chạy: `point_rules.daily_cap`, đặt theo TỪNG MÃ
 * quy tắc, và Admin sửa được qua `GET|PUT /admin/point-rules`. Hôm nay nó mang
 * `GIFT_COMPLETED_GIVER = 10`, `GIFT_COMPLETED_RECEIVER = 5`,
 * `REFERRAL_QUALIFIED = 3`.
 *
 * Hai khoá trong `system_configs` là bản THÔ hơn của cùng một thứ. Nối chúng vào
 * gây hai hỏng:
 *
 * 1. **Hai con số cho một trần.** Chúng sẽ lệch, và khi lệch thì không ai biết
 *    con nào đang chạy. Đó đúng là họ lỗi mà lượt soát này đi dọn — `18-group`
 *    từng có `group_memberships.status` trong sơ đồ mà không có trong bảng, và bán
 *    kính nhóm từng đọc một ô không nói đơn vị.
 * 2. **Mất độ mịn.** Một khoá `transaction_daily_cap` không diễn đạt được "người
 *    tặng 10, người nhận 5" — nối vào là buộc hai mã về cùng một số, tức làm
 *    chính sách xấu đi để một ô cấu hình có việc làm.
 *
 * ## Vì sao xoá được mà không mất gì
 *
 * Không dòng code nào đọc hai khoá này, nên xoá không đổi hành vi. Bảng là
 * copy-on-write nên `down()` dựng lại được. Và `test:config-inventory` nay đỏ nếu
 * ai seed lại chúng mà không khai lý do — đó là hàng rào thật, không phải lời hứa.
 */
export class DropDuplicatePointCapKeys1796400000000 implements MigrationInterface {
  name = 'DropDuplicatePointCapKeys1796400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = ANY($1)`,
      [DUPLICATE_KEYS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dựng lại đúng giá trị seed ban đầu (`1790200000000`), để `down` về được
    // trạng thái cũ chứ không về một trạng thái na ná.
    for (const [key, value] of RESTORE)
      await queryRunner.query(
        `
          INSERT INTO "system_configs"
            ("config_key", "value_json", "value_type", "version", "status", "change_reason")
          VALUES ($1, $2::jsonb, 'INTEGER', 1, 'PUBLISHED', $3)
          ON CONFLICT DO NOTHING
        `,
        [key, JSON.stringify(value), 'Hoàn tác 1796400000000'],
      );
  }
}

const DUPLICATE_KEYS: readonly string[] = [
  'point.referral_daily_cap',
  'point.transaction_daily_cap',
];

const RESTORE: readonly (readonly [string, number])[] = [
  ['point.referral_daily_cap', 3],
  ['point.transaction_daily_cap', 10],
];
