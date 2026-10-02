import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nền cho điểm danh, chuỗi ngày liên tiếp và lượt bù (F83).
 *
 * Bảy bảng, chia làm ba nhóm:
 *
 * - **Lịch và chuỗi**: `check_in_entries`, `check_in_runs`, `check_in_milestone_awards`
 * - **Lượt bù**: `repair_transaction_progress`, `repair_credit_cohorts`, `repair_credit_ledger`
 * - **Chính sách**: `check_in_policy_revisions`
 *
 * Mọi cột ngày nghiệp vụ là `date`, KHÔNG phải `timestamptz`: "ngày 02/10 ở Việt
 * Nam" không có giờ, và lưu nó thành một mốc thời gian là mời mọi truy vấn sau
 * này phải nhớ chuyển múi giờ — chỗ nào quên là một ngày lệch. Các mốc *thời
 * điểm* (`created_at`, `effective_at`) vẫn là `timestamptz` UTC như mọi nơi khác.
 *
 * `check_in_entries` và `repair_credit_ledger` chỉ GHI THÊM, có trigger chặn
 * `UPDATE`/`DELETE` y như `point_ledger`: một ngày đã điểm danh và một lượt đã
 * phát là sự kiện đã xảy ra, và sửa chúng trong im lặng thì số dư lượt bù không
 * còn đối soát được với lịch sử.
 */
export class CreateCheckInStreak1797100000000 implements MigrationInterface {
  name = 'CreateCheckInStreak1797100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "check_in_policy_revisions" (
        "version" int NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "daily_points" int NOT NULL DEFAULT 0,
        "milestones_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "transactions_per_repair" int NOT NULL DEFAULT 0,
        "repair_window_days" int NOT NULL DEFAULT 0,
        "effective_at" timestamptz NOT NULL DEFAULT now(),
        "reason" varchar(500) NOT NULL,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_check_in_policy_revisions" PRIMARY KEY ("version"),
        CONSTRAINT "FK_check_in_policy_revisions_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        -- Không âm, và có trần để một lần gõ nhầm không phát ra số điểm nhiều hơn
        -- toàn hệ thống cộng lại. Trần khớp các hằng ở core-lib/models/check-in.ts.
        CONSTRAINT "CHK_check_in_policy_daily_points"
          CHECK ("daily_points" >= 0 AND "daily_points" <= 1000),
        CONSTRAINT "CHK_check_in_policy_transactions_per_repair"
          CHECK ("transactions_per_repair" >= 0 AND "transactions_per_repair" <= 1000),
        CONSTRAINT "CHK_check_in_policy_repair_window"
          CHECK ("repair_window_days" >= 0 AND "repair_window_days" <= 365),
        CONSTRAINT "CHK_check_in_policy_milestones_array"
          CHECK (jsonb_typeof("milestones_json") = 'array')
      )
    `);

    // Bản ĐANG hiệu lực là bản có `version` lớn nhất với `effective_at <= now()`.
    // Không có cột `status`: bài học từ `config_revisions`, nơi đường publish đặt
    // `effective_to` mà giữ `PUBLISHED` nên cột trạng thái nói sai suốt N lượt
    // publish mà không ai thấy, vì không đường đọc nào đọc nó (migration
    // `1796900000000` phải đi dọn). Một nguồn sự thật thì không lệch được.
    await queryRunner.query(
      `CREATE INDEX "IDX_check_in_policy_effective" ON "check_in_policy_revisions" ("effective_at" DESC, "version" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "check_in_runs" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "start_date" date NOT NULL,
        "latest_covered_date" date NOT NULL,
        "current_length" int NOT NULL DEFAULT 1,
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
        "version" int NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_check_in_runs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_check_in_runs_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_check_in_runs_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_check_in_runs_status"
          CHECK ("status" IN ('ACTIVE', 'AT_RISK', 'ENDED')),
        CONSTRAINT "CHK_check_in_runs_span"
          CHECK ("latest_covered_date" >= "start_date"),
        CONSTRAINT "CHK_check_in_runs_length" CHECK ("current_length" >= 0)
      )
    `);

    // Mỗi user chỉ được có MỘT chuỗi chưa đóng. Thiếu ràng buộc này thì hai
    // request điểm danh song song có thể mở hai chuỗi, và từ đó mọi con số chuỗi
    // của người đó phụ thuộc vào việc truy vấn nào đọc được hàng nào trước.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_check_in_runs_open_per_user"
      ON "check_in_runs" ("user_id") WHERE "status" <> 'ENDED'
    `);

    await queryRunner.query(`
      CREATE TABLE "check_in_entries" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "policy_date" date NOT NULL,
        "kind" varchar(16) NOT NULL,
        "run_id" bigint NOT NULL,
        "streak_day" int NOT NULL,
        "policy_version" int NOT NULL,
        "daily_points_awarded" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_check_in_entries" PRIMARY KEY ("id"),
        -- Khoá nghiệp vụ thật: một user, một ngày, một dấu. Đây là thứ chặn hai
        -- request đồng thời, không phải phép đọc trước ở tầng ứng dụng.
        CONSTRAINT "UQ_check_in_entries_user_date" UNIQUE ("user_id", "policy_date"),
        CONSTRAINT "FK_check_in_entries_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_check_in_entries_run"
          FOREIGN KEY ("run_id") REFERENCES check_in_runs("id") ON DELETE CASCADE,
        CONSTRAINT "FK_check_in_entries_policy"
          FOREIGN KEY ("policy_version") REFERENCES check_in_policy_revisions("version"),
        CONSTRAINT "CHK_check_in_entries_kind" CHECK ("kind" IN ('NORMAL', 'REPAIR')),
        -- Ngày bù KHÔNG nhận điểm cơ bản của ngày bỏ lỡ. Ràng buộc ở database vì
        -- đây là quy tắc tiền, và một nhánh code quên nó thì không ai thấy.
        CONSTRAINT "CHK_check_in_entries_repair_no_daily_points"
          CHECK ("kind" <> 'REPAIR' OR "daily_points_awarded" = 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_check_in_entries_user_date" ON "check_in_entries" ("user_id", "policy_date" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_check_in_entries_run" ON "check_in_entries" ("run_id", "policy_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE "check_in_milestone_awards" (
        "id" BIGSERIAL NOT NULL,
        "run_id" bigint NOT NULL,
        "user_id" uuid NOT NULL,
        -- Dấu điểm danh đã ĐƯA chuỗi tới mốc này. Thiếu nó thì màn lịch sử phải
        -- suy ngày đạt mốc từ streak_day của entry, và phép suy đó sai ngay sau
        -- một lần bù: entry chỉ ghi thêm nên streak_day của những ngày cũ giữ
        -- giá trị lúc chèn, trong khi chiều dài chuỗi thì đã nhảy lên.
        "entry_id" bigint NOT NULL,
        "milestone_days" int NOT NULL,
        "bonus_points" int NOT NULL,
        "point_ledger_id" bigint,
        "policy_version" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_check_in_milestone_awards" PRIMARY KEY ("id"),
        -- Một mốc, một chuỗi, một lần. Khoá gồm cả run_id nên lập chuỗi mới thì
        -- nhận lại được.
        CONSTRAINT "UQ_check_in_milestone_awards_run_days"
          UNIQUE ("run_id", "milestone_days"),
        CONSTRAINT "FK_check_in_milestone_awards_run"
          FOREIGN KEY ("run_id") REFERENCES check_in_runs("id") ON DELETE CASCADE,
        CONSTRAINT "FK_check_in_milestone_awards_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_check_in_milestone_awards_entry"
          FOREIGN KEY ("entry_id") REFERENCES check_in_entries("id") ON DELETE CASCADE,
        CONSTRAINT "FK_check_in_milestone_awards_ledger"
          FOREIGN KEY ("point_ledger_id") REFERENCES point_ledger("id"),
        CONSTRAINT "CHK_check_in_milestone_awards_days" CHECK ("milestone_days" >= 1)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "repair_credit_cohorts" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "policy_version" int NOT NULL,
        "required_transactions" int NOT NULL,
        "current_count" int NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'OPEN',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "closed_at" timestamptz,
        CONSTRAINT "PK_repair_credit_cohorts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_repair_credit_cohorts_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_repair_credit_cohorts_policy"
          FOREIGN KEY ("policy_version") REFERENCES check_in_policy_revisions("version"),
        CONSTRAINT "CHK_repair_credit_cohorts_status"
          CHECK ("status" IN ('OPEN', 'CLOSED')),
        CONSTRAINT "CHK_repair_credit_cohorts_required"
          CHECK ("required_transactions" >= 1),
        CONSTRAINT "CHK_repair_credit_cohorts_count" CHECK ("current_count" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_repair_credit_cohorts_open_per_user"
      ON "repair_credit_cohorts" ("user_id") WHERE "status" = 'OPEN'
    `);

    await queryRunner.query(`
      CREATE TABLE "repair_transaction_progress" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "cohort_id" bigint NOT NULL,
        "role" varchar(16) NOT NULL,
        "policy_version" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repair_transaction_progress" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_repair_transaction_progress_user_tx"
          UNIQUE ("user_id", "transaction_id"),
        CONSTRAINT "FK_repair_transaction_progress_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_repair_transaction_progress_tx"
          FOREIGN KEY ("transaction_id") REFERENCES gift_transactions("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_repair_transaction_progress_cohort"
          FOREIGN KEY ("cohort_id") REFERENCES repair_credit_cohorts("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_repair_transaction_progress_role"
          CHECK ("role" IN ('GIVER', 'RECEIVER'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_repair_transaction_progress_cohort" ON "repair_transaction_progress" ("cohort_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "repair_credit_ledger" (
        "id" BIGSERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "event_type" varchar(16) NOT NULL,
        "delta" int NOT NULL,
        "balance_after" int NOT NULL,
        "reference_type" varchar(50) NOT NULL,
        "reference_id" varchar(200) NOT NULL,
        "idempotency_key" varchar(200) NOT NULL,
        "policy_version" int NOT NULL,
        "note" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repair_credit_ledger" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_repair_credit_ledger_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_repair_credit_ledger_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_repair_credit_ledger_event"
          CHECK ("event_type" IN ('ISSUE', 'SPEND', 'REVERSE')),
        CONSTRAINT "CHK_repair_credit_ledger_delta" CHECK ("delta" <> 0),
        CONSTRAINT "CHK_repair_credit_ledger_balance" CHECK ("balance_after" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_repair_credit_ledger_user" ON "repair_credit_ledger" ("user_id", "id" DESC)`,
    );

    for (const table of ['check_in_entries', 'repair_credit_ledger']) {
      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION ${table}_append_only() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION '${table} is append-only';
        END;
        $$ LANGUAGE plpgsql
      `);
      await queryRunner.query(`
        CREATE TRIGGER "TRG_${table}_append_only"
        BEFORE UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION ${table}_append_only()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Trigger gỡ TRƯỚC bảng: `DROP TABLE` xoá trigger nhưng để lại HÀM, và lần
    // `up` sau gặp `CREATE OR REPLACE` nên không nổ — chỉ còn hai hàm mồ côi
    // trong schema mà không ai biết từ đâu ra.
    for (const table of ['check_in_entries', 'repair_credit_ledger']) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "TRG_${table}_append_only" ON "${table}"`,
      );
      await queryRunner.query(`DROP FUNCTION IF EXISTS ${table}_append_only()`);
    }

    // Ngược chiều khoá ngoại.
    await queryRunner.query(`DROP TABLE IF EXISTS "repair_credit_ledger"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "repair_transaction_progress"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "repair_credit_cohorts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "check_in_milestone_awards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "check_in_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "check_in_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "check_in_policy_revisions"`);
  }
}
