import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nền cho phân hệ **đóng góp vật phẩm từ thiện** (F65b, lát A).
 *
 * Thiết kế đã chốt ở `docs/plan/CHARITY-CONTRIBUTION-DESIGN.md`; migration này dựng
 * bốn thứ của lát A và không nhiều hơn.
 *
 * ## 1. `campaign_type` — và vì sao mặc định là `ORGANIZED_CAMPAIGN`
 *
 * §10 nói dữ liệu cũ backfill `ORGANIZED_CAMPAIGN`. Đó không phải lựa chọn tuỳ ý:
 * tới nay chỉ Kim Cương tạo được hoạt động (`SUBMIT_CHARITY_PROPOSAL`), tức mọi hàng
 * đang có đều là hoạt động có tổ chức. Đặt `DEFAULT` thay vì một câu `UPDATE` riêng
 * vì `DEFAULT` lo luôn cả những hàng được chèn giữa lúc deploy.
 *
 * ## 2. `beneficiary_relation` — ràng buộc có điều kiện, không phải NOT NULL
 *
 * §2: `INDIVIDUAL_APPEAL` **phải** khai `SELF | OTHER`. `ORGANIZED_CAMPAIGN` thì
 * không có người thụ hưởng đơn lẻ nào để khai quan hệ với. Nên ràng buộc là một
 * `CHECK` nối hai cột, không phải `NOT NULL` — `NOT NULL` sẽ buộc mọi hoạt động có
 * tổ chức bịa ra một quan hệ.
 *
 * ## 3. `campaign_need_items` — nguồn sự thật THEO TỪNG DÒNG
 *
 * §1 nói thẳng: không dùng `target_items_count`/`current_items_count` tổng hợp làm
 * nguồn sự thật cho luồng này. Hai cột đó là LỜI KHAI của người tổ chức
 * (BR-CHARITY-02) và cộng `kg + cái + hộp` thành một tổng là một con số không có
 * nghĩa — nên mỗi dòng nhu cầu giữ `unit` riêng và không bao giờ bị cộng chéo.
 *
 * `accepted_quantity` và `received_quantity` là **projection**: hệ thống ghi, không
 * ai gõ. Chúng ở đây chứ không tính bằng `SUM` mỗi lượt đọc vì bảng nhu cầu nằm trên
 * đường đọc công khai; nhưng đúng vì thế mà mọi lượt ghi vào chúng phải nằm trong
 * transaction của việc làm chúng đổi (lát C). `pending_quantity` thì KHÔNG có cột —
 * §3 nói nó không giữ chỗ, nên lưu sẵn một con số không ai được dựa vào là mời người
 * sau dựa vào nó.
 *
 * Không xoá cứng dòng đã có đề nghị (§3), nên có `is_active` thay vì `DELETE`.
 *
 * ## 4. Hai capability mới, và một cái đã có
 *
 * §2 đòi ba capability. `SUBMIT_CHARITY_PROPOSAL` đã có từ
 * `CreateEntitlementPolicies` (Kim Cương-only, đúng baseline đặc tả muốn), nên chỉ
 * thêm hai cái còn lại vào **bản policy đang hiệu lực** — cùng lối
 * `SeedDiscoveryRadiusEntitlement`, không mở bản revision mới cho một lượt thêm
 * baseline.
 *
 * ## 5. Point Rule seed TẮT
 *
 * `CHARITY_CONTRIBUTION_COMPLETED` với `is_enabled = false`, đúng lối F83 và F56:
 * mức điểm là con số Bên A chốt, và một con số bịa sẵn ở trạng thái bật sẽ phát
 * điểm thật trước khi ai kịp duyệt.
 *
 * **`points = 10` là SỐ GIỮ CHỖ, không phải mức đã chốt.** Phiên bản đầu ghi `0` và
 * làm vỡ cả chuỗi migration: `CHK_point_rules_points` là `points <> 0` từ
 * `AddNegativePointsAndShipping`. Kiểm trên schema tối giản dựng tay thì không thấy,
 * vì bảng dựng tay không có CHECK đó — chỉ chạy chuỗi migration thật mới thấy. Cùng
 * tiền lệ `REPORT_UPHELD` seed `5` ở trạng thái tắt. Trước khi bật, Admin PHẢI sửa
 * con số này theo mức Bên A chốt. `daily_cap = NULL` vì đóng góp từ thiện không
 * phải việc cần làm chậm; `affects_lifetime = false` vì `lifetime` là sàn của Rank
 * và không nên có đường đẩy hạng bằng một luồng chưa chốt mức.
 */
export class CreateCharityNeedItems1799800000000 implements MigrationInterface {
  name = 'CreateCharityNeedItems1799800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "campaign_type" varchar(20) NOT NULL
          DEFAULT 'ORGANIZED_CAMPAIGN',
        ADD COLUMN IF NOT EXISTS "beneficiary_relation" varchar(10)
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_campaign_type",
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_beneficiary_relation"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "CHK_campaigns_campaign_type"
          CHECK ("campaign_type" IN ('INDIVIDUAL_APPEAL', 'ORGANIZED_CAMPAIGN')),
        -- Kêu gọi cho cá nhân PHẢI khai quan hệ với người thụ hưởng; hoạt động có
        -- tổ chức thì không có ai đơn lẻ để khai quan hệ với.
        ADD CONSTRAINT "CHK_campaigns_beneficiary_relation"
          CHECK (
            CASE "campaign_type"
              WHEN 'INDIVIDUAL_APPEAL' THEN
                -- IS NOT NULL phải đứng riêng. Thiếu nó thì với cột NULL biểu thức
                -- ra NULL, và CHECK chỉ từ chối khi biểu thức là FALSE — nên ràng
                -- buộc "phải khai quan hệ" sẽ im lặng cho qua đúng cái nó chặn.
                -- Bắt được lúc chạy thật trên Postgres; phiên bản đầu của migration
                -- này nhận một INDIVIDUAL_APPEAL không có quan hệ.
                "beneficiary_relation" IS NOT NULL
                AND "beneficiary_relation" IN ('SELF', 'OTHER')
              ELSE "beneficiary_relation" IS NULL
            END
          )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_need_items" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "category_id" uuid,
        "item_name" varchar(200) NOT NULL,
        "description" text,
        "unit" varchar(30) NOT NULL,
        "target_quantity" int NOT NULL,
        "allow_alternative" boolean NOT NULL DEFAULT false,
        -- Projection do HỆ THỐNG ghi trong transaction của việc làm chúng đổi.
        -- Không endpoint nào nhận hai con số này từ client.
        "accepted_quantity" int NOT NULL DEFAULT 0,
        "received_quantity" int NOT NULL DEFAULT 0,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_need_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_need_items_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_campaign_need_items_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id")
          ON DELETE CASCADE,
        -- Danh mục là tuỳ chọn và KHÔNG chặn xoá danh mục: một dòng nhu cầu mất
        -- danh mục vẫn còn item_name và unit, tức vẫn đọc được.
        CONSTRAINT "FK_campaign_need_items_category"
          FOREIGN KEY ("category_id") REFERENCES "categories"("global_id")
          ON DELETE SET NULL,
        CONSTRAINT "CHK_campaign_need_items_target"
          CHECK ("target_quantity" > 0 AND "target_quantity" <= 1000000),
        CONSTRAINT "CHK_campaign_need_items_projections"
          CHECK ("accepted_quantity" >= 0 AND "received_quantity" >= 0),
        -- Cùng một vật phẩm cùng đơn vị khai hai dòng thì tiến độ chia đôi và không
        -- ai hiểu dòng nào là dòng thật.
        CONSTRAINT "UQ_campaign_need_items_name_unit"
          UNIQUE ("campaign_id", "item_name", "unit")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_need_items_campaign"
      ON "campaign_need_items" ("campaign_id", "sort_order", "id")
    `);

    // ── Hai capability còn thiếu, vào bản policy ĐANG hiệu lực ───────────────
    await queryRunner.query(`
      WITH active_revision AS (
        SELECT id
        FROM config_revisions
        WHERE scope = 'ENTITLEMENT'
          AND status = 'PUBLISHED'
          AND effective_from <= now()
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY effective_from DESC
        LIMIT 1
      )
      INSERT INTO capability_policies (revision_id, code, enabled)
      SELECT active_revision.id, capability.code, true
      FROM active_revision
      CROSS JOIN (VALUES
        ('SUBMIT_INDIVIDUAL_APPEAL'),
        ('PUBLISH_CHARITY_WITHOUT_REVIEW')
      ) AS capability(code)
      ON CONFLICT (revision_id, code) DO NOTHING
    `);

    // Kêu gọi cho cá nhân: Thành viên trở lên. Người chưa xác thực (VIEWER) thì
    // không — một kêu gọi quyên góp đứng tên một tài khoản không ai xác thực là
    // đường lừa đảo rẻ nhất trong cả hệ thống.
    await queryRunner.query(`
      INSERT INTO capability_rank_values (policy_id, "rank", allowed, limit_value)
      SELECT policy.id, baseline."rank"::users_rank_enum, baseline.allowed, NULL
      FROM capability_policies policy
      INNER JOIN config_revisions revision ON revision.id = policy.revision_id
      CROSS JOIN (VALUES
        ('VIEWER', false),
        ('MEMBER', true),
        ('SILVER', true),
        ('GOLD', true),
        ('DIAMOND', true)
      ) AS baseline("rank", allowed)
      WHERE policy.code = 'SUBMIT_INDIVIDUAL_APPEAL'
        AND revision.scope = 'ENTITLEMENT'
        AND revision.status = 'PUBLISHED'
        AND revision.effective_from <= now()
        AND (revision.effective_to IS NULL OR revision.effective_to > now())
        AND NOT EXISTS (
          SELECT 1 FROM capability_rank_values existing
          WHERE existing.policy_id = policy.id
            AND existing."rank" = baseline."rank"::users_rank_enum
        )
    `);

    // Public ngay không qua Admin: chỉ Kim Cương, cùng baseline với
    // `SUBMIT_CHARITY_PROPOSAL`.
    await queryRunner.query(`
      INSERT INTO capability_rank_values (policy_id, "rank", allowed, limit_value)
      SELECT policy.id, baseline."rank"::users_rank_enum, baseline.allowed, NULL
      FROM capability_policies policy
      INNER JOIN config_revisions revision ON revision.id = policy.revision_id
      CROSS JOIN (VALUES
        ('VIEWER', false),
        ('MEMBER', false),
        ('SILVER', false),
        ('GOLD', false),
        ('DIAMOND', true)
      ) AS baseline("rank", allowed)
      WHERE policy.code = 'PUBLISH_CHARITY_WITHOUT_REVIEW'
        AND revision.scope = 'ENTITLEMENT'
        AND revision.status = 'PUBLISHED'
        AND revision.effective_from <= now()
        AND (revision.effective_to IS NULL OR revision.effective_to > now())
        AND NOT EXISTS (
          SELECT 1 FROM capability_rank_values existing
          WHERE existing.policy_id = policy.id
            AND existing."rank" = baseline."rank"::users_rank_enum
        )
    `);

    // ── Point Rule, TẮT ──────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO point_rules
        (code, points, is_enabled, affects_lifetime, daily_cap, version)
      VALUES ('CHARITY_CONTRIBUTION_COMPLETED', 10, false, false, NULL, 1)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM point_rules WHERE code = 'CHARITY_CONTRIBUTION_COMPLETED'
    `);
    await queryRunner.query(`
      DELETE FROM capability_rank_values
      WHERE policy_id IN (
        SELECT id FROM capability_policies
        WHERE code IN ('SUBMIT_INDIVIDUAL_APPEAL', 'PUBLISH_CHARITY_WITHOUT_REVIEW')
      )
    `);
    await queryRunner.query(`
      DELETE FROM capability_policies
      WHERE code IN ('SUBMIT_INDIVIDUAL_APPEAL', 'PUBLISH_CHARITY_WITHOUT_REVIEW')
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaign_need_items_campaign"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_need_items"`);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_beneficiary_relation",
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_campaign_type",
        DROP COLUMN IF EXISTS "beneficiary_relation",
        DROP COLUMN IF EXISTS "campaign_type"
    `);
  }
}
