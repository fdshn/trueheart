import { MigrationInterface, QueryRunner } from 'typeorm';

const ActiveStatuses = `'REGISTERED', 'CONFIRMED', 'WAITLISTED', 'CHECKED_IN', 'COMPLETED'`;

/** Mức điểm ảnh/clip chốt 05/11 — [rule, mức mới, mức cũ của 1802800000000]. */
const MediaPoints: readonly [string, number, number][] = [
  ['CHARITY_POST_VIDEO', 3, 2],
  ['CHARITY_POST_IMAGE', 2, 1],
];

const MultiplierKey = 'charity.post_points_participant_multiplier_percent';

/**
 * Dự án từ thiện — đợt 5a, quyết định Product 05/11 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §7.2).
 *
 * ## Một vòng đời participant chung trên `campaign_participations`
 *
 * Tham gia độc lập với đóng góp. Một hàng mỗi (dự án, người) như cũ, nay đủ trạng thái:
 * `REGISTERED` (đã đăng ký, CHỜ ban tổ chức duyệt) → `CONFIRMED` / `WAITLISTED` / `REJECTED`
 * → `CHECKED_IN` → `COMPLETED`, hoặc `NO_SHOW`; người dùng tự `CANCELLED`. Đăng ký vị trí tuyển
 * người tạo / hồi lượt tham gia; xác nhận vị trí là xác nhận lượt tham gia.
 *
 * Dữ liệu cũ: `REGISTERED` giữ nguyên — thành "chờ duyệt". Đăng ký vị trí còn hiệu lực mà chưa
 * có lượt tham gia thì được tạo lượt (`CONFIRMED` nếu vị trí đã xác nhận).
 *
 * ## Bỏ "cộng tác viên sự kiện"
 *
 * Quyền đăng ảnh/clip của participant theo check-in, nên `campaign_event_contributors` (đợt 3,
 * chưa lên môi trường nào) bị gỡ.
 *
 * ## Điểm ảnh/clip 3/2, không hệ số
 *
 * Đổi mức hai rule ảnh/clip khi rule chưa từng ghi sổ (rule đang TẮT); đã ghi sổ thì để Admin
 * chỉnh. Khoá hệ số cộng tác viên bị gỡ.
 */
export class CharityParticipantLifecycle1802900000000 implements MigrationInterface {
  name = 'CharityParticipantLifecycle1802900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_participations"
        DROP CONSTRAINT "CHK_campaign_participations_status",
        DROP CONSTRAINT "CHK_campaign_participations_cancelled_at",
        ADD COLUMN "status_changed_at" timestamptz,
        ADD COLUMN "status_changed_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        ADD COLUMN "status_reason" varchar(500),
        ADD COLUMN "checked_in_at" timestamptz,
        ADD COLUMN "checked_in_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        ADD CONSTRAINT "CHK_campaign_participations_status" CHECK ("status" IN
          ('REGISTERED', 'CONFIRMED', 'WAITLISTED', 'REJECTED', 'CHECKED_IN', 'COMPLETED',
           'NO_SHOW', 'CANCELLED')),
        ADD CONSTRAINT "CHK_campaign_participations_cancelled_at" CHECK (
          ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)),
        -- Đã check-in (kể cả đã hoàn thành) thì phải biết lúc nào.
        ADD CONSTRAINT "CHK_campaign_participations_checked_in" CHECK (
          "status" NOT IN ('CHECKED_IN', 'COMPLETED') OR "checked_in_at" IS NOT NULL)
    `);
    await queryRunner.query(
      `DROP INDEX "IDX_campaign_participations_campaign"`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_participations_campaign"
        ON "campaign_participations" ("campaign_id")
        WHERE "status" IN (${ActiveStatuses})
    `);

    // Đăng ký vị trí còn hiệu lực → có lượt tham gia.
    await queryRunner.query(`
      INSERT INTO campaign_participations (campaign_id, user_id, status, registered_at)
      SELECT need.campaign_id, registration.user_id,
             CASE WHEN bool_or(registration.status = 'CONFIRMED')
                  THEN 'CONFIRMED' ELSE 'REGISTERED' END,
             min(registration.created_at)
        FROM campaign_volunteer_registrations registration
        JOIN campaign_volunteer_needs need ON need.global_id = registration.volunteer_need_id
       WHERE registration.status <> 'CANCELLED'
       GROUP BY need.campaign_id, registration.user_id
      ON CONFLICT (campaign_id, user_id) DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE campaign_participations participation
         SET status = 'CONFIRMED', status_changed_at = now()
       WHERE participation.status = 'REGISTERED'
         AND EXISTS (SELECT 1 FROM campaign_volunteer_registrations registration
                     JOIN campaign_volunteer_needs need
                       ON need.global_id = registration.volunteer_need_id
                     WHERE need.campaign_id = participation.campaign_id
                       AND registration.user_id = participation.user_id
                       AND registration.status = 'CONFIRMED')
    `);

    await queryRunner.query(`DROP TABLE "campaign_event_contributors"`);

    for (const [code, points] of MediaPoints)
      await queryRunner.query(
        `UPDATE point_rules SET points = $2, updated_at = now()
          WHERE code = $1
            AND NOT EXISTS (SELECT 1 FROM point_ledger WHERE rule_code = $1)`,
        [code, points],
      );
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = $1`,
      [MultiplierKey],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "system_configs"
         ("config_key", "value_json", "value_type", "version", "status", "change_reason")
       VALUES ($1, '200'::jsonb, 'INTEGER', 1, 'PUBLISHED',
               'Hệ số (%) điểm ảnh/clip của cộng tác viên sự kiện so với mức cơ sở.')
       ON CONFLICT DO NOTHING`,
      [MultiplierKey],
    );
    for (const [code, , previous] of MediaPoints)
      await queryRunner.query(
        `UPDATE point_rules SET points = $2, updated_at = now()
          WHERE code = $1
            AND NOT EXISTS (SELECT 1 FROM point_ledger WHERE rule_code = $1)`,
        [code, previous],
      );

    await queryRunner.query(`
      CREATE TABLE "campaign_event_contributors" (
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "granted_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "revoked_at" timestamptz,
        PRIMARY KEY ("campaign_id", "user_id")
      )
    `);

    // Về hai trạng thái: còn hiệu lực → REGISTERED; từ chối / vắng mặt → CANCELLED.
    await queryRunner.query(`
      ALTER TABLE "campaign_participations"
        DROP CONSTRAINT "CHK_campaign_participations_checked_in",
        DROP CONSTRAINT "CHK_campaign_participations_status",
        DROP CONSTRAINT "CHK_campaign_participations_cancelled_at"
    `);
    await queryRunner.query(`
      UPDATE campaign_participations
         SET status = CASE WHEN status IN (${ActiveStatuses}) THEN 'REGISTERED' ELSE 'CANCELLED' END,
             cancelled_at = CASE WHEN status IN (${ActiveStatuses}) THEN NULL
                                 ELSE COALESCE(cancelled_at, status_changed_at, now()) END
       WHERE status NOT IN ('REGISTERED', 'CANCELLED')
    `);
    await queryRunner.query(
      `DROP INDEX "IDX_campaign_participations_campaign"`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_participations_campaign"
        ON "campaign_participations" ("campaign_id")
        WHERE "status" = 'REGISTERED'
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_participations"
        DROP COLUMN "checked_in_by",
        DROP COLUMN "checked_in_at",
        DROP COLUMN "status_reason",
        DROP COLUMN "status_changed_by",
        DROP COLUMN "status_changed_at",
        ADD CONSTRAINT "CHK_campaign_participations_status"
          CHECK ("status" IN ('REGISTERED', 'CANCELLED')),
        ADD CONSTRAINT "CHK_campaign_participations_cancelled_at" CHECK (
          ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
          OR ("status" = 'REGISTERED' AND "cancelled_at" IS NULL))
    `);
  }
}
