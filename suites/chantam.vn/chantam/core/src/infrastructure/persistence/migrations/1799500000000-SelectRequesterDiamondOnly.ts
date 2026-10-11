import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `SELECT_REQUESTER` thành cổng chỉ Kim Cương, 11/10 (CHỐT-10).
 *
 * ## Hai thứ sai cùng lúc trước lượt này
 *
 * **Một:** capability này seed `allowed = true` từ bậc Thành viên trở lên, trong khi
 * CHỐT-10 nói *"chủ bài hạng Kim Cương được chọn tay đối tác giao dịch. Chủ bài dưới
 * Kim Cương không có quyền chọn tay"*.
 *
 * **Hai, và nặng hơn:** **không chỗ nào đọc nó.** `AcceptGiftRequestUseCase` và
 * `BatchAcceptRequestsUseCase` chỉ kiểm "có phải chủ bài không", nên tới 10/10 **mọi**
 * chủ bài đều chọn tay được, kể cả Người xem. Capability này nằm trong
 * `DeclaredButUnread` của `test:entitlement-inventory` với đúng lý do đó.
 *
 * Nên lượt này làm cả hai: đặt lại `allowed` theo CHỐT-10, và mã bắt đầu đọc nó.
 *
 * ## Vì sao `limit_value` về 0
 *
 * Hạn mức cũ là 1/3/5/10 theo bậc, và ghi chú ở `CapabilityKindByCode` nói thẳng vấn
 * đề: **không ai biết đơn vị của con số đó** — mỗi bài được chọn mấy người, hay mỗi
 * ngày? Vì không ai đọc nó nên câu hỏi chưa bao giờ phải trả lời.
 *
 * CHỐT-10 trả lời bằng cách làm câu hỏi biến mất: nó cấp hoặc không cấp **quyền**, và
 * không nói con số nào. Tức đây là `GATE`, không phải quota — nên 1/3/5/10 là một ô
 * Admin sửa được mà không ai đọc, đúng kiểu "cái núm không làm gì" mà
 * `test:entitlement-inventory` được dựng ra để bắt. Đặt về 0 cho mọi bậc.
 *
 * Nếu sau này Bên A muốn một trần thật ("mỗi bài chọn tay tối đa N người"), đó là một
 * quyết định mới cần ghi lại, không phải phục hồi một con số cũ không ai hiểu.
 *
 * ## Không đụng revision nào khác
 *
 * `capability_rank_values` treo theo `policy_id`, và `capability_policies` treo theo
 * `revision`. Câu dưới chỉ sửa bản revision **đang hiệu lực**; các bản cũ giữ nguyên
 * để lịch sử còn đọc được.
 */
export class SelectRequesterDiamondOnly1799500000000 implements MigrationInterface {
  name = 'SelectRequesterDiamondOnly1799500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "capability_rank_values" value
      SET "allowed" = (value."rank" = 'DIAMOND'),
          "limit_value" = 0
      WHERE value."policy_id" IN (
        SELECT policy."id"
        FROM "capability_policies" policy
        JOIN "config_revisions" revision
          ON revision."id" = policy."revision_id"
        WHERE policy."code" = 'SELECT_REQUESTER'
          AND revision."scope" = 'ENTITLEMENT'
          AND revision."status" = 'PUBLISHED'
          AND revision."effective_from" <= now()
          AND (revision."effective_to" IS NULL
               OR revision."effective_to" > now())
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Phục hồi đúng bộ số của `1790100000000`: Người xem bị chặn, các bậc còn lại
    // được phép với hạn mức 1/3/5/10. Ghi lại rõ là bộ số đó KHÔNG có đơn vị xác
    // định — đây là phục hồi hình dữ liệu cũ, không phải phục hồi một quy tắc đúng.
    await queryRunner.query(`
      UPDATE "capability_rank_values" value
      SET "allowed" = (value."rank" <> 'VIEWER'),
          "limit_value" = CASE value."rank"
            WHEN 'VIEWER' THEN 0
            WHEN 'MEMBER' THEN 1
            WHEN 'SILVER' THEN 3
            WHEN 'GOLD' THEN 5
            WHEN 'DIAMOND' THEN 10
          END
      WHERE value."policy_id" IN (
        SELECT policy."id"
        FROM "capability_policies" policy
        JOIN "config_revisions" revision
          ON revision."id" = policy."revision_id"
        WHERE policy."code" = 'SELECT_REQUESTER'
          AND revision."scope" = 'ENTITLEMENT'
          AND revision."status" = 'PUBLISHED'
          AND revision."effective_from" <= now()
          AND (revision."effective_to" IS NULL
               OR revision."effective_to" > now())
      )
    `);
  }
}
