import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Danh mục Ngày lễ Phật giáo theo Âm lịch (UC-LUNAR-01 bước 3, F46).
 *
 * ## Vì sao danh mục nằm ở backend
 *
 * Đặc tả nói client tự chuyển đổi ngày, nhưng *"đối chiếu với danh mục Ngày lễ Phật giáo
 * **chuẩn**"* thì danh mục đó phải có một nguồn. Nhúng vào app nghĩa là sửa một ngày lễ phải
 * chờ Store duyệt, và hai bản app đang chạy sẽ hiện hai danh mục khác nhau.
 *
 * ## Khoá là (tháng, ngày) âm lịch, không có năm
 *
 * Ngày lễ Phật giáo lặp theo âm lịch hằng năm — Phật Đản luôn 15/4, Vu Lan luôn 15/7. Lưu
 * kèm năm là lưu cùng một dòng 50 lần và mời một năm bị bỏ sót.
 *
 * `UQ_lunar_holidays_date` trên cặp đó: hai ngày lễ cùng một ngày âm lịch thì client không
 * biết hiện huy hiệu nào, và đó là lỗi dữ liệu chứ không phải lựa chọn.
 *
 * ## Không có cột `year` nghĩa là không có tháng nhuận
 *
 * Một ngày lễ rơi vào tháng nhuận là chuyện có thể bàn, nhưng danh mục chuẩn không có ca
 * đó: tháng nhuận là tháng LẶP LẠI, và lễ giữ ở tháng chính. Nên `lunar_month` ở đây luôn
 * là tháng chính, và `solarToLunar` trả `isLeapMonth` để bên đọc tự quyết nếu sau này cần.
 */
export class CreateLunarHolidays1797900000000 implements MigrationInterface {
  name = 'CreateLunarHolidays1797900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lunar_holidays" (
        "id" SERIAL NOT NULL,
        "lunar_month" smallint NOT NULL,
        "lunar_day" smallint NOT NULL,
        "name" varchar(150) NOT NULL,
        "description" varchar(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lunar_holidays" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lunar_holidays_date" UNIQUE ("lunar_month", "lunar_day"),
        CONSTRAINT "FK_lunar_holidays_editor"
          FOREIGN KEY ("updated_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_lunar_holidays_month"
          CHECK ("lunar_month" BETWEEN 1 AND 12),
        -- Tháng âm lịch có 29 hoặc 30 ngày; không bao giờ 31.
        CONSTRAINT "CHK_lunar_holidays_day"
          CHECK ("lunar_day" BETWEEN 1 AND 30)
      )
    `);

    /**
     * Danh mục chuẩn, seed sẵn và BẬT.
     *
     * Khác mọi policy khác trong repo — những cái đó seed TẮT vì chúng phát điểm hoặc đổi
     * hành vi, và một giá trị mặc định có tác dụng là tự quyết hộ Bên A. Ở đây ngược lại:
     * danh mục này chỉ để HIỂN THỊ, và một danh mục rỗng nghĩa là app không có huy hiệu
     * nào trong khi UC-LUNAR-01 gọi nó là "chức năng BẮT BUỘC trong Phase 1".
     *
     * Mười ngày dưới đây là các mốc phổ biến nhất của Phật giáo Bắc tông ở Việt Nam. Bên A
     * sửa được toàn bộ qua `PUT /admin/lunar-holidays`.
     */
    await queryRunner.query(`
      INSERT INTO "lunar_holidays"
        ("lunar_month", "lunar_day", "name", "description", "sort_order") VALUES
        (1, 1, 'Tết Nguyên Đán', 'Mùng Một Tết, đầu năm Âm lịch', 1),
        (1, 15, 'Rằm tháng Giêng (Tết Nguyên Tiêu)', 'Lễ Thượng Nguyên', 2),
        (2, 8, 'Phật Thích Ca xuất gia', NULL, 3),
        (2, 15, 'Phật Thích Ca nhập Niết Bàn', NULL, 4),
        (2, 19, 'Lễ Quán Thế Âm Bồ Tát đản sinh', NULL, 5),
        (4, 15, 'Đại lễ Phật Đản', 'Kỷ niệm Đức Phật Thích Ca đản sinh', 6),
        (6, 19, 'Lễ Quán Thế Âm Bồ Tát thành đạo', NULL, 7),
        (7, 15, 'Đại lễ Vu Lan Báo Hiếu', 'Lễ Trung Nguyên, mùa báo hiếu cha mẹ', 8),
        (9, 19, 'Lễ Quán Thế Âm Bồ Tát xuất gia', NULL, 9),
        (12, 8, 'Phật Thích Ca thành đạo', NULL, 10)
      ON CONFLICT ("lunar_month", "lunar_day") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_lunar_holidays_active"
        ON "lunar_holidays" ("lunar_month", "lunar_day")
        WHERE "is_active"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lunar_holidays_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lunar_holidays"`);
  }
}
