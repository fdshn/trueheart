import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Một tên duy nhất cho trạng thái "kho đã cạn, lượt trao đang chạy" — 29/09.
 *
 * **Chốt: giữ `RESERVED`, bỏ `DELIVERING` khỏi trạng thái BÀI.** Trước đó là hai
 * tên cho cùng một nghĩa: `acceptRequest` ghi `DELIVERING` khi duyệt hết kho, còn
 * `syncPostStatus` suy ra `RESERVED`. Mọi chỗ ĐỌC vì thế phải kiểm cả hai
 * (`post-edit-policy`, `lock-editable-post`, `delete-post`, `update-post`,
 * `QuotaStatuses`), và chỗ nào quên một tên là một lỗ thật — đã xảy ra: bài bị
 * đẩy sang `DELIVERING` không bao giờ được `syncPostStatus` suy lại, nên tác giả
 * mất vĩnh viễn một suất đăng bài.
 *
 * `DELIVERING` của LƯỢT TRAO (`gift_transactions.status`) là chuyện khác và giữ
 * nguyên: ở đó nó có nghĩa riêng — người tặng đã bàn giao, người nhận chưa xác
 * nhận.
 *
 * Giá trị `DELIVERING` vẫn để lại trong `gift_posts_status_enum`. Gỡ một giá trị
 * enum đang được cột dùng đòi dựng lại cả type, mà đổi lấy một chỗ dọn hình thức
 * thì không đáng: sau migration này không đường nào ghi ra nó nữa, và
 * `syncPostStatus` vẫn nhận `DELIVERING` như một lưới hứng nếu có dòng sót.
 */
export class UnifyReservedPostStatus1795200000000 implements MigrationInterface {
  name = 'UnifyReservedPostStatus1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Suy lại trạng thái đúng theo cùng một luật mà `syncPostStatus` dùng, chứ
    // không đổi phẳng DELIVERING → RESERVED. Một bài đang DELIVERING mà lượt trao
    // đã xong hết thì đáng ra là COMPLETED — đổi phẳng sẽ đóng băng nó ở RESERVED
    // và tiếp tục ăn quota của tác giả, tức chỉ đổi tên cho đúng cái lỗi cũ.
    await queryRunner.query(`
      UPDATE "posts" p
      SET "status" = CASE
            WHEN p."remaining_quantity" > 0 THEN 'PUBLISHED'
            WHEN EXISTS (
              SELECT 1 FROM "gift_transactions" t
              WHERE t."post_id" = p."global_id"
                AND t."status" IN ('ACCEPTED', 'DELIVERING')
            ) THEN 'RESERVED'
            ELSE 'COMPLETED'
          END::gift_posts_status_enum,
          "updated_at" = now()
      WHERE p."status" = 'DELIVERING'
    `);
  }

  public async down(): Promise<void> {
    // Không đảo. Sau khi đã suy lại, không còn cách nào biết bài nào TRƯỚC ĐÓ
    // mang tên `DELIVERING` — và đổi ngược một tên đã bị loại bỏ thì cũng chỉ
    // dựng lại đúng cái mơ hồ vừa dọn.
  }
}
