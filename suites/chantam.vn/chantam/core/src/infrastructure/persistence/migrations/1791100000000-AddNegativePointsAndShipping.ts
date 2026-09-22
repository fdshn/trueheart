import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Điểm âm ghi được, và hình thức vận chuyển kèm bên trả phí (CH-2, F78).
 *
 * **Vì sao cần `raw_balance_after`.** `balance_after` có ràng buộc `>= 0`, nên
 * phạt 50 điểm một người đang có 20 sẽ làm vỡ ràng buộc và trả 500. Bên A chốt
 * kẹp số dư về 0, NHƯNG vẫn ghi lại giá trị thật để đọc được "trừ 50 điểm, đang
 * âm 30". Thiếu cột này thì dòng log chỉ nói "về 0", và không ai biết người đó
 * hụt 30 hay hụt 300.
 *
 * Hai cột nói hai chuyện khác nhau và đều cần:
 *
 * ```
 * số dư 20, phạt 50
 *   balance_after      = 0     ← số tiêu được, không bao giờ âm
 *   raw_balance_after  = -30   ← sự thật số học, dùng để hiển thị và đối soát
 * ```
 *
 * Backfill bằng chính `balance_after`: trước migration này chưa rule nào âm nên
 * hai giá trị luôn bằng nhau, không có dữ liệu cũ nào bị diễn giải sai.
 *
 * **Bên trả phí ship chỉ là một DẤU HIỆU, không phải thanh toán.** Tiền ship trả
 * ngoài hệ thống (COD). Hệ thống chỉ ghi ai lẽ ra phải trả, để khi người gửi báo
 * hàng bị hoàn mà không được thanh toán thì có căn cứ trừ điểm.
 */
export class AddNegativePointsAndShipping1791100000000 implements MigrationInterface {
  name = 'AddNegativePointsAndShipping1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "point_ledger"
      ADD COLUMN "raw_balance_after" integer
    `);
    await queryRunner.query(
      `UPDATE "point_ledger" SET "raw_balance_after" = "balance_after"`,
    );
    await queryRunner.query(`
      ALTER TABLE "point_ledger"
      ALTER COLUMN "raw_balance_after" SET NOT NULL
    `);

    // Số dư tiêu được luôn là phần không âm của giá trị thật. Ràng buộc này giữ
    // hai cột không trôi khỏi nhau — thứ chắc chắn xảy ra nếu chỗ nào đó quên
    // cập nhật một trong hai.
    await queryRunner.query(`
      ALTER TABLE "point_ledger"
      ADD CONSTRAINT "CHK_point_ledger_balance_is_clamped_raw"
      CHECK ("balance_after" = GREATEST(0, "raw_balance_after"))
    `);

    await queryRunner.query(`
      ALTER TABLE "user_point_balances"
      ADD COLUMN "raw_balance" integer
    `);
    await queryRunner.query(
      `UPDATE "user_point_balances" SET "raw_balance" = "balance"`,
    );
    await queryRunner.query(`
      ALTER TABLE "user_point_balances"
      ALTER COLUMN "raw_balance" SET NOT NULL
    `);

    // `CHK_point_rules_points` cũ là `points >= 0` — hồi M4 mọi rule đều là
    // thưởng nên nó đúng. Rule phạt làm nó sai: seed bên dưới vỡ ngay lúc chạy
    // migration, tức deploy hỏng chứ không phải lỗi lúc chạy.
    //
    // Nới chứ không bỏ: rule 0 điểm không cộng cũng không trừ, chỉ là một mục
    // cấu hình chết mà người đọc log sẽ tưởng có tác dụng.
    await queryRunner.query(`
      ALTER TABLE "point_rules" DROP CONSTRAINT "CHK_point_rules_points"
    `);
    await queryRunner.query(`
      ALTER TABLE "point_rules"
      ADD CONSTRAINT "CHK_point_rules_points" CHECK ("points" <> 0)
    `);

    // Rule phạt: điểm ÂM. Số điểm là giá trị khởi tạo, Admin chỉnh sau qua
    // point rule versioning như mọi rule khác.
    await queryRunner.query(`
      INSERT INTO point_rules (code, points, daily_cap, version)
      VALUES ('SHIP_UNPAID_PENALTY', -50, NULL, 1)
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."posts_delivery_method_enum"
      AS ENUM ('SELF_PICKUP', 'GIVER_SHIPS')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."posts_ship_payer_enum"
      AS ENUM ('GIVER', 'RECEIVER')
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD COLUMN "delivery_method" "public"."posts_delivery_method_enum",
      ADD COLUMN "ship_payer" "public"."posts_ship_payer_enum"
    `);

    // Tự đến lấy thì không có phí ship để mà trả. Cho phép khai bên trả trong
    // trường hợp đó là mở đường cho một khoản phạt vô nghĩa.
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD CONSTRAINT "CHK_posts_ship_payer_needs_shipping"
      CHECK (
        "ship_payer" IS NULL
        OR "delivery_method" = 'GIVER_SHIPS'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "posts" DROP CONSTRAINT "CHK_posts_ship_payer_needs_shipping"`,
    );
    await queryRunner.query(`
      ALTER TABLE "posts"
      DROP COLUMN "ship_payer",
      DROP COLUMN "delivery_method"
    `);
    await queryRunner.query(`DROP TYPE "public"."posts_ship_payer_enum"`);
    await queryRunner.query(`DROP TYPE "public"."posts_delivery_method_enum"`);
    await queryRunner.query(
      `DELETE FROM point_rules WHERE code = 'SHIP_UNPAID_PENALTY'`,
    );
    // Trả ràng buộc về nguyên trạng. Phải xoá rule âm TRƯỚC, nếu không câu này
    // vỡ vì chính dòng vừa seed.
    await queryRunner.query(`
      ALTER TABLE "point_rules" DROP CONSTRAINT "CHK_point_rules_points"
    `);
    await queryRunner.query(`
      ALTER TABLE "point_rules"
      ADD CONSTRAINT "CHK_point_rules_points" CHECK ("points" >= 0)
    `);
    await queryRunner.query(
      `ALTER TABLE "user_point_balances" DROP COLUMN "raw_balance"`,
    );
    await queryRunner.query(
      `ALTER TABLE "point_ledger" DROP CONSTRAINT "CHK_point_ledger_balance_is_clamped_raw"`,
    );
    await queryRunner.query(
      `ALTER TABLE "point_ledger" DROP COLUMN "raw_balance_after"`,
    );
  }
}
