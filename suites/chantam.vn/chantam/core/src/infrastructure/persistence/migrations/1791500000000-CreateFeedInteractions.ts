import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cảm xúc, bình luận, chia sẻ và báo xấu trên bảng tin.
 *
 * **Đa hình bằng `subject_type` + `subject_id`.** SRS 3.3.12 ghi Dharma Hub tái
 * sử dụng Post-Comment/Moderation, nên gắn cứng `post_id` bây giờ là tự hẹn một
 * cuộc migrate cả bảng, index, kiểm duyệt và thông báo cùng lúc.
 *
 * Cái giá: **không có khoá ngoại tới chủ thể**. Bù bằng xoá mềm của `posts`
 * (dòng không biến mất) và một phép kiểm chống bình luận mồ côi trong script DB
 * thật.
 *
 * **Số đếm là cột trên `posts`**, cập nhật trong cùng transaction với lần ghi.
 * Bảng tin trả 20 bài mỗi lần cuộn; `COUNT(*)` cho cảm xúc và bình luận của
 * từng bài là 40 lần quét mỗi lần cuộn.
 */
export class CreateFeedInteractions1791500000000 implements MigrationInterface {
  name = 'CreateFeedInteractions1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."content_subject_type_enum"
      AS ENUM ('POST', 'COMMENT', 'DHARMA_THREAD')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."content_reaction_kind_enum"
      AS ENUM ('LIKE', 'LOVE', 'CARE', 'WOW', 'SAD')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."content_comment_status_enum"
      AS ENUM ('VISIBLE', 'PENDING_REVIEW', 'HIDDEN', 'REMOVED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."content_report_status_enum"
      AS ENUM ('PENDING', 'UPHELD', 'DISMISSED')
    `);

    // ── Cảm xúc ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "content_reactions" (
        "id" BIGSERIAL NOT NULL,
        "subject_type" "public"."content_subject_type_enum" NOT NULL,
        "subject_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "kind" "public"."content_reaction_kind_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_reactions" PRIMARY KEY ("id"),
        -- Một người MỘT cảm xúc trên một chủ thể. Đổi cảm xúc là UPDATE dòng
        -- này, không phải thêm dòng mới — nếu không thì số đếm nói dối.
        CONSTRAINT "UQ_content_reactions_one_per_user"
          UNIQUE ("subject_type", "subject_id", "user_id"),
        CONSTRAINT "FK_content_reactions_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_content_reactions_subject"
       ON "content_reactions" ("subject_type", "subject_id", "kind")`,
    );

    // ── Bình luận ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "content_comments" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "subject_type" "public"."content_subject_type_enum" NOT NULL,
        "subject_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "body" varchar(1000) NOT NULL,
        "status" "public"."content_comment_status_enum" NOT NULL DEFAULT 'VISIBLE',
        "depth" smallint NOT NULL,
        "parent_id" uuid,
        "parent_depth" smallint,
        "reply_count" integer NOT NULL DEFAULT 0,
        "reaction_count" integer NOT NULL DEFAULT 0,
        "media_count" integer NOT NULL DEFAULT 0,
        "flagged_terms" text,
        "edited_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_comments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_content_comments_global_id" UNIQUE ("global_id"),
        -- Cặp này tồn tại CHỈ để làm đích cho khoá ngoại bên dưới.
        CONSTRAINT "UQ_content_comments_global_id_depth"
          UNIQUE ("global_id", "depth"),
        CONSTRAINT "FK_content_comments_author"
          FOREIGN KEY ("author_id") REFERENCES "users"("global_id"),
        CONSTRAINT "CHK_content_comments_depth"
          CHECK ("depth" BETWEEN 1 AND 2),
        -- Hai cấp, do DATABASE giữ chứ không phải trigger hay tầng ứng dụng:
        -- một trả lời (depth 2) chỉ trỏ được vào bình luận gốc (depth 1), vì
        -- khoá ngoại ghép đòi đúng cặp (parent_id, 1).
        CONSTRAINT "CHK_content_comments_parent_pairing"
          CHECK (
            ("depth" = 1 AND "parent_id" IS NULL AND "parent_depth" IS NULL)
            OR ("depth" = 2 AND "parent_id" IS NOT NULL AND "parent_depth" = 1)
          ),
        CONSTRAINT "FK_content_comments_parent"
          FOREIGN KEY ("parent_id", "parent_depth")
          REFERENCES "content_comments"("global_id", "depth"),
        CONSTRAINT "CHK_content_comments_body_not_blank"
          CHECK (length(btrim("body")) > 0 OR "media_count" > 0),
        CONSTRAINT "CHK_content_comments_counters"
          CHECK (
            "reply_count" >= 0 AND "reaction_count" >= 0
            AND "media_count" BETWEEN 0 AND 3
          )
      )
    `);
    // Cùng khoá sắp xếp với chat: (created_at, id) để hai bình luận cùng một
    // millisecond vẫn phân định được, nếu không cửa sổ sau lặp hoặc bỏ sót.
    await queryRunner.query(
      `CREATE INDEX "IDX_content_comments_subject_created"
       ON "content_comments" ("subject_type", "subject_id", "created_at" DESC, "id" DESC)
       WHERE "parent_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_content_comments_replies"
       ON "content_comments" ("parent_id", "created_at" ASC, "id" ASC)
       WHERE "parent_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "content_comment_media" (
        "id" BIGSERIAL NOT NULL,
        "comment_id" uuid NOT NULL,
        "slot" smallint NOT NULL,
        "storage_key" varchar(500) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_comment_media" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_content_comment_media_key" UNIQUE ("storage_key"),
        -- Trần ba ảnh do database giữ, giống ảnh bằng chứng lượt trao: một phép
        -- đếm ở tầng ứng dụng thua cuộc khi hai request vào cùng lúc.
        CONSTRAINT "UQ_content_comment_media_slot"
          UNIQUE ("comment_id", "slot"),
        CONSTRAINT "CHK_content_comment_media_slot"
          CHECK ("slot" BETWEEN 1 AND 3),
        CONSTRAINT "FK_content_comment_media_comment"
          FOREIGN KEY ("comment_id")
          REFERENCES "content_comments"("global_id") ON DELETE CASCADE
      )
    `);

    // ── Chia sẻ ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "content_shares" (
        "id" BIGSERIAL NOT NULL,
        "subject_type" "public"."content_subject_type_enum" NOT NULL,
        "subject_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "channel" varchar(40),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_shares" PRIMARY KEY ("id"),
        CONSTRAINT "FK_content_shares_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_content_shares_subject"
       ON "content_shares" ("subject_type", "subject_id")`,
    );

    // ── Báo xấu ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "content_reports" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "subject_type" "public"."content_subject_type_enum" NOT NULL,
        "subject_id" uuid NOT NULL,
        "reporter_id" uuid NOT NULL,
        "reason" varchar(500) NOT NULL,
        "status" "public"."content_report_status_enum" NOT NULL DEFAULT 'PENDING',
        "resolved_by" uuid,
        "resolution_note" varchar(500),
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_reports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_content_reports_global_id" UNIQUE ("global_id"),
        -- Một người báo một chủ thể ĐÚNG một lần. Không có ràng buộc này thì
        -- một nhóm người bơm được số lượt báo để ép Admin xử.
        CONSTRAINT "UQ_content_reports_one_per_reporter"
          UNIQUE ("subject_type", "subject_id", "reporter_id"),
        CONSTRAINT "FK_content_reports_reporter"
          FOREIGN KEY ("reporter_id") REFERENCES "users"("global_id"),
        CONSTRAINT "CHK_content_reports_resolution"
          CHECK (
            ("status" = 'PENDING' AND "resolved_at" IS NULL)
            OR ("status" <> 'PENDING' AND "resolved_at" IS NOT NULL)
          )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_content_reports_queue"
       ON "content_reports" ("status", "created_at" ASC)
       WHERE "status" = 'PENDING'`,
    );

    // ── Số đếm trên bài đăng ────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD COLUMN "reaction_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN "comment_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN "share_count" integer NOT NULL DEFAULT 0,
      ADD CONSTRAINT "CHK_posts_interaction_counters"
        CHECK (
          "reaction_count" >= 0 AND "comment_count" >= 0
          AND "share_count" >= 0
        )
    `);

    // ── Capability cho tương tác ────────────────────────────────────────────
    //
    // Bản chính sách MỚI chứ không sửa bản đã xuất bản: config revision là
    // copy-on-write, nên bút toán quyền đã phát sinh vẫn tra được là ra đời
    // dưới bản nào.
    await queryRunner.query(`
      UPDATE "config_bundles"
      SET "status" = 'ARCHIVED',
          -- GREATEST chu khong phai now(): tren database dung moi, ban 1 vua
          -- duoc tao trong CUNG lan chay migration nen effective_from = now(),
          -- va CHK_config_bundles_dates doi effective_to phai LON HON.
          "effective_to" = GREATEST(
            now(), "effective_from" + interval '1 millisecond'
          )
      WHERE "code" = 'M6_BASE_POLICY' AND "status" = 'PUBLISHED'
    `);
    // Dong luon cua so cua REVISION cu: EX_config_revisions_published_scope_window
    // cam hai revision cung scope cung hieu luc — dung ra de khong ai phai doan
    // "luc do dang ap ban nao".
    await queryRunner.query(`
      UPDATE "config_revisions"
      SET "status" = 'ARCHIVED',
          "effective_to" = GREATEST(
            now(), "effective_from" + interval '1 millisecond'
          )
      WHERE "scope" = 'ENTITLEMENT' AND "status" = 'PUBLISHED'
    `);
    await queryRunner.query(`
      INSERT INTO "config_bundles" ("code", "version", "status")
      VALUES ('M6_BASE_POLICY', 2, 'PUBLISHED')
    `);
    await queryRunner.query(`
      INSERT INTO "config_revisions" ("bundle_id", "scope", "status", "change_reason")
      SELECT "id", 'ENTITLEMENT', 'PUBLISHED',
             'Them quyen binh luan va tha cam xuc tren bang tin'
      FROM "config_bundles"
      WHERE "code" = 'M6_BASE_POLICY' AND "version" = 2
    `);

    // Chép nguyên bộ quyền cũ sang bản mới, rồi thêm hai quyền mới. Không chép
    // thì xuất bản bản 2 là vô tình thu hồi mọi quyền đăng bài.
    await queryRunner.query(`
      INSERT INTO "capability_policies" ("revision_id", "code", "enabled")
      SELECT new_revision."id", old_policy."code", old_policy."enabled"
      FROM "config_revisions" new_revision
      CROSS JOIN LATERAL (
        SELECT policy."code", policy."enabled"
        FROM "capability_policies" policy
        JOIN "config_revisions" revision ON revision."id" = policy."revision_id"
        JOIN "config_bundles" bundle ON bundle."id" = revision."bundle_id"
        WHERE bundle."code" = 'M6_BASE_POLICY' AND bundle."version" = 1
      ) AS old_policy
      JOIN "config_bundles" new_bundle ON new_bundle."id" = new_revision."bundle_id"
      WHERE new_bundle."code" = 'M6_BASE_POLICY' AND new_bundle."version" = 2
    `);
    await queryRunner.query(`
      INSERT INTO "capability_rank_values" ("policy_id", "rank", "allowed", "limit_value")
      SELECT new_policy."id", old_value."rank", old_value."allowed", old_value."limit_value"
      FROM "capability_policies" new_policy
      JOIN "config_revisions" revision ON revision."id" = new_policy."revision_id"
      JOIN "config_bundles" bundle ON bundle."id" = revision."bundle_id"
      JOIN LATERAL (
        SELECT value."rank", value."allowed", value."limit_value"
        FROM "capability_rank_values" value
        JOIN "capability_policies" policy ON policy."id" = value."policy_id"
        JOIN "config_revisions" old_revision ON old_revision."id" = policy."revision_id"
        JOIN "config_bundles" old_bundle ON old_bundle."id" = old_revision."bundle_id"
        WHERE old_bundle."code" = 'M6_BASE_POLICY' AND old_bundle."version" = 1
          AND policy."code" = new_policy."code"
      ) AS old_value ON true
      WHERE bundle."code" = 'M6_BASE_POLICY' AND bundle."version" = 2
    `);

    await queryRunner.query(`
      INSERT INTO "capability_policies" ("revision_id", "code")
      SELECT revision."id", capability_code
      FROM "config_revisions" revision
      JOIN "config_bundles" bundle ON bundle."id" = revision."bundle_id"
      CROSS JOIN (VALUES
        ('REACT_CONTENT'),
        ('COMMENT_CONTENT')
      ) AS capabilities(capability_code)
      WHERE bundle."code" = 'M6_BASE_POLICY' AND bundle."version" = 2
    `);

    // VIEWER chỉ đọc — cùng logic với việc VIEWER chưa đăng bài được. `limit`
    // NULL nghĩa là không giới hạn số lượng, khác hẳn 0 là cấm hẳn.
    await queryRunner.query(`
      INSERT INTO "capability_rank_values" ("policy_id", "rank", "allowed", "limit_value")
      SELECT policy."id", rank_value."rank", rank_value."allowed", rank_value."limit_value"
      FROM "capability_policies" policy
      JOIN "config_revisions" revision ON revision."id" = policy."revision_id"
      JOIN "config_bundles" bundle ON bundle."id" = revision."bundle_id"
      CROSS JOIN (VALUES
        ('VIEWER'::users_rank_enum, false, 0),
        ('MEMBER'::users_rank_enum, true, NULL::integer),
        ('SILVER'::users_rank_enum, true, NULL::integer),
        ('GOLD'::users_rank_enum, true, NULL::integer),
        ('DIAMOND'::users_rank_enum, true, NULL::integer)
      ) AS rank_value("rank", "allowed", "limit_value")
      WHERE bundle."code" = 'M6_BASE_POLICY' AND bundle."version" = 2
        AND policy."code" IN ('REACT_CONTENT', 'COMMENT_CONTENT')
    `);

    // ── Rule điểm F41, TẮT sẵn ──────────────────────────────────────────────
    //
    // `affects_lifetime = false` là bắt buộc: lifetime là sàn của Rank, nên cho
    // bình luận đẩy hạng thì gõ 300 dòng "hay quá ạ" là lên Bạc, trong khi tặng
    // một món đồ thật được 56 điểm.
    await queryRunner.query(`
      INSERT INTO point_rules
        (code, points, is_enabled, affects_lifetime, daily_cap, version)
      VALUES
        ('POST_COMMENTED', 2, false, false, 10, 1),
        ('POST_REACTED', 1, false, false, 20, 1)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM point_rules
      WHERE code IN ('POST_COMMENTED', 'POST_REACTED')
    `);
    await queryRunner.query(`
      DELETE FROM "capability_rank_values"
      WHERE "policy_id" IN (
        SELECT policy."id" FROM "capability_policies" policy
        JOIN "config_revisions" revision ON revision."id" = policy."revision_id"
        JOIN "config_bundles" bundle ON bundle."id" = revision."bundle_id"
        WHERE bundle."code" = 'M6_BASE_POLICY' AND bundle."version" = 2
      )
    `);
    await queryRunner.query(`
      DELETE FROM "capability_policies"
      WHERE "revision_id" IN (
        SELECT revision."id" FROM "config_revisions" revision
        JOIN "config_bundles" bundle ON bundle."id" = revision."bundle_id"
        WHERE bundle."code" = 'M6_BASE_POLICY' AND bundle."version" = 2
      )
    `);
    await queryRunner.query(`
      DELETE FROM "config_revisions"
      WHERE "bundle_id" IN (
        SELECT "id" FROM "config_bundles"
        WHERE "code" = 'M6_BASE_POLICY' AND "version" = 2
      )
    `);
    await queryRunner.query(`
      DELETE FROM "config_bundles"
      WHERE "code" = 'M6_BASE_POLICY' AND "version" = 2
    `);
    await queryRunner.query(`
      UPDATE "config_bundles" SET "status" = 'PUBLISHED', "effective_to" = NULL
      WHERE "code" = 'M6_BASE_POLICY' AND "version" = 1
    `);
    await queryRunner.query(`
      UPDATE "config_revisions"
      SET "status" = 'PUBLISHED', "effective_to" = NULL
      WHERE "scope" = 'ENTITLEMENT' AND "status" = 'ARCHIVED'
    `);

    await queryRunner.query(`
      ALTER TABLE "posts"
      DROP CONSTRAINT "CHK_posts_interaction_counters",
      DROP COLUMN "share_count",
      DROP COLUMN "comment_count",
      DROP COLUMN "reaction_count"
    `);

    await queryRunner.query(`DROP TABLE "content_reports"`);
    await queryRunner.query(`DROP TABLE "content_shares"`);
    await queryRunner.query(`DROP TABLE "content_comment_media"`);
    await queryRunner.query(`DROP TABLE "content_comments"`);
    await queryRunner.query(`DROP TABLE "content_reactions"`);

    await queryRunner.query(`DROP TYPE "public"."content_report_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."content_comment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."content_reaction_kind_enum"`);
    await queryRunner.query(`DROP TYPE "public"."content_subject_type_enum"`);
  }
}
