import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho `referrals` theo NGƯỜI MỜI, 30/09.
 *
 * Bảng này từ đầu chỉ có `PK(id)` và `UQ(referee_id)` — tức mọi truy vấn đi theo
 * chiều `referrer_id` đều quét tuần tự. Và chiều đó là chiều duy nhất ai cũng dùng:
 *
 *   - `GET /referrals/me` cho mỗi lần mở trang giới thiệu;
 *   - ba câu SQL của phân hệ rank (đọc hạng, nhắc chu kỳ, chốt duy trì) — tức MỌI
 *     lượt bút toán điểm, vì `RankChangeNotifier.afterBalanceChange` gọi vào đó;
 *   - `findPendingQualifications` mỗi lượt `point:reconcile`.
 *
 * Hai index chứ không một:
 *
 *   - `(referrer_id, qualified_at)` phục vụ cả phép đếm "đã đủ điều kiện" lẫn phép
 *     lọc theo khoảng thời gian của chu kỳ duy trì hạng, vì `qualified_at` đứng ngay
 *     sau khoá lọc.
 *   - Index MỘT PHẦN trên các dòng còn treo. `findPendingQualifications` quét toàn
 *     bảng để tìm `qualified_at IS NULL`, mà số dòng treo luôn nhỏ so với tổng —
 *     đúng hình dạng mà index một phần sinh ra để phục vụ, và nó không phình theo số
 *     lượt giới thiệu đã xong.
 */
export class IndexReferralsByReferrer1796700000000 implements MigrationInterface {
  name = 'IndexReferralsByReferrer1796700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_referrals_referrer_qualified"
        ON "referrals" ("referrer_id", "qualified_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_referrals_pending"
        ON "referrals" ("created_at")
        WHERE "qualified_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referrals_pending"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_referrals_referrer_qualified"`,
    );
  }
}
