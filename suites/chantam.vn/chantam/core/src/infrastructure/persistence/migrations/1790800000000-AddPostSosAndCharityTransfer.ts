import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hai cột cho F17 (SOS) và F23 (chuyển vật phẩm về điểm từ thiện).
 *
 * `is_sos` là cột thật, không nhét vào `details` JSONB: nó tham gia lọc và sắp
 * xếp trên bảng tin nên cần index, mà `details->>'isSos'` thì không đánh index
 * được rẻ. Capability `POST_SOS` đã có sẵn trong `capability_rank_values` từ
 * migration entitlement — cột này là chỗ để nó cuối cùng có hiệu lực.
 *
 * Index partial `WHERE is_sos` vì bài SOS là thiểu số: index đầy đủ trên một
 * cột boolean lệch tỉ lệ gần như không được planner dùng.
 *
 * F23 lưu trạng thái xin chuyển ngay trên `posts` thay vì đẻ bảng riêng: một
 * bài chỉ có nhiều nhất một yêu cầu đang mở, nên bảng phụ chỉ thêm một phép
 * join mà không thêm khả năng nào. Ai duyệt và duyệt lúc nào thì
 * `admin_audit_logs` đã ghi.
 */
export class AddPostSosAndCharityTransfer1790800000000 implements MigrationInterface {
  name = 'AddPostSosAndCharityTransfer1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD COLUMN "is_sos" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_posts_sos" ON "posts" ("is_sos") WHERE "is_sos"`,
    );

    await queryRunner.query(`
      CREATE TYPE "public"."posts_charity_transfer_enum"
      AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED')
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD COLUMN "charity_transfer_status" "public"."posts_charity_transfer_enum",
      ADD COLUMN "charity_transfer_requested_at" timestamptz,
      ADD COLUMN "charity_transfer_note" varchar(500)
    `);

    // Có mốc thời gian mà không có trạng thái (hoặc ngược lại) là một yêu cầu
    // nửa vời — không đọc được là đang chờ duyệt hay chưa từng gửi.
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD CONSTRAINT "CHK_posts_charity_transfer_pairing"
      CHECK (
        ("charity_transfer_status" IS NULL AND "charity_transfer_requested_at" IS NULL)
        OR
        ("charity_transfer_status" IS NOT NULL AND "charity_transfer_requested_at" IS NOT NULL)
      )
    `);

    // Chỉ một yêu cầu đang chờ duyệt cho mỗi bài. Đặt ở database vì hai lần
    // bấm gửi song song đều lọt qua mọi phép kiểm ở tầng ứng dụng.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_posts_charity_transfer_open"
      ON "posts" ("global_id")
      WHERE "charity_transfer_status" = 'REQUESTED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_posts_charity_transfer_open"`);
    await queryRunner.query(
      `ALTER TABLE "posts" DROP CONSTRAINT "CHK_posts_charity_transfer_pairing"`,
    );
    await queryRunner.query(`
      ALTER TABLE "posts"
      DROP COLUMN "charity_transfer_note",
      DROP COLUMN "charity_transfer_requested_at",
      DROP COLUMN "charity_transfer_status"
    `);
    await queryRunner.query(`DROP TYPE "public"."posts_charity_transfer_enum"`);
    await queryRunner.query(`DROP INDEX "IDX_posts_sos"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "is_sos"`);
  }
}
