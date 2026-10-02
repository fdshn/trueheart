import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bộ máy chia thưởng affiliate nhóm (F56-F58).
 *
 * Ba bảng:
 *
 * - affiliate_policy_revisions - chính sách có version, cùng khuôn
 *   check_in_policy_revisions: bản đang chạy là version lớn nhất đã tới hiệu lực,
 *   KHÔNG có cột trạng thái phải giữ đồng bộ.
 * - affiliate_events - một dòng cho mỗi sự kiện gốc, kèm KẾT LUẬN GEO và đủ số đo
 *   để trả lời "vì sao sự kiện này bị loại" (BR-GEO-AFF-03, F58).
 * - affiliate_rewards - một dòng cho mỗi người nhận của mỗi sự kiện (BR-AFF-03),
 *   với khoá chống trùng đúng bộ ba của BR-AFF-04.
 *
 * Cột của affiliate_rewards lấy đúng danh sách BR-AFF-03 nêu: group_id,
 * source_user_id, beneficiary_user_id, event_type, reference_id, geo_status,
 * reward_status, point_delta, idempotency_key, created_at.
 *
 * Sự kiện NGOÀI vùng vẫn được lưu với point_delta = 0 - đặc tả nói rõ là lưu để
 * audit, không im lặng bỏ. Một sự kiện bị loại mà không để lại dấu thì Owner hỏi
 * "vì sao nhóm tôi không được điểm" và không ai trả lời được.
 */
export class CreateAffiliateEngine1797400000000 implements MigrationInterface {
  name = 'CreateAffiliateEngine1797400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "affiliate_policy_revisions" (
        "version" int NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "distribution_mode" varchar(16) NOT NULL DEFAULT 'SPLIT_POOL',
        "event_points_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "daily_cap_per_beneficiary" int NOT NULL DEFAULT 0,
        "max_beneficiaries_per_event" int NOT NULL DEFAULT 0,
        "effective_at" timestamptz NOT NULL DEFAULT now(),
        "reason" varchar(500) NOT NULL,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_affiliate_policy_revisions" PRIMARY KEY ("version"),
        CONSTRAINT "FK_affiliate_policy_revisions_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_affiliate_policy_mode"
          CHECK ("distribution_mode" IN ('SPLIT_POOL', 'PER_MEMBER')),
        CONSTRAINT "CHK_affiliate_policy_daily_cap"
          CHECK ("daily_cap_per_beneficiary" >= 0 AND "daily_cap_per_beneficiary" <= 100000),
        CONSTRAINT "CHK_affiliate_policy_max_beneficiaries"
          CHECK ("max_beneficiaries_per_event" >= 0 AND "max_beneficiaries_per_event" <= 5000),
        CONSTRAINT "CHK_affiliate_policy_points_object"
          CHECK (jsonb_typeof("event_points_json") = 'object')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "affiliate_events" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "source_user_id" uuid NOT NULL,
        "event_type" varchar(32) NOT NULL,
        "reference_type" varchar(50) NOT NULL,
        "reference_id" varchar(200) NOT NULL,
        "geo_status" varchar(24) NOT NULL,
        "location_source" varchar(20) NOT NULL,
        "distance_meters" int,
        "radius_meters" int,
        "beneficiary_count" int NOT NULL DEFAULT 0,
        "total_points" int NOT NULL DEFAULT 0,
        "policy_version" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_affiliate_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_affiliate_events_global_id" UNIQUE ("global_id"),
        -- Một sự kiện gốc chỉ sinh MỘT bản ghi cho mỗi nhóm. Lượt gọi lại - retry,
        -- cron chạy hai lần - bị chặn ở đây chứ không ở phép đọc trước.
        CONSTRAINT "UQ_affiliate_events_source"
          UNIQUE ("group_id", "event_type", "reference_type", "reference_id"),
        CONSTRAINT "FK_affiliate_events_group"
          FOREIGN KEY ("group_id") REFERENCES groups("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_affiliate_events_source_user"
          FOREIGN KEY ("source_user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_affiliate_events_policy"
          FOREIGN KEY ("policy_version") REFERENCES affiliate_policy_revisions("version"),
        CONSTRAINT "CHK_affiliate_events_geo_status"
          CHECK ("geo_status" IN ('ELIGIBLE', 'NOT_ELIGIBLE_GEO', 'NO_LOCATION')),
        CONSTRAINT "CHK_affiliate_events_location_source"
          CHECK ("location_source" IN ('EVENT', 'TRANSACTION', 'POST', 'MEMBER_DEFAULT', 'NONE')),
        -- Ngoài vùng thì tổng điểm phải là 0. Ràng buộc ở database vì đây là quy tắc
        -- tiền, và một nhánh code quên nó thì không ai thấy.
        CONSTRAINT "CHK_affiliate_events_geo_zero"
          CHECK ("geo_status" = 'ELIGIBLE' OR "total_points" = 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_affiliate_events_group" ON "affiliate_events" ("group_id", "created_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "affiliate_rewards" (
        "id" BIGSERIAL NOT NULL,
        "event_id" bigint NOT NULL,
        "group_id" uuid NOT NULL,
        "source_user_id" uuid NOT NULL,
        "beneficiary_user_id" uuid NOT NULL,
        "event_type" varchar(32) NOT NULL,
        "reference_type" varchar(50) NOT NULL,
        "reference_id" varchar(200) NOT NULL,
        "geo_status" varchar(24) NOT NULL,
        "reward_status" varchar(24) NOT NULL,
        "point_delta" int NOT NULL DEFAULT 0,
        "point_ledger_id" bigint,
        "idempotency_key" varchar(300) NOT NULL,
        "policy_version" int NOT NULL,
        "reversed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_affiliate_rewards" PRIMARY KEY ("id"),
        -- BR-AFF-04 nguyên văn: không cộng lặp cho cùng beneficiary + source
        -- reference + event_type. Đây là chỗ luật đó được thi hành, không phải một
        -- phép đọc trước ở tầng ứng dụng.
        CONSTRAINT "UQ_affiliate_rewards_beneficiary_source"
          UNIQUE ("beneficiary_user_id", "event_type", "reference_type", "reference_id"),
        CONSTRAINT "UQ_affiliate_rewards_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_affiliate_rewards_event"
          FOREIGN KEY ("event_id") REFERENCES affiliate_events("id") ON DELETE CASCADE,
        CONSTRAINT "FK_affiliate_rewards_group"
          FOREIGN KEY ("group_id") REFERENCES groups("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_affiliate_rewards_beneficiary"
          FOREIGN KEY ("beneficiary_user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_affiliate_rewards_ledger"
          FOREIGN KEY ("point_ledger_id") REFERENCES point_ledger("id"),
        CONSTRAINT "FK_affiliate_rewards_policy"
          FOREIGN KEY ("policy_version") REFERENCES affiliate_policy_revisions("version"),
        CONSTRAINT "CHK_affiliate_rewards_geo_status"
          CHECK ("geo_status" IN ('ELIGIBLE', 'NOT_ELIGIBLE_GEO', 'NO_LOCATION')),
        CONSTRAINT "CHK_affiliate_rewards_status"
          CHECK ("reward_status" IN ('AWARDED', 'NOT_ELIGIBLE_GEO', 'CAPPED', 'REVERSED')),
        CONSTRAINT "CHK_affiliate_rewards_delta" CHECK ("point_delta" >= 0),
        -- NOT_ELIGIBLE_GEO và CAPPED chưa bao giờ phát điểm nên phải là 0. Nhưng
        -- REVERSED thì GIỮ số điểm gốc: nó là dòng audit trả lời "đã thu hồi bao
        -- nhiêu", và ép nó về 0 là xoá đúng thông tin cần nhất lúc đối soát.
        CONSTRAINT "CHK_affiliate_rewards_zero_unless_awarded"
          CHECK ("reward_status" IN ('AWARDED', 'REVERSED') OR "point_delta" = 0),
        -- Dòng đã từng phát điểm phải trỏ được tới bút toán gốc. Bút toán ĐẢO nằm ở
        -- point_ledger như một dòng mới, nên từ đây tra được cả hai đầu.
        CONSTRAINT "CHK_affiliate_rewards_ledger_pairing"
          CHECK ("reward_status" NOT IN ('AWARDED', 'REVERSED')
                 OR "point_ledger_id" IS NOT NULL),
        -- REVERSED thì phải có mốc thu hồi, và chỉ REVERSED mới được có.
        CONSTRAINT "CHK_affiliate_rewards_reversed_at"
          CHECK (("reversed_at" IS NOT NULL) = ("reward_status" = 'REVERSED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_affiliate_rewards_beneficiary" ON "affiliate_rewards" ("beneficiary_user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_affiliate_rewards_event" ON "affiliate_rewards" ("event_id")`,
    );

    // KHÔNG trigger append-only ở đây, khác point_ledger và repair_credit_ledger.
    // Lý do: BR-AFF-04 đòi đường thu hồi đổi reward_status sang REVERSED, nên bảng
    // này phải UPDATE được. Tính bất biến nằm ở chỗ khác - bút toán điểm trong
    // point_ledger vẫn chỉ ghi thêm, và thu hồi là GHI THÊM một bút toán đảo.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "affiliate_rewards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "affiliate_events"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "affiliate_policy_revisions"`,
    );
  }
}
