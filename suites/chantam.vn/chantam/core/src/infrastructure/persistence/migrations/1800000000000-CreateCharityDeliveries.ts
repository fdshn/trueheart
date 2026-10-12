import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lượt giao nhận từ thiện (F65b, lát C — thiết kế §5, §6).
 *
 * ## Bảng riêng, KHÔNG dùng chung `gift_transactions`
 *
 * §6 viết *"tái sử dụng FSM cho–tặng hiện hành"*. Đo ngày 12/10 thì tiền đề đó không
 * đúng với schema: `gift_transactions.post_id` và `chat_rooms.post_id` đều `NOT NULL`
 * kèm FK tới `posts`, mọi đường của repository lượt trao (hoàn tất, đóng, job tự hoàn
 * tất) đều đọc `post_id`, 19 use case đọc `transaction.postId`, và `postId: string`
 * nằm trong DTO trả cho app. Còn `complete()` sẽ cộng `GIFT_COMPLETED_*` cho lượt từ
 * thiện — §7 nói luồng này chỉ có điểm riêng — và job `gift:settle-rewards` sẽ quét
 * chúng để trả thêm.
 *
 * Nới `post_id` thành nullable là chạm vào luồng cho–nhận chính của sản phẩm ở hàng
 * chục chỗ, mỗi chỗ một cơ hội hỏng âm thầm. Chủ dự án chốt ngày 12/10: bảng riêng.
 * Cái giá là phòng chat, ảnh bàn giao, cron tự hoàn tất và review của lượt trao KHÔNG
 * có sẵn cho luồng từ thiện — làm riêng nếu cần.
 *
 * ## Mỗi đề nghị: tối đa MỘT lượt quyết định, tối đa MỘT lượt giao nhận
 *
 * `decision_key` trên `campaign_contributions` là khoá chống trùng của lượt quyết
 * định (§5: *"Idempotency key bắt buộc cho thao tác accept"*). Đặt ở ĐỀ NGHỊ chứ không
 * ở lượt giao nhận vì một lượt từ chối toàn bộ không sinh lượt giao nhận nào — khoá ở
 * lượt giao nhận thì retry một lượt từ chối sẽ không có gì để khớp.
 *
 * **KHÔNG có UNIQUE trên `decision_key`.** Phiên bản đầu có, và chạy thật thì nó chỉ
 * làm một việc: client dùng lại một khoá trên một đề nghị KHÁC nhận về lỗi ràng buộc
 * thô — tức 500. Nó không bảo vệ gì, vì mỗi đề nghị chỉ có một lượt quyết, và
 * `decideContribution` so khoá trên hàng đề nghị ĐÃ KHOÁ — hai lượt retry song song
 * vẫn chỉ một lượt thấy trạng thái chờ. Khoá chống trùng thuộc về một đề nghị, không
 * thuộc về cả hệ thống.
 *
 * `UQ_campaign_deliveries_contribution` làm "retry chỉ tạo một transaction"
 * (tiêu chí §11.7) thành tính chất của SCHEMA, không phải của mã.
 *
 * ## `received_quantity` là NULL cho tới lúc hoàn tất
 *
 * Cùng lý do với `accepted_quantity` ở lát B: `NULL` là *"chưa ai xác nhận"*, `0` là
 * *"đã xác nhận và không nhận được gì"*. Người tổ chức xác nhận số THỰC NHẬN từng dòng
 * lúc hoàn tất (§6), và con số đó có thể nhỏ hơn số đã chấp nhận.
 */
export class CreateCharityDeliveries1800000000000 implements MigrationInterface {
  name = 'CreateCharityDeliveries1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_contributions"
        ADD COLUMN IF NOT EXISTS "decision_key" varchar(100)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_deliveries" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "contribution_id" uuid NOT NULL,
        "contributor_id" uuid NOT NULL,
        -- Người NHẬN là người tổ chức tại lúc quyết định, không mặc nhiên là
        -- người thụ hưởng (§6).
        "organizer_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ACCEPTED',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "completed_by" uuid,
        "cancelled_at" timestamptz,
        "cancelled_by" uuid,
        "cancel_reason" varchar(500),
        CONSTRAINT "PK_campaign_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_deliveries_global_id" UNIQUE ("global_id"),
        -- Một đề nghị sinh TỐI ĐA một lượt giao nhận. Retry cùng khoá không có
        -- đường nào tạo lượt thứ hai, kể cả khi phép kiểm ở tầng trên sai.
        CONSTRAINT "UQ_campaign_deliveries_contribution"
          UNIQUE ("contribution_id"),
        CONSTRAINT "FK_campaign_deliveries_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_deliveries_contribution"
          FOREIGN KEY ("contribution_id")
          REFERENCES "campaign_contributions"("global_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_deliveries_contributor"
          FOREIGN KEY ("contributor_id") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_deliveries_organizer"
          FOREIGN KEY ("organizer_id") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "CHK_campaign_deliveries_status"
          CHECK ("status" IN ('ACCEPTED', 'COMPLETED', 'CANCELLED')),
        -- Tự tặng cho chính hoạt động mình tổ chức là đường cày điểm rẻ nhất,
        -- cùng lý do với CHK_gift_transactions_not_self.
        CONSTRAINT "CHK_campaign_deliveries_not_self"
          CHECK ("contributor_id" <> "organizer_id"),
        -- Mốc và trạng thái phải khớp nhau, theo cả hai chiều.
        CONSTRAINT "CHK_campaign_deliveries_completed" CHECK (
          ("status" = 'COMPLETED')
            = ("completed_at" IS NOT NULL AND "completed_by" IS NOT NULL)
        ),
        CONSTRAINT "CHK_campaign_deliveries_cancelled" CHECK (
          ("status" = 'CANCELLED')
            = ("cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL
               AND "cancel_reason" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_deliveries_campaign"
      ON "campaign_deliveries" ("campaign_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_delivery_items" (
        "id" BIGSERIAL NOT NULL,
        "delivery_id" uuid NOT NULL,
        "contribution_item_id" uuid NOT NULL,
        "need_item_id" uuid NOT NULL,
        "accepted_quantity" int NOT NULL,
        -- NULL = chưa xác nhận; 0 = đã xác nhận và không nhận được gì.
        "received_quantity" int,
        CONSTRAINT "PK_campaign_delivery_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_campaign_delivery_items_delivery"
          FOREIGN KEY ("delivery_id") REFERENCES "campaign_deliveries"("global_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_delivery_items_contribution_item"
          FOREIGN KEY ("contribution_item_id")
          REFERENCES "campaign_contribution_items"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_delivery_items_need"
          FOREIGN KEY ("need_item_id") REFERENCES "campaign_need_items"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "UQ_campaign_delivery_items_need"
          UNIQUE ("delivery_id", "need_item_id"),
        -- Chỉ dòng được NHẬN mới vào lượt giao nhận. Dòng bị từ chối không sinh
        -- dòng giao nhận rác (§6).
        CONSTRAINT "CHK_campaign_delivery_items_accepted"
          CHECK ("accepted_quantity" > 0),
        -- Không xác nhận nhận được nhiều hơn số đã chấp nhận. Nhận nhiều hơn là một
        -- cam kết khác, và nó phải đi qua một đề nghị khác.
        CONSTRAINT "CHK_campaign_delivery_items_received" CHECK (
          "received_quantity" IS NULL
          OR ("received_quantity" >= 0
              AND "received_quantity" <= "accepted_quantity")
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_delivery_items"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaign_deliveries_campaign"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_deliveries"`);
    await queryRunner.query(`
      ALTER TABLE "campaign_contributions"
        DROP COLUMN IF EXISTS "decision_key"
    `);
  }
}
