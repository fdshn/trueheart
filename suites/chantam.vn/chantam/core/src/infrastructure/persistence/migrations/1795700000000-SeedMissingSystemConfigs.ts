import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ba khoá cấu hình code ĐỌC mà chưa ai seed — 29/09.
 *
 * Mọi `normalize*` đều lùi về mặc định khi thiếu, nên tới giờ không có gì hỏng.
 * Nhưng hậu quả thật thì im lặng và cụ thể: **Admin mở trang cấu hình ra không thấy
 * ô nào để sửa.** Một ngưỡng chỉ tồn tại trong code là một ngưỡng phải deploy mới
 * đổi được — đúng thứ mà `system_configs` được dựng ra để tránh.
 *
 * Với `rank.points_source` thì nó nặng hơn thế: nguồn quyết hạng được làm thành cấu
 * hình động theo yêu cầu rõ ràng ngày 28/09, nghĩa là việc chuyển qua lại giữa
 * `BALANCE` và `LIFETIME` phải làm được từ CMS. Không có dòng thì tính năng đó không
 * với tới được, dù code đọc nó đúng.
 *
 * Giá trị seed = ĐÚNG mặc định trong code, nên migration này không đổi hành vi của
 * gì cả. Nó chỉ đưa ba con số từ trong code ra chỗ Admin sửa được.
 *
 * ## `selection.candidate_priority` CỐ Ý không seed
 *
 * Khoá đó cũng chưa có dòng nào, nhưng ở đó **sự vắng mặt chính là thông tin**:
 * `GET /admin/candidate-selection` trả kèm `isConfigured`, và nó tính bằng "có dòng
 * cấu hình hay không". Seed giá trị mặc định vào sẽ làm cờ đó thành `true` và nói
 * với Admin rằng đã có người đặt thứ tự này — trong khi thật ra chưa ai đặt.
 *
 * Mất một tín hiệu thật để thêm một dòng không cần thiết là đổi xấu. `PUT` đầu tiên
 * của Admin sẽ tự tạo version 1.
 */
export class SeedMissingSystemConfigs1795700000000 implements MigrationInterface {
  name = 'SeedMissingSystemConfigs1795700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES
        (
          'chat.retention',
          '{"value": 1, "unit": "WEEK"}',
          'JSON', 1, 'PUBLISHED',
          'Hạn lưu trữ lịch sử chat. Mốc xoá được CHỐT theo cấu hình lúc phòng khoá, nên đổi cấu hình sau đó không dịch mốc của những phòng đã khoá'
        ),
        (
          'rank.points_source',
          '{"source": "BALANCE"}',
          'JSON', 1, 'PUBLISHED',
          'Cột điểm quyết định thứ hạng. BALANCE = điểm tiêu được, nên tiêu điểm làm tụt hạng (chốt 24/09). LIFETIME = điểm tích luỹ, hạng là bằng ghi nhận đã đóng góp và không ai mất hạng vì đã tiêu điểm mình kiếm được'
        ),
        (
          'notification.retention',
          '{"retentionDays": 90}',
          'JSON', 1, 'PUBLISHED',
          'Hạn lưu trữ hộp thư. Cần dọn vì thông báo mang tiêu đề bài, tên người và đoạn đầu tin nhắn chat — xoá chat theo hạn xong mà để bản sao nằm trong hộp thư là một lỗ trong chính sách lưu trữ'
        )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "system_configs"
      WHERE "config_key" IN (
        'chat.retention',
        'rank.points_source',
        'notification.retention'
      )
    `);
  }
}
