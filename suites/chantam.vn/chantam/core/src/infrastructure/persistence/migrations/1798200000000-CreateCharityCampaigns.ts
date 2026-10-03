import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hoạt động Từ thiện (SRS §6.2.13 `campaigns`, BR-CHARITY-01..03, UI-CHARITY-01, F65).
 *
 * ## Vì sao KHÔNG có cột `participant_count`
 *
 * §6.2.13 không nêu cột đó, và tôi cố ý không thêm. Mọi con số đếm lưu sẵn trong hệ này
 * đã từng lệch: `posts.reaction_count`, `notification_broadcasts.audience_count`. Số người
 * đăng ký thì đếm được bằng một câu con trên `campaign_participations` — vài chục hàng mỗi
 * hoạt động, không phải chỗ cần tối ưu. Đổi lại, nó không bao giờ sai.
 *
 * Hai cột đếm CÓ ở đây — `target_items_count` và `current_items_count` — là chuyện khác:
 * §6.2.13 bắt buộc, và BR-CHARITY-02 nói rõ chúng là LỜI KHAI của người tổ chức, hệ thống
 * không đối soát. Không có trigger nào, không có hook nào tăng `current_items_count`.
 *
 * ## `approved_at` phải khớp `approval_status`, và database canh điều đó
 *
 * Cùng lối `CHK_blogs_published_at`. Một hoạt động `PENDING_APPROVAL` mà mang `approved_at`
 * là một hàng không ai đọc nổi: nó từng được duyệt rồi bị rút, hay chưa bao giờ?
 *
 * ## `location` không NOT NULL, dù Map Discovery cần nó
 *
 * UI-CHARITY-01 nói hoạt động hiện trên Map Discovery, nhưng cũng có hoạt động không gắn
 * một điểm nào (quyên góp trực tuyến). `NOT NULL` sẽ buộc người tạo bịa một toạ độ, và
 * một điểm bịa trên bản đồ tệ hơn không có điểm nào.
 *
 * ## `EXCLUDE` trùng khung thời gian: KHÔNG áp ở đây
 *
 * `home_campaign_configs` có ràng buộc đó vì mỗi lúc chỉ một bố cục Home được hiệu lực.
 * Hoạt động từ thiện thì ngược lại — nhiều hoạt động chạy song song là bình thường.
 */
export class CreateCharityCampaigns1798200000000 implements MigrationInterface {
  name = 'CreateCharityCampaigns1798200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" varchar(200) NOT NULL,
        "slug" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "banner_url" text NOT NULL,
        "badge_name" varchar(50) NOT NULL,
        "target_items_count" int NOT NULL DEFAULT 0,
        "current_items_count" int NOT NULL DEFAULT 0,
        "location" geography(Point, 4326),
        "location_label" varchar(255),
        "start_time" timestamptz NOT NULL,
        "end_time" timestamptz NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "approval_status" varchar(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
        "approval_note" text,
        "approved_at" timestamptz,
        "approved_by" uuid,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaigns_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_campaigns_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_campaigns_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "FK_campaigns_approver"
          FOREIGN KEY ("approved_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_campaigns_approval_status"
          CHECK ("approval_status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
        CONSTRAINT "CHK_campaigns_slug_shape"
          CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        -- Khoảng thời gian phải có chiều. Một hoạt động kết thúc trước khi bắt đầu thì mọi
        -- phép so trong BR-CHARITY-03 đều cho kết quả vô nghĩa: không huỷ được vì đã bắt
        -- đầu, lại đánh giá được ngay vì đã kết thúc.
        CONSTRAINT "CHK_campaigns_time_order" CHECK ("end_time" > "start_time"),
        CONSTRAINT "CHK_campaigns_target_items"
          CHECK ("target_items_count" >= 0 AND "target_items_count" <= 1000000),
        CONSTRAINT "CHK_campaigns_current_items" CHECK ("current_items_count" >= 0),
        CONSTRAINT "CHK_campaigns_approved_at"
          CHECK (
            ("approval_status" = 'PENDING_APPROVAL' AND "approved_at" IS NULL)
            OR ("approval_status" <> 'PENDING_APPROVAL' AND "approved_at" IS NOT NULL)
          ),
        CONSTRAINT "CHK_campaigns_description" CHECK (length("description") >= 10),
        CONSTRAINT "CHK_campaigns_banner_url" CHECK ("banner_url" LIKE 'https://%'),
        CONSTRAINT "CHK_campaigns_badge_name" CHECK (length(btrim("badge_name")) > 0)
      )
    `);

    // Đường công khai: chỉ hoạt động đã duyệt, còn bật, chưa xoá. Index phần nên nó không
    // phình theo số hồ sơ chờ duyệt — mà hồ sơ chờ duyệt có thể nhiều, vì ai đủ hạng cũng
    // gửi được.
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_public" ON "campaigns" ("start_time" DESC)
        WHERE "approval_status" = 'APPROVED'
          AND "is_active"
          AND "deleted_at" IS NULL
    `);
    // Hàng đợi duyệt của Admin: cũ nhất trước, để không ai bị bỏ quên.
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_pending" ON "campaigns" ("created_at" ASC)
        WHERE "approval_status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL
    `);
    // Map Discovery. GIST trên geography, cùng lối IDX trên users.default_location.
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_location" ON "campaigns" USING gist ("location")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_participations" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'REGISTERED',
        "registered_at" timestamptz NOT NULL DEFAULT now(),
        "cancelled_at" timestamptz,
        CONSTRAINT "PK_campaign_participations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_participations_global_id" UNIQUE ("global_id"),
        -- MỘT hàng mỗi (hoạt động, người). Huỷ rồi đăng ký lại là ĐỔI trạng thái hàng này,
        -- không phải thêm hàng mới. Lối thêm hàng lịch sử buộc mọi câu đếm phải nhớ
        -- AND status = 'REGISTERED', và chỗ nào quên thì đếm cả người đã huỷ — đúng lỗi
        -- group_memberships đã gây ra ở F47.
        CONSTRAINT "UQ_campaign_participations_member"
          UNIQUE ("campaign_id", "user_id"),
        CONSTRAINT "FK_campaign_participations_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES campaigns("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_participations_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_campaign_participations_status"
          CHECK ("status" IN ('REGISTERED', 'CANCELLED')),
        CONSTRAINT "CHK_campaign_participations_cancelled_at"
          CHECK (
            ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
            OR ("status" = 'REGISTERED' AND "cancelled_at" IS NULL)
          )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_participations_campaign"
        ON "campaign_participations" ("campaign_id")
        WHERE "status" = 'REGISTERED'
    `);
    // Câu hỏi "tôi đã đăng ký những hoạt động nào" — và lượt kiểm isJoined trên trang chi tiết.
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_participations_user"
        ON "campaign_participations" ("user_id", "registered_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_reviews" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "reviewee_id" uuid NOT NULL,
        "reviewer_role" varchar(20) NOT NULL,
        "rating" int NOT NULL,
        "comment" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_reviews_global_id" UNIQUE ("global_id"),
        -- Một người chấm một người MỘT lần cho mỗi hoạt động. Không chặn theo
        -- (campaign, reviewer) vì người tổ chức chấm nhiều người tham gia khác nhau.
        CONSTRAINT "UQ_campaign_reviews_pair"
          UNIQUE ("campaign_id", "reviewer_id", "reviewee_id"),
        CONSTRAINT "FK_campaign_reviews_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES campaigns("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_reviews_reviewer"
          FOREIGN KEY ("reviewer_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_reviews_reviewee"
          FOREIGN KEY ("reviewee_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_campaign_reviews_not_self"
          CHECK ("reviewer_id" <> "reviewee_id"),
        CONSTRAINT "CHK_campaign_reviews_role"
          CHECK ("reviewer_role" IN ('ORGANIZER', 'PARTICIPANT')),
        CONSTRAINT "CHK_campaign_reviews_rating"
          CHECK ("rating" >= 1 AND "rating" <= 5)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_reviews_campaign"
        ON "campaign_reviews" ("campaign_id", "created_at" DESC)
    `);
    // Điểm trung bình một người nhận được, mọi hoạt động.
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_reviews_reviewee"
        ON "campaign_reviews" ("reviewee_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_participations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
  }
}
