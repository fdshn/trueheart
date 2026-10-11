import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cho bài Muốn Nhận một cái đồng hồ, 11/10 (CHỐT-10).
 *
 * Cùng hình với `1799300000000` — chỉ khác loại bài — và cùng hai nửa cố ý không
 * đối xứng. Viết riêng chứ không nới điều kiện của migration kia: nó đã chạy trên
 * staging, và sửa một migration đã chạy là một lượt không ai thấy.
 *
 * ## Vì sao bây giờ mới chạy được
 *
 * `1799300000000` cố ý **bỏ `WANTED` ra ngoài**, vì truy vấn tìm bài tới hạn không
 * lọc `post_type` và lấy `SELECT post.author_id AS giver_id`. Với bài Muốn Nhận, tác
 * giả là người muốn NHẬN — nên đặt hạn cho nó khi đó là để job tự dựng giao dịch với
 * hai vai ngược nhau.
 *
 * Vai nay suy từ `giftTransactionRoles`, một chỗ duy nhất, và `acceptRequest` TRẢ VỀ
 * vai đã phân giải để nơi gọi khỏi đoán lại. Nên cái đồng hồ này bật được.
 *
 * ## Cho hạn xét, KHÔNG rút hạn sống
 *
 * **Cho** `selection_deadline = created_at + 7 ngày` cho bài `WANTED` đang công khai
 * mà cột đó `NULL` — tức mọi bài `WANTED` hôm nay, vì tới trước lượt này không đường
 * nào đặt hạn cho chúng. Hạn tính ra ở quá khứ là ĐÚNG ý: bài đăng hai tháng trước
 * thì giai đoạn xét của nó đã qua thật, và auto-select nên xét nó ở lượt kế tiếp.
 *
 * **KHÔNG đụng `expires_at`.** Bài đang chạy được đăng dưới luật ba tháng; hạ xuống
 * 37 ngày là một lượt UPDATE làm hết hạn ngay mọi bài `WANTED` quá 37 ngày tuổi. Đó
 * không phải di trú, đó là xoá bài của người ta. Luật 37 ngày áp cho bài đăng TỪ ĐÂY,
 * qua `postExpiryDateFor`.
 *
 * **KHÔNG đụng bài đã CÓ hạn.** Không bài `WANTED` nào có hạn hôm nay, nên điều kiện
 * `IS NULL` hiện là dư. Giữ nó vì nó là thứ bảo vệ lượt chạy LẠI: migration chạy hai
 * lần không được dời hạn của bài mà lượt đầu vừa đặt.
 */
export class SelectionDeadlineForWantedPosts1799600000000 implements MigrationInterface {
  name = 'SelectionDeadlineForWantedPosts1799600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "posts"
      SET "selection_deadline" = "created_at" + interval '7 days'
      WHERE "post_type" = 'WANTED'
        AND "status" = 'PUBLISHED'
        AND "selection_deadline" IS NULL
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Gỡ hạn của bài Muốn Nhận đang công khai, đưa chúng về trạng thái "không có
    // đồng hồ nào" như trước 11/10. Chỉ gỡ hạn ở TƯƠNG LAI hoặc đúng bằng
    // `created_at + 7 ngày`: một hạn khác thế là do người hoặc đường khác đặt sau
    // đó, và `down` của một lượt di trú không được xoá thứ nó không tạo ra.
    await queryRunner.query(`
      UPDATE "posts"
      SET "selection_deadline" = NULL
      WHERE "post_type" = 'WANTED'
        AND "status" = 'PUBLISHED'
        AND "deleted_at" IS NULL
        AND "selection_deadline" = "created_at" + interval '7 days'
    `);
  }
}
