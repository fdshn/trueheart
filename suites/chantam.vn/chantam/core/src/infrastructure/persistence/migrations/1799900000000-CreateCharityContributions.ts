import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đề nghị đóng góp vật phẩm (F65b, lát B — thiết kế §4).
 *
 * Một `campaign_contribution` gồm một hoặc nhiều `campaign_contribution_items`,
 * mỗi dòng trỏ vào một dòng nhu cầu và nói số lượng muốn tặng.
 *
 * ## `accepted_quantity` là NULL khi chưa ai quyết, 0 khi bị từ chối
 *
 * Hai thứ đó khác nhau và phải phân biệt được: `NULL` là *"organizer chưa xem"*,
 * `0` là *"đã xem và không nhận"*. Gộp chúng vào `0` thì không còn đường nào đếm
 * đúng số đề nghị đang chờ, và `pendingQuantity` của bảng nhu cầu sẽ nói sai.
 *
 * Vì thế `rejection_reason` cũng gắn ở DÒNG, không ở đề nghị: §4 cho organizer từ
 * chối từng dòng, nên một lý do duy nhất cho cả đề nghị sẽ không mô tả được một
 * đề nghị ba dòng bị từ chối hai dòng vì hai lý do khác nhau.
 *
 * ## Trạng thái đề nghị là CỘT, không phải phép suy lúc đọc
 *
 * Có thể suy `PARTIALLY_ACCEPTED` từ các dòng, nhưng ba chỗ cần nó — danh sách của
 * organizer, danh sách của contributor, và phép chặn sửa — sẽ mỗi chỗ suy một kiểu.
 * Cột `status` cộng một CHECK là một nguồn. Lát C ghi nó trong cùng transaction với
 * lượt quyết định.
 *
 * ## `WITHDRAWN` không xoá hàng
 *
 * §4: contributor chỉ rút khi chưa có phần nào được chấp nhận. Rút là đổi trạng
 * thái, không `DELETE` — organizer đã đọc đề nghị đó và cần biết nó từng tồn tại.
 *
 * ## Không chặn một người gửi nhiều đề nghị trên cùng chiến dịch
 *
 * Cân nhắc rồi bỏ: khác với `gift_requests` (một suất, nhiều người tranh), ở đây
 * một người tặng gạo tháng này và tặng mì tháng sau là chuyện bình thường. Phép
 * chống vượt nhu cầu nằm ở lượt CHẤP NHẬN (§5, lát C) chứ không ở lượt gửi — nên
 * một ràng buộc "mỗi người một đề nghị đang mở" chỉ chặn việc đúng.
 */
export class CreateCharityContributions1799900000000 implements MigrationInterface {
  name = 'CreateCharityContributions1799900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_contributions" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "contributor_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING_REVIEW',
        "note" varchar(1000),
        "contact_note" varchar(500),
        "decided_at" timestamptz,
        "decided_by" uuid,
        "withdrawn_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_contributions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_contributions_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_campaign_contributions_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_contributions_contributor"
          FOREIGN KEY ("contributor_id") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_contributions_decider"
          FOREIGN KEY ("decided_by") REFERENCES "users"("global_id")
          ON DELETE SET NULL,
        CONSTRAINT "CHK_campaign_contributions_status" CHECK ("status" IN (
          'PENDING_REVIEW', 'PARTIALLY_ACCEPTED', 'ACCEPTED',
          'REJECTED', 'WITHDRAWN'
        )),
        -- Mốc rút và trạng thái phải khớp nhau. Một hàng WITHDRAWN không có mốc
        -- rút là một hàng không ai đọc nổi: rút lúc nào, hay chưa bao giờ rút?
        CONSTRAINT "CHK_campaign_contributions_withdrawn_at" CHECK (
          ("status" = 'WITHDRAWN') = ("withdrawn_at" IS NOT NULL)
        ),
        -- Đã quyết thì phải biết AI quyết và LÚC NÀO. Ba trạng thái sau lượt
        -- quyết định đều đòi cả hai; PENDING_REVIEW và WITHDRAWN thì không.
        CONSTRAINT "CHK_campaign_contributions_decided" CHECK (
          CASE
            WHEN "status" IN ('PARTIALLY_ACCEPTED', 'ACCEPTED', 'REJECTED')
              THEN "decided_at" IS NOT NULL AND "decided_by" IS NOT NULL
            ELSE "decided_at" IS NULL AND "decided_by" IS NULL
          END
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_contributions_campaign"
      ON "campaign_contributions" ("campaign_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_contributions_contributor"
      ON "campaign_contributions" ("contributor_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_contribution_items" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contribution_id" uuid NOT NULL,
        "need_item_id" uuid NOT NULL,
        "offered_quantity" int NOT NULL,
        "condition_note" varchar(500),
        -- NULL = chưa ai quyết; 0 = đã xem và không nhận. Xem docblock đầu file.
        "accepted_quantity" int,
        "rejection_reason" varchar(30),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_contribution_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_contribution_items_global_id"
          UNIQUE ("global_id"),
        CONSTRAINT "FK_campaign_contribution_items_contribution"
          FOREIGN KEY ("contribution_id")
          REFERENCES "campaign_contributions"("global_id") ON DELETE CASCADE,
        -- RESTRICT, không CASCADE: một dòng nhu cầu đã có đề nghị không được xoá
        -- cứng (§3), nên xoá nó phải vỡ ở đây chứ không âm thầm mang theo đề nghị
        -- của người ta.
        CONSTRAINT "FK_campaign_contribution_items_need"
          FOREIGN KEY ("need_item_id")
          REFERENCES "campaign_need_items"("global_id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_campaign_contribution_items_one_per_need"
          UNIQUE ("contribution_id", "need_item_id"),
        CONSTRAINT "CHK_campaign_contribution_items_offered"
          CHECK ("offered_quantity" > 0 AND "offered_quantity" <= 1000000),
        -- Không nhận nhiều hơn số người ta đề nghị. Nhận nhiều hơn là tự khai một
        -- cam kết thay cho người tặng.
        CONSTRAINT "CHK_campaign_contribution_items_accepted" CHECK (
          "accepted_quantity" IS NULL
          OR ("accepted_quantity" >= 0
              AND "accepted_quantity" <= "offered_quantity")
        ),
        CONSTRAINT "CHK_campaign_contribution_items_reason" CHECK (
          "rejection_reason" IS NULL OR "rejection_reason" IN (
            'TARGET_REACHED', 'NOT_MATCH_REQUIREMENT', 'DELIVERY_NOT_AGREED',
            'CANNOT_CONTACT', 'QUALITY_NOT_ACCEPTABLE', 'CAMPAIGN_CLOSED',
            'OTHER'
          )
        ),
        -- Lý do từ chối CHỈ có nghĩa khi nhận ít hơn đề nghị. Một dòng nhận đủ mà
        -- mang lý do từ chối là hai câu nói trái nhau trong cùng một hàng.
        CONSTRAINT "CHK_campaign_contribution_items_reason_shape" CHECK (
          "rejection_reason" IS NULL
          OR ("accepted_quantity" IS NOT NULL
              AND "accepted_quantity" < "offered_quantity")
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_contribution_items_need"
      ON "campaign_contribution_items" ("need_item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaign_contribution_items_need"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "campaign_contribution_items"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaign_contributions_contributor"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaign_contributions_campaign"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_contributions"`);
  }
}
