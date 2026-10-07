import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trần giá trị dùng để tính `value_bonus`, 07/10 (CHỐT-14).
 *
 * ## Vì sao khoá này tồn tại: nó là van an toàn của một lỗ in điểm
 *
 * CHỐT-14 đưa **giá người tặng tự khai** vào công thức tính điểm. Tới 06/10 thiết kế
 * cố ý loại giá đó ra, với lý do ghi thẳng trong
 * `award-gift-completion.use-case.ts`: đó là chỗ chặn khai khống để cày điểm.
 *
 * Không có trần thì số học như sau:
 *
 * ```text
 * estimated_value trần  1.000.000.000đ   (MaxClassifiedPrice)
 * vndPerPoint              2.000
 * => một lượt trao      500.000 điểm
 * ngưỡng Kim Cương       1.792 điểm      => 279 lần
 * ```
 *
 * Và không cần khai trần: 5.000.000đ cho một laptop cũ — hoàn toàn hợp lý — đã ra
 * 2.500 điểm, tức vượt Kim Cương bằng MỘT giao dịch. Hai người thông đồng, một khai
 * giá một chấm 100%, in được điểm không giới hạn.
 *
 * `value_bonus` buộc phải đi qua `appendAdjustment` vì mức cơ sở của nó là động, và
 * đo được 07/10: đường đó **không kiểm trần ngày nào cả**. Nên khoá này là van duy
 * nhất.
 *
 * ## Vì sao 2.000.000đ
 *
 * Với `vndPerPoint` 2.000 thì trần cho tối đa 1.000 điểm một lượt — dưới ngưỡng Kim
 * Cương (1.792), nên không ai lên hạng cao nhất bằng một giao dịch tự khai giá. Đồng
 * thời đủ rộng để phần lớn vật phẩm thật được quy đổi trọn giá trị.
 *
 * Đây là con số CHẶN, không phải con số chính sách — Bên A hạ hay nâng tuỳ ý qua
 * `POST /admin/system-configs`. `0` hợp lệ và có nghĩa: tắt hẳn thưởng theo giá trị.
 *
 * ## Vì sao INTEGER chứ không JSON
 *
 * `POST /admin/system-configs` hiện chỉ nhận `valueType: INTEGER`. Một khoá hình JSON
 * thì seed được, đọc được, mà **không ai sửa được qua API** — chỉ còn SQL tay. Một van
 * an toàn chỉ xoay được bằng SQL tay thì không ai dám xoay nó khi cần. Cùng lý do mà
 * `SeedReferralAbuseConfig` chọn ba dòng INTEGER thay vì một dòng JSON.
 */
export class SeedGiftValueBonusCap1799200000000 implements MigrationInterface {
  name = 'SeedGiftValueBonusCap1799200000000';

  private static readonly Key = 'point.value_bonus_max_value_vnd';
  private static readonly Value = 2_000_000;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO "system_configs"
          ("config_key", "value_json", "value_type", "version", "status", "change_reason")
        VALUES ($1, $2::jsonb, 'INTEGER', 1, 'PUBLISHED', $3)
        ON CONFLICT DO NOTHING
      `,
      [
        SeedGiftValueBonusCap1799200000000.Key,
        JSON.stringify(SeedGiftValueBonusCap1799200000000.Value),
        'Trần giá trị quy ra điểm thưởng (CHỐT-14). 2.000.000đ với tỷ lệ 2.000 đ/điểm ' +
          'cho tối đa 1.000 điểm một lượt, dưới ngưỡng Kim Cương 1.792 — chặn việc khai ' +
          'giá khống để cày điểm. 0 = tắt hẳn thưởng theo giá trị',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = $1`,
      [SeedGiftValueBonusCap1799200000000.Key],
    );
  }
}
