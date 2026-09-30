import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `group_memberships.status` — cột mà tài liệu đã vẽ là có từ đầu.
 *
 * ## Vấn đề nó sửa: thành viên của nhóm đã giải tán bị đóng băng vĩnh viễn
 *
 * `hasMembership` chỉ hỏi "người này có dòng membership nào không", không hỏi
 * nhóm đó còn sống không. Nên sau khi Owner xoá tài khoản và nhóm thành
 * `DISSOLVED`, mọi thành viên cũ vẫn bị coi là "đã có nhóm": không lập được nhóm
 * mới, và cũng không vào nhóm nào khác được vì đường duy nhất để vào là link mời
 * dành cho tài khoản MỚI. Nhóm đã chết, họ không còn nhận được gì từ nó, mà mất
 * luôn quyền thuộc một nhóm.
 *
 * Ý định ban đầu không phải vậy — `UQ_groups_one_active_per_owner` là index MỘT
 * PHẦN kèm đúng câu này trong migration gốc: *"nhóm đã giải tán không nên chặn
 * người đó lập nhóm mới"*. Database được thiết kế để CHO, tầng ứng dụng chặn.
 *
 * ## Vì sao phải là một cột, không phải một vế `WHERE`
 *
 * Thêm `AND groups.status = 'ACTIVE'` vào `hasMembership` là chưa đủ:
 * `UQ_group_memberships_user` là UNIQUE trần trên `user_id`, nên dòng membership
 * mới sẽ vi phạm nó. Mà index một phần của Postgres không tham chiếu được bảng
 * khác, nên điều kiện "nhóm còn ACTIVE" không đặt được vào chính ràng buộc đó.
 *
 * Nên trạng thái phải nằm TRÊN membership. Rồi ràng buộc "mỗi người một nhóm"
 * đổi thành "mỗi người một membership ĐANG HIỆU LỰC", và dòng cũ vẫn ở lại làm
 * lịch sử — đúng thứ CHỐT-02 yêu cầu giữ.
 *
 * ## Vì sao KHÔNG có giá trị `BANNED`
 *
 * Câu hỏi số 6 của `18-group.md` (*"người bị BANNED thì membership xử lý thế
 * nào?"*) không cần một giá trị ở đây. Ban một người là `users.status = BANNED`,
 * và đường đó đã thu hồi toàn bộ phiên (`revokeEverything`) trong khi `login` và
 * `refresh` đều chặn `BANNED` — họ không gọi được endpoint nhóm nào cả.
 *
 * Chép trạng thái đó sang membership là tạo nguồn sự thật thứ hai cho cùng một
 * việc, và hai nguồn thì sẽ có ngày nói khác nhau. Enum này chỉ mang những giá
 * trị có người GHI và có người ĐỌC.
 */
export class AddGroupMembershipStatus1795900000000 implements MigrationInterface {
  name = 'AddGroupMembershipStatus1795900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."group_membership_statuses_enum"
        AS ENUM ('ACTIVE', 'DISSOLVED')
    `);
    await queryRunner.query(`
      ALTER TABLE "group_memberships"
      ADD COLUMN IF NOT EXISTS "status"
        "public"."group_membership_statuses_enum" NOT NULL DEFAULT 'ACTIVE'
    `);

    // Nhóm đã giải tán TRƯỚC migration này: membership của chúng phải mang đúng
    // trạng thái ngay, không thì ràng buộc mới dưới đây vẫn khoá người ta lại.
    await queryRunner.query(`
      UPDATE "group_memberships" membership
      SET "status" = 'DISSOLVED'
      WHERE EXISTS (
        SELECT 1 FROM "groups" team
        WHERE team."global_id" = membership."group_id"
          AND (team."status" = 'DISSOLVED' OR team."deleted_at" IS NOT NULL)
      )
    `);

    // "Mỗi người một nhóm" → "mỗi người một membership ĐANG HIỆU LỰC".
    await queryRunner.query(`
      ALTER TABLE "group_memberships"
      DROP CONSTRAINT IF EXISTS "UQ_group_memberships_user"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_group_memberships_one_active_per_user"
      ON "group_memberships" ("user_id")
      WHERE "status" = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_group_memberships_group_status"
      ON "group_memberships" ("group_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Quay lại UNIQUE trần thì những dòng DISSOLVED trùng `user_id` sẽ chặn nó.
    // Giữ dòng ĐANG HIỆU LỰC, bỏ lịch sử — mất dữ liệu, nhưng `down` không có
    // đường nào khác và thà nói rõ ở đây hơn là để nó chết giữa chừng.
    await queryRunner.query(`
      DELETE FROM "group_memberships" WHERE "status" <> 'ACTIVE'
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_group_memberships_one_active_per_user"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_group_memberships_group_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "group_memberships"
      ADD CONSTRAINT "UQ_group_memberships_user" UNIQUE ("user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "group_memberships" DROP COLUMN IF EXISTS "status"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."group_membership_statuses_enum"
    `);
  }
}
