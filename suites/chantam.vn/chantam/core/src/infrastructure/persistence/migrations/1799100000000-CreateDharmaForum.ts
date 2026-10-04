import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Diễn đàn Phật Pháp và Hồi hướng (SRS UC-DHARMA-03, UC-DHARMA-04, F73).
 *
 * ## Chủ đề KHÔNG nằm trong `posts`, và đó là quyết định của thiết kế gốc
 *
 * `posts` có `location` **NOT NULL**, `category_id` NOT NULL trỏ danh mục VẬT PHẨM,
 * `total_quantity`/`remaining_quantity` và `expires_at` theo vòng đời bài tặng. Một chủ đề
 * thảo luận không có cái nào trong số đó.
 *
 * Quan trọng hơn: `content_subject_type_enum` đã tách `DHARMA_THREAD` khỏi `POST` ngay từ
 * migration `1791500000000`. Nhét chủ đề vào `posts` là buộc mọi câu truy vấn bài đăng phải
 * nhớ loại trừ nó — và chỗ nào quên thì một chủ đề thảo luận hiện trên bản đồ Quanh Đây.
 *
 * ## Thích và bình luận KHÔNG cần migration nào
 *
 * `content_reactions` và `content_comments` dùng chung `content_subject_type_enum`, và nó đã
 * có `DHARMA_THREAD`. Người viết migration đó để dành sẵn đúng cho lúc này.
 *
 * ## KHÔNG có cột đếm bình luận hay cảm xúc
 *
 * `posts.reaction_count` và `posts.comment_count` là bản sao của hai bảng kia, và chúng đã
 * trôi. Ở đây hai bảng đó có sẵn nên đếm lúc đọc. Cùng lý lẽ đã bỏ `recitation_count`.
 *
 * ## `is_locked` tách khỏi `status`
 *
 * UC-DHARMA-03 cho Admin *"khóa bình luận"* — đóng phần bình luận mà KHÔNG ẩn chủ đề. Gộp
 * vào `status` thành một giá trị `LOCKED` thì mất khả năng diễn đạt "đang chờ duyệt VÀ đã
 * khoá", và một cuộc tranh luận chệch hướng vẫn đáng đọc lại dù không nên tiếp tục.
 *
 * ## `dharma_dedications` KHÁC `merit_declarations`
 *
 * Hai bảng, một từ tiếng Việt. `merit_declarations` giữ **số tiền** tự khai; bảng này giữ
 * **lời** hồi hướng. Không có tiền ở đây, nên không có trần số tiền và không có mã QR.
 */
export class CreateDharmaForum1799100000000 implements MigrationInterface {
  name = 'CreateDharmaForum1799100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dharma_threads" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "author_id" uuid,
        "title" varchar(200) NOT NULL,
        "body_text" text NOT NULL,
        "category" varchar(50),
        "status" varchar(20) NOT NULL DEFAULT 'VISIBLE',
        "flagged_terms" text,
        "is_locked" boolean NOT NULL DEFAULT false,
        "is_pinned" boolean NOT NULL DEFAULT false,
        "moderated_by" uuid,
        "moderated_at" timestamptz,
        "moderation_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dharma_threads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dharma_threads_global_id" UNIQUE ("global_id"),
        -- ON DELETE SET NULL: xoá tài khoản thì chủ đề còn lại cho người khác đọc, nhưng
        -- mất tên tác giả. Xoá cứng chủ đề là xoá luôn mọi câu trả lời của người khác dưới nó.
        CONSTRAINT "FK_dharma_threads_author"
          FOREIGN KEY ("author_id") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "FK_dharma_threads_moderator"
          FOREIGN KEY ("moderated_by") REFERENCES users("global_id") ON DELETE SET NULL,
        -- Dùng ĐÚNG bốn giá trị của content_comment_status_enum để một màn kiểm duyệt đọc
        -- được cả hai loại nội dung mà không phải nhớ hai bảng trạng thái.
        CONSTRAINT "CHK_dharma_threads_status"
          CHECK ("status" IN ('VISIBLE', 'PENDING_REVIEW', 'HIDDEN', 'REMOVED')),
        CONSTRAINT "CHK_dharma_threads_category_shape"
          CHECK ("category" IS NULL OR "category" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT "CHK_dharma_threads_title" CHECK (length(btrim("title")) >= 5),
        CONSTRAINT "CHK_dharma_threads_body" CHECK (length(btrim("body_text")) >= 10),
        -- Đã kiểm duyệt thì phải biết AI và KHI NÀO. Một chủ đề HIDDEN mà không có người
        -- chịu trách nhiệm là một hàng không ai giải thích được khi tác giả khiếu nại.
        CONSTRAINT "CHK_dharma_threads_moderated"
          CHECK (
            ("moderated_at" IS NULL AND "moderated_by" IS NULL)
            OR ("moderated_at" IS NOT NULL)
          )
      )
    `);

    // Đường công khai: chủ đề ghim lên trước, rồi mới nhất trước. Index phần nên nó không
    // phình theo số chủ đề đã ẩn.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_threads_public"
        ON "dharma_threads" ("is_pinned" DESC, "created_at" DESC)
        WHERE "status" = 'VISIBLE'
    `);
    // Hàng đợi kiểm duyệt của Admin, cũ nhất trước để không ai bị bỏ quên.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_threads_pending"
        ON "dharma_threads" ("created_at" ASC)
        WHERE "status" = 'PENDING_REVIEW'
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_threads_author"
        ON "dharma_threads" ("author_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "dharma_dedications" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "recitation_id" uuid,
        "dedicatee_name" varchar(200),
        "text" varchar(2000) NOT NULL,
        "is_public" boolean NOT NULL DEFAULT true,
        "is_anonymous" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dharma_dedications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dharma_dedications_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_dharma_dedications_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        -- recitation_id NULL được: UC-DHARMA-04 cho "gắn với lần tụng kinh HOẶC tạo độc
        -- lập". ON DELETE SET NULL giữ lời hồi hướng khi lượt tụng bị gỡ — lời đã phát
        -- nguyện không mất vì một bản ghi kỹ thuật.
        CONSTRAINT "FK_dharma_dedications_recitation"
          FOREIGN KEY ("recitation_id") REFERENCES dharma_recitations("global_id")
          ON DELETE SET NULL,
        CONSTRAINT "CHK_dharma_dedications_text" CHECK (length(btrim("text")) >= 5),
        CONSTRAINT "CHK_dharma_dedications_dedicatee"
          CHECK ("dedicatee_name" IS NULL OR length(btrim("dedicatee_name")) > 0)
      )
    `);

    // Danh sách công khai.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_dedications_public"
        ON "dharma_dedications" ("created_at" DESC)
        WHERE "is_public"
    `);
    // "Tôi đã hồi hướng những gì" — gồm cả hàng không công khai.
    await queryRunner.query(`
      CREATE INDEX "IDX_dharma_dedications_user"
        ON "dharma_dedications" ("user_id", "created_at" DESC)
    `);

    // ── Báo xấu chủ đề: thêm MỘT giá trị enum ────────────────────────────────
    //
    // `ALTER TYPE ... ADD VALUE` không dùng được trong cùng transaction với câu dùng giá trị
    // mới, nên đi lối dựng lại type — an toàn trong transaction của TypeORM, và đúng lối
    // migration 1792300000000 đã làm khi thêm COMMENT.
    await queryRunner.query(`
      ALTER TYPE "public"."reports_target_type_enum"
      RENAME TO "reports_target_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_target_type_enum"
      AS ENUM ('POST', 'USER', 'COMMENT', 'CHAT_MESSAGE', 'DHARMA_THREAD')
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "target_type" TYPE "public"."reports_target_type_enum"
      USING "target_type"::text::"public"."reports_target_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."reports_target_type_enum_old"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Gỡ chủ đề khỏi hàng đợi báo xấu TRƯỚC khi hẹp type lại, nếu không câu `USING` sẽ ném
    // vì có hàng mang giá trị không còn trong enum.
    await queryRunner.query(
      `DELETE FROM reports WHERE target_type = 'DHARMA_THREAD'`,
    );
    await queryRunner.query(`
      ALTER TYPE "public"."reports_target_type_enum"
      RENAME TO "reports_target_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_target_type_enum"
      AS ENUM ('POST', 'USER', 'COMMENT', 'CHAT_MESSAGE')
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "target_type" TYPE "public"."reports_target_type_enum"
      USING "target_type"::text::"public"."reports_target_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."reports_target_type_enum_old"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "dharma_dedications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dharma_threads"`);
  }
}
