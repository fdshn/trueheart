import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ba ngưỡng đưa người giới thiệu vào diện Admin xem xét, 01/10.
 *
 * ## Vì sao seed mà hai vế lọc đều TẮT
 *
 * Hai cột `referrals.signup_ip_hash` / `signup_device_hash` chỉ bắt đầu được ghi từ
 * 30/09, nên trước đó không dòng nào có giá trị và **chưa ai biết "bình thường" trông
 * như thế nào**. Một ngưỡng chọn hôm nay là phỏng đoán mặc áo chính sách, và nó sẽ
 * sai theo hướng tệ nhất: hoặc không bao giờ nổ, hoặc nổ với mọi người.
 *
 * Nhưng KHÔNG seed thì tệ hơn hẳn: Admin mở trang cấu hình ra và không có ô nào để
 * sửa, nên "cấu hình động" thành ra phải deploy mới đổi được — đúng thứ
 * `test:config-inventory` sinh ra để bắt. Seed với giá trị tắt là cách duy nhất cho
 * cái núm hiện ra mà không bật một con số chưa ai có cơ sở để chọn.
 *
 * `review_min_qualified = 5` thì KHÔNG phải phỏng đoán theo cùng nghĩa — nó là sàn
 * mẫu, cùng vai với `minReports` của `report.abuse`, và chỉ có tác dụng khi một trong
 * hai vế kia được bật.
 *
 * ## Vì sao ba dòng INTEGER chứ không một dòng JSON
 *
 * `POST /admin/system-configs` hiện chỉ nhận `valueType: INTEGER`. Một khoá hình JSON
 * thì seed được, đọc được, mà **không ai sửa được qua API** — chỉ còn SQL tay. Đo
 * được 01/10: bản đầu dùng một khoá JSON và lượt bật ngưỡng trả *"valueType hiện chỉ
 * hỗ trợ INTEGER"*. Ba dòng cũng đúng lối `group.radius_meters.*` đã dùng.
 *
 * ## Chọn ngưỡng như thế nào khi đã có dữ liệu
 *
 * Nhìn phân bố thật sau vài tuần rồi chọn theo phân vị, đừng chọn theo cảm giác.
 * `GET /admin/referrals/review` trả kèm `threshold` nên lúc đó so được ngay.
 */
export class SeedReferralAbuseConfig1796800000000 implements MigrationInterface {
  name = 'SeedReferralAbuseConfig1796800000000';

  private static readonly Keys: readonly [string, number, string][] = [
    [
      'referral.review_min_qualified',
      5,
      'Sàn mẫu: dưới mức này thì cụm trùng không nói lên gì — hai người được mời cùng một máy gần như luôn là vợ chồng hoặc hai người bạn',
    ],
    [
      'referral.review_min_device_clusters',
      0,
      'Số cụm THIẾT BỊ trùng để vào diện xem xét. 0 = TẮT, có chủ đích: dấu vết mới ghi từ 30/09 nên chưa có dữ liệu để chọn ngưỡng. Cần Bên A chốt sau khi nhìn phân bố thật',
    ],
    [
      'referral.review_min_cluster_size',
      0,
      'Cụm lớn nhất từ bao nhiêu người thì vào diện xem xét. 0 = TẮT, cùng lý do khoá trên. Tách khỏi SỐ cụm vì "ba cụm mỗi cụm hai người" và "một cụm mười một người" là hai hình dạng rất khác nhau',
    ],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [
      key,
      value,
      reason,
    ] of SeedReferralAbuseConfig1796800000000.Keys)
      await queryRunner.query(
        `
          INSERT INTO "system_configs"
            ("config_key", "value_json", "value_type", "version", "status", "change_reason")
          VALUES ($1, $2::jsonb, 'INTEGER', 1, 'PUBLISHED', $3)
          ON CONFLICT DO NOTHING
        `,
        [key, JSON.stringify(value), reason],
      );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = ANY($1)`,
      [SeedReferralAbuseConfig1796800000000.Keys.map(([key]) => key)],
    );
  }
}
