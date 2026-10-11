import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ chế độ `EXTENDED` và cho bài chưa có hạn một cái đồng hồ, 11/10 (CHỐT-10).
 *
 * ## Vì sao `EXTENDED` phải RA KHỎI enum, không chỉ thôi dùng
 *
 * Giữ nó lại thì nó vẫn là một giá trị hợp lệ mà database nhận, nên một client cũ
 * — hoặc một câu SQL tay — vẫn ghi được vào. Và từ 11/10 mã nguồn không còn nhánh
 * nào đọc nó: `selectionDeadlineFrom` trả 7 ngày cho mọi chế độ. Một giá trị ghi
 * được mà không nơi nào xử lý là đúng loại lỗi im lặng tệ nhất — nó không đổ ở
 * đâu, chỉ làm bài đó im lặng chạy theo luật của bài khác.
 *
 * `EXTENDED` → `OPTIMAL`, và bài đó **không bị ngắn đi**: trước nó chờ 30 ngày
 * xét, nay 7 ngày xét cộng 30 ngày mở rộng tự động.
 *
 * ## Backfill: CHO hạn xét, nhưng KHÔNG rút ngắn hạn sống
 *
 * Hai nửa, và hai nửa đó cố ý không đối xứng.
 *
 * **Cho `selection_deadline`** cho bài `OFFER` đang công khai mà cột đó là `NULL`.
 * Những bài này hôm nay **không có đồng hồ nào**: luật cũ chỉ đặt hạn khi có phản
 * hồi đầu tiên, nên bài không ai xin thì `NULL` vĩnh viễn — auto-select không bao
 * giờ xét tới, và nó chỉ chết ở mốc ba tháng. Cho chúng một cái hạn là thuần thêm
 * vào.
 *
 * Mốc đếm là `created_at`, không phải một cột `published_at` nào: bài lên thẳng
 * không chờ duyệt từ 26/09, nên với mọi bài sinh sau mốc đó `created_at` CHÍNH LÀ
 * lúc đăng. Dữ liệu cũ hơn từng qua hàng đợi duyệt sẽ có hạn tính sớm hơn thực tế,
 * tức rơi ngay vào giai đoạn mở rộng — chấp nhận được, và là phía an toàn: nó mở
 * rộng thời gian tìm người nhận chứ không đóng bài lại.
 *
 * **KHÔNG đụng `expires_at`.** Bài đang chạy được đăng dưới luật ba tháng; hạ
 * xuống 37 ngày là một lượt UPDATE làm hết hạn ngay lập tức mọi bài `OFFER` quá 37
 * ngày tuổi. Đó không phải di trú, đó là xoá bài của người ta. Luật 37 ngày vì vậy
 * áp cho bài đăng TỪ ĐÂY, qua `postExpiryDateFor` — bài cũ sống hết ba tháng đã
 * hứa với người đăng rồi mới theo luật mới ở lượt sau.
 *
 * **Và KHÔNG đụng bài đã CÓ `selection_deadline`.** Hạn đó do luật cũ đặt từ phản
 * hồi đầu tiên, nên nó muộn hơn luật mới. Tính lại sẽ dời hạn về quá khứ và
 * auto-select chốt người ngay lượt chạy kế tiếp — đổi kết quả của một cuộc xét
 * đang mở, sau lưng cả chủ bài lẫn các ứng viên.
 */
export class DropExtendedSelectionMode1799300000000 implements MigrationInterface {
  name = 'DropExtendedSelectionMode1799300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Gộp EXTENDED về OPTIMAL TRƯỚC khi đổi type, nếu không câu `USING` bên
    //    dưới gặp một giá trị không còn trong enum đích và cả migration đổ.
    await queryRunner.query(`
      UPDATE "posts" SET "selection_mode" = 'OPTIMAL'
      WHERE "selection_mode" = 'EXTENDED'
    `);

    // 2. Dựng lại type. `ALTER TYPE ... DROP VALUE` không tồn tại trong Postgres,
    //    nên đây là đường duy nhất. Phải bỏ DEFAULT trước: nó mang kiểu cũ, và
    //    `ALTER COLUMN TYPE` từ chối khi default còn trỏ type đang bị đổi.
    await queryRunner.query(`
      ALTER TABLE "posts" ALTER COLUMN "selection_mode" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."posts_selection_mode_enum"
        RENAME TO "posts_selection_mode_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."posts_selection_mode_enum"
        AS ENUM ('INSTANT', 'OPTIMAL')
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
        ALTER COLUMN "selection_mode" TYPE "public"."posts_selection_mode_enum"
        USING "selection_mode"::text::"public"."posts_selection_mode_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
        ALTER COLUMN "selection_mode" SET DEFAULT 'OPTIMAL'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."posts_selection_mode_enum_old"
    `);

    // 3. Cho bài OFFER đang công khai mà CHƯA có hạn xét một cái hạn.
    //    `GREATEST(..., now())` KHÔNG dùng ở đây: một hạn đã ở quá khứ là đúng ý —
    //    bài đăng hai tháng trước thì giai đoạn xét của nó đã qua thật, và
    //    auto-select nên xét nó ở lượt chạy kế tiếp chứ không phải chờ thêm 7 ngày.
    await queryRunner.query(`
      UPDATE "posts"
      SET "selection_deadline" = "created_at" + interval '7 days'
      WHERE "post_type" = 'OFFER'
        AND "status" = 'PUBLISHED'
        AND "selection_deadline" IS NULL
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dựng lại enum ba giá trị. KHÔNG phục hồi bài nào về `EXTENDED`: thông tin
    // đó đã mất ở bước `up`, và đoán lại là bịa. Cũng không xoá `selection_deadline`
    // vừa backfill — một cái hạn đã đặt có thể đã được hiện cho người dùng, và gỡ
    // nó đi đưa bài trở lại trạng thái "không có đồng hồ nào".
    await queryRunner.query(`
      ALTER TABLE "posts" ALTER COLUMN "selection_mode" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."posts_selection_mode_enum"
        RENAME TO "posts_selection_mode_enum_new"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."posts_selection_mode_enum"
        AS ENUM ('INSTANT', 'OPTIMAL', 'EXTENDED')
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
        ALTER COLUMN "selection_mode" TYPE "public"."posts_selection_mode_enum"
        USING "selection_mode"::text::"public"."posts_selection_mode_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "posts"
        ALTER COLUMN "selection_mode" SET DEFAULT 'OPTIMAL'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."posts_selection_mode_enum_new"
    `);
  }
}
