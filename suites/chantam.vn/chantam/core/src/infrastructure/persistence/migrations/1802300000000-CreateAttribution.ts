import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deferred attribution — link giới thiệu sống sót qua bước cài app (yêu cầu 01/11/2026).
 *
 * Năm bảng, đi theo đúng bốn bước của luồng cộng một bảng audit:
 *
 * - `attribution_links` — một link người giới thiệu phát ra (`…/a/{code}`). Một link được
 *   MỞ nhiều lần (gửi vào nhóm Zalo), nên token không sinh ở đây.
 * - `attribution_clicks` — mỗi lượt mở link là một token riêng (`token_jti`). Nhờ vậy "một
 *   token chỉ claim cho một tài khoản" không làm mất người thứ hai mở cùng link.
 * - `attribution_resolutions` — app mới cài dán token: một dòng cho mỗi (lượt mở, bản cài),
 *   giữ claim token một lần dùng. Unique trên cặp đó = resolve idempotent.
 * - `attribution_claims` — gắn người giới thiệu. Unique trên lượt mở, claim token và người
 *   được mời: một lượt mở không claim được cho hai tài khoản, một tài khoản không có hai
 *   người giới thiệu qua đường này.
 * - `attribution_audit_events` — mọi kết cục (kể cả bị từ chối) kèm mã nghiệp vụ.
 *
 * ## Không lưu gì dạng thô có thể định danh
 *
 * `installId`, IP và User-Agent chỉ lưu dạng HMAC (`hashSignupFingerprint`), chỉ để so trùng
 * khi xét gian lận. Không cột nào trong đây dùng làm khoá attribution — khoá là token.
 *
 * ## Claim KHÔNG phát thưởng
 *
 * Claim qua kiểm rủi ro thì ghi một dòng `referrals` — rồi đường thưởng giới thiệu sẵn có chỉ
 * trả khi người được mời hoàn tất onboarding. `CHK_attribution_claims_referral` buộc: claim
 * `QUALIFIED` có dòng `referrals`, claim chờ duyệt hoặc bị từ chối thì không.
 */
export class CreateAttribution1802300000000 implements MigrationInterface {
  name = 'CreateAttribution1802300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attribution_links" (
        "id" BIGSERIAL PRIMARY KEY,
        "code" varchar(16) NOT NULL,
        "referrer_id" uuid NOT NULL REFERENCES "users"("global_id"),
        "target_type" varchar(16),
        "target_value" varchar(64),
        "campaign" varchar(64),
        "source" varchar(64),
        "medium" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz,
        "revoked_by" uuid REFERENCES "users"("global_id"),
        "revoke_reason" varchar(500),
        CONSTRAINT "UQ_attribution_links_code" UNIQUE ("code"),
        CONSTRAINT "CHK_attribution_links_target_type"
          CHECK ("target_type" IN ('POST', 'PROFILE', 'USER', 'GROUP_INVITE')),
        CONSTRAINT "CHK_attribution_links_target_pair"
          CHECK (("target_type" IS NULL) = ("target_value" IS NULL)),
        CONSTRAINT "CHK_attribution_links_revoke"
          CHECK (("revoked_at" IS NULL) = ("revoke_reason" IS NULL))
      )
    `);
    // Tạo lại đúng link đang sống thì trả link cũ — không đẻ hàng nghìn link giống nhau
    // cho mỗi lần bấm "Chia sẻ".
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_attribution_links_live"
        ON "attribution_links" (
          "referrer_id", COALESCE("target_type", ''), COALESCE("target_value", ''),
          COALESCE("campaign", ''), COALESCE("source", ''), COALESCE("medium", '')
        )
      WHERE "revoked_at" IS NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_attribution_links_campaign" ON "attribution_links" ("campaign") WHERE "campaign" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "attribution_clicks" (
        "global_id" uuid PRIMARY KEY,
        "link_id" bigint NOT NULL REFERENCES "attribution_links"("id"),
        "token_jti" uuid NOT NULL,
        "issued_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "ip_hash" varchar(64),
        "user_agent_hash" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_attribution_clicks_token_jti" UNIQUE ("token_jti"),
        CONSTRAINT "CHK_attribution_clicks_window" CHECK ("expires_at" > "issued_at")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_attribution_clicks_link" ON "attribution_clicks" ("link_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "attribution_resolutions" (
        "id" BIGSERIAL PRIMARY KEY,
        "click_id" uuid NOT NULL REFERENCES "attribution_clicks"("global_id"),
        "install_id_hash" varchar(64) NOT NULL,
        "platform" varchar(8) NOT NULL,
        "claim_jti" uuid NOT NULL,
        "claim_expires_at" timestamptz NOT NULL,
        "ip_hash" varchar(64),
        "resolved_at" timestamptz NOT NULL DEFAULT now(),
        "last_resolved_at" timestamptz NOT NULL DEFAULT now(),
        "resolve_count" integer NOT NULL DEFAULT 1,
        CONSTRAINT "UQ_attribution_resolutions_click_install" UNIQUE ("click_id", "install_id_hash"),
        CONSTRAINT "UQ_attribution_resolutions_claim_jti" UNIQUE ("claim_jti"),
        CONSTRAINT "CHK_attribution_resolutions_platform" CHECK ("platform" IN ('IOS', 'ANDROID'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_attribution_resolutions_install" ON "attribution_resolutions" ("install_id_hash")`,
    );

    await queryRunner.query(`
      CREATE TABLE "attribution_claims" (
        "global_id" uuid PRIMARY KEY,
        "click_id" uuid NOT NULL REFERENCES "attribution_clicks"("global_id"),
        "resolution_id" bigint NOT NULL REFERENCES "attribution_resolutions"("id"),
        "claim_jti" uuid NOT NULL,
        "referrer_id" uuid NOT NULL REFERENCES "users"("global_id"),
        "referred_user_id" uuid NOT NULL REFERENCES "users"("global_id"),
        "referral_id" bigint REFERENCES "referrals"("id"),
        "risk_status" varchar(16) NOT NULL,
        "risk_reason" varchar(64),
        "ip_hash" varchar(64),
        "claimed_at" timestamptz NOT NULL DEFAULT now(),
        "reviewed_at" timestamptz,
        "reviewed_by" uuid REFERENCES "users"("global_id"),
        "review_note" varchar(500),
        CONSTRAINT "UQ_attribution_claims_click" UNIQUE ("click_id"),
        CONSTRAINT "UQ_attribution_claims_claim_jti" UNIQUE ("claim_jti"),
        CONSTRAINT "UQ_attribution_claims_referred_user" UNIQUE ("referred_user_id"),
        CONSTRAINT "CHK_attribution_claims_not_self" CHECK ("referrer_id" <> "referred_user_id"),
        CONSTRAINT "CHK_attribution_claims_risk_status"
          CHECK ("risk_status" IN ('QUALIFIED', 'PENDING_REVIEW', 'REJECTED')),
        CONSTRAINT "CHK_attribution_claims_referral"
          CHECK (("risk_status" = 'QUALIFIED') = ("referral_id" IS NOT NULL)),
        CONSTRAINT "CHK_attribution_claims_review"
          CHECK (("reviewed_at" IS NULL) = ("reviewed_by" IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_attribution_claims_risk" ON "attribution_claims" ("risk_status", "claimed_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "attribution_audit_events" (
        "id" BIGSERIAL PRIMARY KEY,
        "event" varchar(16) NOT NULL,
        "outcome" varchar(48) NOT NULL,
        "click_id" uuid,
        "user_id" uuid,
        "install_id_hash" varchar(64),
        "ip_hash" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_attribution_audit_events_event"
          CHECK ("event" IN ('LINK', 'CLICK', 'RESOLVE', 'CLAIM', 'REVIEW', 'REVOKE'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_attribution_audit_events_created" ON "attribution_audit_events" ("created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "attribution_audit_events"`);
    await queryRunner.query(`DROP TABLE "attribution_claims"`);
    await queryRunner.query(`DROP TABLE "attribution_resolutions"`);
    await queryRunner.query(`DROP TABLE "attribution_clicks"`);
    await queryRunner.query(`DROP TABLE "attribution_links"`);
  }
}
