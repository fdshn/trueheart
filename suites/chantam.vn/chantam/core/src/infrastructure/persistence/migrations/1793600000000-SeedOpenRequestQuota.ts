import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giới hạn số yêu cầu xin nhận ĐANG MỞ của một người (`OPEN_REQUEST_QUOTA`).
 *
 * **Vì sao cần từ khi có countdown.** Trước đây một người xin 100 bài rồi bỏ hết
 * chỉ làm phiền 100 chủ bài. Từ 2026-09-25, yêu cầu ĐẦU TIÊN trên mỗi bài mở một
 * đồng hồ 7 ngày — nên cùng hành vi đó nay **khoá 100 bài trong một tuần**, kể cả
 * khi người xin không bao giờ quay lại.
 *
 * Đếm cả `PENDING` và `STANDBY`: `STANDBY` vẫn là yêu cầu đang mở — người đó còn
 * trong hàng đợi và được xét tiếp nếu lượt trao hiện tại đổ (F33). Bỏ `STANDBY`
 * ra khỏi phép đếm là mở đúng cái cửa mà giới hạn này sinh ra để đóng.
 *
 * Con số theo bậc, bám đúng khuôn của `POST_OFFER`: người có thứ hạng cao đã
 * chứng minh được nhiều hơn, nên giữ nhiều yêu cầu mở cùng lúc hơn. Viewer bằng 0
 * vì họ chưa qua cổng hồ sơ.
 *
 * Mọi con số ở đây Admin sửa được lúc chạy qua `POST /api/v1/admin/entitlements`.
 */
export class SeedOpenRequestQuota1793600000000 implements MigrationInterface {
  name = 'SeedOpenRequestQuota1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "capability_policies" ("revision_id", "code")
      SELECT revision."id", 'OPEN_REQUEST_QUOTA'
      FROM "config_revisions" revision
      INNER JOIN "config_bundles" bundle ON bundle."id" = revision."bundle_id"
      WHERE bundle."code" = 'M6_BASE_POLICY'
        AND revision."scope" = 'ENTITLEMENT'
      ON CONFLICT ("revision_id", "code") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "capability_rank_values" ("policy_id", "rank", "allowed", "limit_value")
      SELECT policy."id", rank_value."rank", rank_value."allowed", rank_value."limit_value"
      FROM "capability_policies" policy
      CROSS JOIN (VALUES
        ('VIEWER'::users_rank_enum, false, 0),
        ('MEMBER'::users_rank_enum, true, 5),
        ('SILVER'::users_rank_enum, true, 10),
        ('GOLD'::users_rank_enum, true, 20),
        ('DIAMOND'::users_rank_enum, true, 30)
      ) AS rank_value("rank", "allowed", "limit_value")
      WHERE policy."code" = 'OPEN_REQUEST_QUOTA'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "capability_rank_values"
      WHERE "policy_id" IN (
        SELECT "id" FROM "capability_policies" WHERE "code" = 'OPEN_REQUEST_QUOTA'
      )
    `);
    await queryRunner.query(
      `DELETE FROM "capability_policies" WHERE "code" = 'OPEN_REQUEST_QUOTA'`,
    );
  }
}
