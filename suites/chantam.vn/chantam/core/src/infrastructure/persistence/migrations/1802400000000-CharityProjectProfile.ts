import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dự án từ thiện theo vòng đời 4 giai đoạn — đợt 1 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md
 * §3.1, §3.2, §3.11, §3.12; quyết định 04/11/2026 ở §7).
 *
 * ## `campaigns`: nháp và giai đoạn vận hành
 *
 * - `submitted_at` NULL = NHÁP: chỉ người tạo thấy, Admin không thấy trong hàng đợi duyệt.
 *   Không thêm `DRAFT` vào `approval_status` — "một cột một câu hỏi" (tài liệu đóng góp §8):
 *   `approval_status` trả lời "Admin đã quyết chưa", `submitted_at` trả lời "đã gửi chưa".
 *   Dữ liệu cũ: `submitted_at = created_at` (đã gửi từ lúc tạo).
 * - `operation_stage` PLAN → EXECUTION → EVENT → SUMMARY, tách khỏi `approval_status` và
 *   `is_active`. Cột lưu là bản ĐÃ GHI XUỐNG; lượt đọc tính lại theo thời gian khi job trễ.
 *   Dữ liệu cũ suy theo §5: chờ duyệt/từ chối → PLAN; đã duyệt, quá `end_time` → SUMMARY;
 *   đã duyệt, trong hạn → EXECUTION.
 * - `campaign_stage_events` append-only: mọi lần chuyển, kể cả do hệ thống (`actor_id` NULL).
 *
 * ## Gộp bên thụ hưởng (chốt §7.5)
 *
 * `campaign_parties` là nơi DUY NHẤT lưu các đơn vị liên quan, kể cả bên thụ hưởng. Người
 * thụ hưởng của kêu gọi cá nhân (trước ở `campaign_beneficiaries`, 1-1 với chiến dịch) là
 * dòng `role = BENEFICIARY AND is_appeal_subject` — unique một phần giữ đúng "một người".
 * Migration chép rồi XOÁ bảng cũ: để hai nơi cùng lưu một sự thật là để chúng lệch nhau.
 *
 * ## Tài khoản ngân hàng có phiên bản
 *
 * Đổi tài khoản = đóng bản cũ (`valid_to`) + tạo bản mới; không sửa số tài khoản tại chỗ, vì
 * người đã chuyển khoản theo số cũ phải tra lại được. Số tài khoản đang hiệu lực tối đa: khoá
 * `charity.max_bank_accounts_per_campaign` (mặc định 2), Admin ghi đè từng dự án qua
 * `campaigns.max_bank_accounts` (chốt §7.4).
 *
 * ## Ba nhóm nhu cầu
 *
 * Hiện vật dùng `campaign_need_items` (thêm cột đơn giá, tình trạng, nguồn cung, tiếp nhận).
 * Tiền: `campaign_funding_needs` — app KHÔNG giữ tiền, chỉ hồ sơ minh bạch; số đã nhận do ban
 * tổ chức ghi và đối soát. Nhân lực: `campaign_volunteer_needs` + đăng ký.
 *
 * ## Trạng thái từng mục và form mở
 *
 * `campaign_section_states`: lưu một mục không tự công khai; công khai chụp `published_snapshot`
 * và public chỉ đọc bản chụp đó. `campaign_custom_sections/fields`: form tuỳ biến có
 * visibility.
 */
export class CharityProjectProfile1802400000000 implements MigrationInterface {
  name = 'CharityProjectProfile1802400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── campaigns ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN "submitted_at" timestamptz,
        ADD COLUMN "operation_stage" varchar(10) NOT NULL DEFAULT 'PLAN',
        ADD COLUMN "appeal_purpose" text,
        ADD COLUMN "appeal_audience" text,
        ADD COLUMN "appeal_circumstance" text,
        ADD COLUMN "call_to_actions" text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "max_bank_accounts" integer,
        ADD CONSTRAINT "CHK_campaigns_operation_stage"
          CHECK ("operation_stage" IN ('PLAN', 'EXECUTION', 'EVENT', 'SUMMARY')),
        ADD CONSTRAINT "CHK_campaigns_call_to_actions"
          CHECK ("call_to_actions" <@ ARRAY['LIKE', 'SUPPORT_AND_DONATE', 'JOIN']::text[]),
        ADD CONSTRAINT "CHK_campaigns_appeal_lengths"
          CHECK (coalesce(length("appeal_purpose"), 0) <= 5000
             AND coalesce(length("appeal_audience"), 0) <= 5000
             AND coalesce(length("appeal_circumstance"), 0) <= 5000),
        ADD CONSTRAINT "CHK_campaigns_max_bank_accounts"
          CHECK ("max_bank_accounts" IS NULL OR "max_bank_accounts" BETWEEN 1 AND 20)
    `);
    await queryRunner.query(
      `UPDATE "campaigns" SET "submitted_at" = "created_at"`,
    );
    await queryRunner.query(`
      UPDATE "campaigns" SET "operation_stage" = CASE
        WHEN "approval_status" <> 'APPROVED' THEN 'PLAN'
        WHEN "end_time" <= now() THEN 'SUMMARY'
        ELSE 'EXECUTION'
      END
    `);
    // Ghi KIỂU CŨ (không nói gì về nháp) nghĩa là "gửi ngay lúc tạo" — đúng hành vi trước
    // đây. Lưu nháp phải ghi `submitted_at = NULL` tường minh.
    await queryRunner.query(
      `ALTER TABLE "campaigns" ALTER COLUMN "submitted_at" SET DEFAULT now()`,
    );
    // Đồng bộ giai đoạn theo quyết định duyệt cho MỌI đường ghi, kể cả đường chưa biết tới
    // cột này (seed, script, Admin sửa tay): đã duyệt mà còn PLAN → EXECUTION; chưa duyệt → PLAN.
    // Đường mới (duyệt, gửi duyệt) tự đặt giai đoạn và ghi nhật ký; trigger chỉ chặn trạng
    // thái vô nghĩa.
    await queryRunner.query(`
      CREATE FUNCTION campaigns_operation_stage_sync() RETURNS trigger AS $$
      BEGIN
        IF NEW.approval_status = 'APPROVED' AND NEW.operation_stage = 'PLAN' THEN
          NEW.operation_stage := 'EXECUTION';
        ELSIF NEW.approval_status <> 'APPROVED' THEN
          NEW.operation_stage := 'PLAN';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER campaigns_operation_stage_sync
      BEFORE INSERT OR UPDATE OF approval_status, operation_stage ON "campaigns"
      FOR EACH ROW EXECUTE FUNCTION campaigns_operation_stage_sync()
    `);
    // Hai ràng buộc chéo thêm SAU khi điền dữ liệu cũ.
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        -- Nháp chưa bao giờ được quyết: không có nháp nào "đã duyệt" hay "bị từ chối".
        ADD CONSTRAINT "CHK_campaigns_draft_undecided"
          CHECK ("submitted_at" IS NOT NULL OR "approval_status" = 'PENDING_APPROVAL'),
        -- Chưa duyệt thì còn ở Kế hoạch.
        ADD CONSTRAINT "CHK_campaigns_stage_needs_approval"
          CHECK ("approval_status" = 'APPROVED' OR "operation_stage" = 'PLAN')
    `);
    // Hàng đợi duyệt không chứa nháp.
    await queryRunner.query(`DROP INDEX "IDX_campaigns_pending"`);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_pending" ON "campaigns" ("created_at")
      WHERE "approval_status" = 'PENDING_APPROVAL' AND "submitted_at" IS NOT NULL
        AND "deleted_at" IS NULL
    `);
    // Job chuyển giai đoạn chỉ quét dự án còn có thể tiến.
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_stage_due" ON "campaigns" ("operation_stage")
      WHERE "operation_stage" IN ('EXECUTION', 'EVENT') AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_stage_events" (
        "id" BIGSERIAL PRIMARY KEY,
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "from_stage" varchar(10) NOT NULL,
        "to_stage" varchar(10) NOT NULL,
        "actor_id" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_campaign_stage_events_stages" CHECK (
          "from_stage" IN ('PLAN', 'EXECUTION', 'EVENT', 'SUMMARY')
          AND "to_stage" IN ('PLAN', 'EXECUTION', 'EVENT', 'SUMMARY')
          AND "from_stage" <> "to_stage")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_stage_events_campaign" ON "campaign_stage_events" ("campaign_id", "created_at")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION campaign_stage_events_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'campaign_stage_events is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER campaign_stage_events_append_only
      BEFORE UPDATE OR DELETE ON "campaign_stage_events"
      FOR EACH ROW EXECUTE FUNCTION campaign_stage_events_append_only()
    `);

    // ── Đơn vị liên quan (gộp bên thụ hưởng) ───────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_parties" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "role" varchar(12) NOT NULL,
        "name" varchar(200) NOT NULL,
        "address" varchar(500),
        "phone" varchar(30),
        "email" varchar(200),
        "hotline" varchar(30),
        "pic_name" varchar(200),
        "pic_phone" varchar(30),
        "pic_user_id" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "beneficiary_kind" varchar(10),
        "is_appeal_subject" boolean NOT NULL DEFAULT false,
        "relation_note" varchar(200),
        "consent_status" varchar(20),
        "verification_note" varchar(1000),
        "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_parties_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_parties_role"
          CHECK ("role" IN ('ORGANIZER', 'BENEFICIARY', 'LICENSING', 'MEDIA')),
        CONSTRAINT "CHK_campaign_parties_name" CHECK (length(btrim("name")) > 0),
        CONSTRAINT "CHK_campaign_parties_beneficiary_kind" CHECK (
          ("role" = 'BENEFICIARY') = ("beneficiary_kind" IS NOT NULL)
          AND ("beneficiary_kind" IS NULL OR "beneficiary_kind" IN ('INDIVIDUAL', 'GROUP'))),
        CONSTRAINT "CHK_campaign_parties_appeal_subject" CHECK (
          NOT "is_appeal_subject"
          OR ("role" = 'BENEFICIARY' AND "consent_status" IS NOT NULL AND "relation_note" IS NOT NULL)),
        CONSTRAINT "CHK_campaign_parties_consent"
          CHECK ("consent_status" IS NULL OR "consent_status" IN ('PENDING', 'CONFIRMED')),
        CONSTRAINT "CHK_campaign_parties_evidence"
          CHECK (jsonb_typeof("evidence_urls") = 'array' AND jsonb_array_length("evidence_urls") <= 10)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_parties_campaign" ON "campaign_parties" ("campaign_id", "role", "sort_order")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_campaign_parties_appeal_subject"
        ON "campaign_parties" ("campaign_id") WHERE "is_appeal_subject"
    `);
    await queryRunner.query(`
      INSERT INTO "campaign_parties"
        ("campaign_id", "role", "name", "address", "phone", "beneficiary_kind",
         "is_appeal_subject", "relation_note", "consent_status", "verification_note",
         "updated_by", "created_at", "updated_at")
      SELECT "campaign_id", 'BENEFICIARY', "full_name", "address", "phone", 'INDIVIDUAL',
             true, "relation_note", "consent_status", "verification_note",
             "updated_by", "created_at", "updated_at"
      FROM "campaign_beneficiaries"
    `);
    await queryRunner.query(`DROP TABLE "campaign_beneficiaries"`);

    // ── Tài khoản ngân hàng có phiên bản ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_bank_accounts" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "label" varchar(200),
        "bank_name" varchar(200) NOT NULL,
        "account_no" varchar(40) NOT NULL,
        "account_name" varchar(200) NOT NULL,
        "valid_from" timestamptz NOT NULL DEFAULT now(),
        "valid_to" timestamptz,
        "close_reason" varchar(500),
        "created_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "closed_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        CONSTRAINT "UQ_campaign_bank_accounts_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_bank_accounts_account_no" CHECK ("account_no" ~ '^[0-9A-Za-z-]{4,40}$'),
        CONSTRAINT "CHK_campaign_bank_accounts_window"
          CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
        CONSTRAINT "CHK_campaign_bank_accounts_close"
          CHECK (("valid_to" IS NULL) = ("close_reason" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_bank_accounts_live"
        ON "campaign_bank_accounts" ("campaign_id") WHERE "valid_to" IS NULL
    `);

    // ── Ban tổ chức 6 vai trò ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_team_members" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "role" varchar(20) NOT NULL,
        "display_name" varchar(200) NOT NULL,
        "address" varchar(500),
        "phone" varchar(30),
        "email" varchar(200),
        "position" varchar(200),
        "user_id" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "bank_account_id" uuid REFERENCES "campaign_bank_accounts"("global_id") ON DELETE SET NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_team_members_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_team_members_role" CHECK ("role" IN (
          'GENERAL_LEAD', 'LIAISON_MEDIA', 'INTAKE_LOGISTICS', 'FINANCE',
          'ADVANCE_TRANSPORT', 'REPORTING')),
        CONSTRAINT "CHK_campaign_team_members_name" CHECK (length(btrim("display_name")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_team_members_campaign" ON "campaign_team_members" ("campaign_id", "role", "sort_order")`,
    );

    // ── Tiến độ 4 bước ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_phases" (
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "phase" varchar(15) NOT NULL,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "pic_name" varchar(200),
        "pic_user_id" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "hotline" varchar(30),
        "delivery_method" varchar(10),
        "report_mode" varchar(10),
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_phases" PRIMARY KEY ("campaign_id", "phase"),
        CONSTRAINT "CHK_campaign_phases_phase"
          CHECK ("phase" IN ('PLANNING', 'PREPARATION', 'DISTRIBUTION', 'REPORTING')),
        CONSTRAINT "CHK_campaign_phases_window" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "CHK_campaign_phases_delivery_method" CHECK (
          ("delivery_method" IS NULL OR "phase" = 'DISTRIBUTION')
          AND ("delivery_method" IS NULL OR "delivery_method" IN ('ON_SITE', 'SHIP', 'TRANSFER'))),
        CONSTRAINT "CHK_campaign_phases_report_mode" CHECK (
          ("report_mode" IS NULL OR "phase" = 'REPORTING')
          AND ("report_mode" IS NULL OR "report_mode" IN ('ONLINE', 'OFFLINE')))
      )
    `);

    // ── Hạng mục hiện vật ─────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "campaign_need_items"
        ADD COLUMN "unit_price" bigint,
        ADD COLUMN "estimated_value" bigint,
        ADD COLUMN "item_condition" varchar(10),
        ADD COLUMN "condition_note" varchar(500),
        ADD COLUMN "supply_source" varchar(10),
        ADD COLUMN "intake_deadline" timestamptz,
        ADD COLUMN "dropoff_address" varchar(500),
        ADD COLUMN "delivery_instruction" varchar(1000),
        ADD COLUMN "receiver_name" varchar(200),
        ADD COLUMN "receiver_phone" varchar(30),
        ADD COLUMN "intake_status" varchar(10) NOT NULL DEFAULT 'OPEN',
        ADD COLUMN "surplus_explanation" varchar(2000),
        ADD CONSTRAINT "CHK_campaign_need_items_money"
          CHECK ((unit_price IS NULL OR unit_price >= 0) AND (estimated_value IS NULL OR estimated_value >= 0)),
        ADD CONSTRAINT "CHK_campaign_need_items_condition"
          CHECK ("item_condition" IS NULL OR "item_condition" IN ('NEW', 'USED', 'ANY', 'OTHER')),
        ADD CONSTRAINT "CHK_campaign_need_items_supply"
          CHECK ("supply_source" IS NULL OR "supply_source" IN ('PURCHASE', 'DONATION', 'MIXED')),
        ADD CONSTRAINT "CHK_campaign_need_items_intake_status"
          CHECK ("intake_status" IN ('OPEN', 'CLOSED'))
    `);

    // ── Nhu cầu tiền ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_funding_needs" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "title" varchar(200) NOT NULL,
        "description" varchar(2000),
        "beneficiary_party_id" uuid REFERENCES "campaign_parties"("global_id") ON DELETE SET NULL,
        "receiving_unit" varchar(200),
        "bank_account_id" uuid REFERENCES "campaign_bank_accounts"("global_id") ON DELETE SET NULL,
        "target_amount" bigint NOT NULL,
        "confirmed_amount" bigint NOT NULL DEFAULT 0,
        "external_amount" bigint NOT NULL DEFAULT 0,
        "deadline" timestamptz,
        "status" varchar(10) NOT NULL DEFAULT 'OPEN',
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_funding_needs_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_funding_needs_amounts" CHECK (
          "target_amount" > 0 AND "confirmed_amount" >= 0 AND "external_amount" >= 0),
        CONSTRAINT "CHK_campaign_funding_needs_status" CHECK ("status" IN ('OPEN', 'CLOSED')),
        CONSTRAINT "CHK_campaign_funding_needs_title" CHECK (length(btrim("title")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_funding_needs_campaign" ON "campaign_funding_needs" ("campaign_id", "sort_order")`,
    );

    // ── Tuyển người ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_volunteer_needs" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "title" varchar(200) NOT NULL,
        "description" varchar(2000),
        "requirements" varchar(2000),
        "needed_count" integer NOT NULL,
        "starts_at" timestamptz,
        "ends_at" timestamptz,
        "location_label" varchar(500),
        "status" varchar(10) NOT NULL DEFAULT 'OPEN',
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_volunteer_needs_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_volunteer_needs_count" CHECK ("needed_count" BETWEEN 1 AND 100000),
        CONSTRAINT "CHK_campaign_volunteer_needs_status" CHECK ("status" IN ('OPEN', 'CLOSED', 'STARTED')),
        CONSTRAINT "CHK_campaign_volunteer_needs_window"
          CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"),
        CONSTRAINT "CHK_campaign_volunteer_needs_title" CHECK (length(btrim("title")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_volunteer_needs_campaign" ON "campaign_volunteer_needs" ("campaign_id", "sort_order")`,
    );
    await queryRunner.query(`
      CREATE TABLE "campaign_volunteer_registrations" (
        "id" BIGSERIAL PRIMARY KEY,
        "volunteer_need_id" uuid NOT NULL REFERENCES "campaign_volunteer_needs"("global_id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "status" varchar(10) NOT NULL DEFAULT 'REGISTERED',
        "note" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "confirmed_at" timestamptz,
        "confirmed_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "cancelled_at" timestamptz,
        CONSTRAINT "CHK_campaign_volunteer_registrations_status"
          CHECK ("status" IN ('REGISTERED', 'CONFIRMED', 'CANCELLED')),
        CONSTRAINT "CHK_campaign_volunteer_registrations_confirm"
          CHECK (("status" = 'CONFIRMED') = ("confirmed_at" IS NOT NULL)),
        CONSTRAINT "CHK_campaign_volunteer_registrations_cancel"
          CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
      )
    `);
    // Một đăng ký đang sống cho mỗi (vị trí, người); huỷ rồi đăng ký lại là dòng mới.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_campaign_volunteer_registrations_live"
        ON "campaign_volunteer_registrations" ("volunteer_need_id", "user_id")
      WHERE "status" <> 'CANCELLED'
    `);

    // ── Trạng thái từng mục + form mở ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaign_section_states" (
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "section_key" varchar(10) NOT NULL,
        "saved_at" timestamptz,
        "published_at" timestamptz,
        "published_snapshot" jsonb,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        CONSTRAINT "PK_campaign_section_states" PRIMARY KEY ("campaign_id", "section_key"),
        CONSTRAINT "CHK_campaign_section_states_key"
          CHECK ("section_key" IN ('PLAN', 'EXECUTION', 'EVENT', 'SUMMARY')),
        CONSTRAINT "CHK_campaign_section_states_published"
          CHECK (("published_at" IS NULL) = ("published_snapshot" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "campaign_custom_sections" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "parent_section" varchar(10) NOT NULL,
        "title" varchar(200) NOT NULL,
        "visibility" varchar(15) NOT NULL DEFAULT 'PUBLIC',
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_custom_sections_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_custom_sections_parent"
          CHECK ("parent_section" IN ('PLAN', 'EXECUTION', 'EVENT', 'SUMMARY')),
        CONSTRAINT "CHK_campaign_custom_sections_visibility"
          CHECK ("visibility" IN ('PUBLIC', 'PARTICIPANT', 'ORGANIZER_ONLY', 'ADMIN_ONLY')),
        CONSTRAINT "CHK_campaign_custom_sections_title" CHECK (length(btrim("title")) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "campaign_custom_fields" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "custom_section_id" uuid NOT NULL REFERENCES "campaign_custom_sections"("global_id") ON DELETE CASCADE,
        "label" varchar(200) NOT NULL,
        "field_type" varchar(10) NOT NULL,
        "visibility" varchar(15) NOT NULL DEFAULT 'PUBLIC',
        "required" boolean NOT NULL DEFAULT false,
        "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "value" jsonb,
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_custom_fields_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_custom_fields_type" CHECK ("field_type" IN (
          'TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'FILE', 'URL')),
        CONSTRAINT "CHK_campaign_custom_fields_visibility"
          CHECK ("visibility" IN ('PUBLIC', 'PARTICIPANT', 'ORGANIZER_ONLY', 'ADMIN_ONLY')),
        CONSTRAINT "CHK_campaign_custom_fields_options" CHECK (jsonb_typeof("options") = 'array'),
        CONSTRAINT "CHK_campaign_custom_fields_label" CHECK (length(btrim("label")) > 0)
      )
    `);

    // ── Cấu hình ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES ('charity.max_bank_accounts_per_campaign', '2', 'INTEGER', 1, 'PUBLISHED',
              'Số tài khoản nhận tiền đang hiệu lực tối đa của một dự án từ thiện; Admin ghi đè từng dự án.')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = 'charity.max_bank_accounts_per_campaign'`,
    );
    await queryRunner.query(`DROP TABLE "campaign_custom_fields"`);
    await queryRunner.query(`DROP TABLE "campaign_custom_sections"`);
    await queryRunner.query(`DROP TABLE "campaign_section_states"`);
    await queryRunner.query(`DROP TABLE "campaign_volunteer_registrations"`);
    await queryRunner.query(`DROP TABLE "campaign_volunteer_needs"`);
    await queryRunner.query(`DROP TABLE "campaign_funding_needs"`);
    await queryRunner.query(`
      ALTER TABLE "campaign_need_items"
        DROP CONSTRAINT "CHK_campaign_need_items_intake_status",
        DROP CONSTRAINT "CHK_campaign_need_items_supply",
        DROP CONSTRAINT "CHK_campaign_need_items_condition",
        DROP CONSTRAINT "CHK_campaign_need_items_money",
        DROP COLUMN "surplus_explanation", DROP COLUMN "intake_status",
        DROP COLUMN "receiver_phone", DROP COLUMN "receiver_name",
        DROP COLUMN "delivery_instruction", DROP COLUMN "dropoff_address",
        DROP COLUMN "intake_deadline", DROP COLUMN "supply_source",
        DROP COLUMN "condition_note", DROP COLUMN "item_condition",
        DROP COLUMN "estimated_value", DROP COLUMN "unit_price"
    `);
    await queryRunner.query(`DROP TABLE "campaign_phases"`);
    await queryRunner.query(`DROP TABLE "campaign_team_members"`);
    await queryRunner.query(`DROP TABLE "campaign_bank_accounts"`);

    // Dựng lại bảng người thụ hưởng cũ và chép NGƯỢC dòng `is_appeal_subject`.
    await queryRunner.query(`
      CREATE TABLE "campaign_beneficiaries" (
        "campaign_id" uuid NOT NULL,
        "full_name" varchar(200) NOT NULL,
        "relation_note" varchar(200) NOT NULL,
        "phone" varchar(30),
        "address" varchar(500),
        "consent_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "verification_note" varchar(1000),
        "updated_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_beneficiaries" PRIMARY KEY ("campaign_id"),
        CONSTRAINT "CHK_campaign_beneficiaries_consent" CHECK ("consent_status" IN ('PENDING', 'CONFIRMED')),
        CONSTRAINT "FK_campaign_beneficiaries_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_beneficiaries_updater" FOREIGN KEY ("updated_by")
          REFERENCES "users"("global_id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      INSERT INTO "campaign_beneficiaries"
        ("campaign_id", "full_name", "relation_note", "phone", "address", "consent_status",
         "verification_note", "updated_by", "created_at", "updated_at")
      SELECT "campaign_id", left("name", 200), "relation_note", "phone", "address",
             "consent_status", "verification_note", "updated_by", "created_at", "updated_at"
      FROM "campaign_parties" WHERE "is_appeal_subject" AND "updated_by" IS NOT NULL
    `);
    await queryRunner.query(`DROP TABLE "campaign_parties"`);

    await queryRunner.query(`DROP TABLE "campaign_stage_events"`);
    await queryRunner.query(
      `DROP FUNCTION campaign_stage_events_append_only()`,
    );
    await queryRunner.query(`DROP INDEX "IDX_campaigns_stage_due"`);
    await queryRunner.query(`DROP INDEX "IDX_campaigns_pending"`);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_pending" ON "campaigns" ("created_at")
      WHERE "approval_status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS campaigns_operation_stage_sync ON "campaigns"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS campaigns_operation_stage_sync()`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT "CHK_campaigns_stage_needs_approval",
        DROP CONSTRAINT "CHK_campaigns_draft_undecided",
        DROP CONSTRAINT "CHK_campaigns_max_bank_accounts",
        DROP CONSTRAINT "CHK_campaigns_appeal_lengths",
        DROP CONSTRAINT "CHK_campaigns_call_to_actions",
        DROP CONSTRAINT "CHK_campaigns_operation_stage",
        DROP COLUMN "max_bank_accounts", DROP COLUMN "call_to_actions",
        DROP COLUMN "appeal_circumstance", DROP COLUMN "appeal_audience",
        DROP COLUMN "appeal_purpose", DROP COLUMN "operation_stage",
        DROP COLUMN "submitted_at"
    `);
  }
}
