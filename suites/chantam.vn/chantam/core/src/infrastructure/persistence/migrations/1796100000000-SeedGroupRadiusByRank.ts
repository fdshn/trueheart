import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bán kính vùng nhóm THEO BẬC thứ hạng — chốt 30/09.
 *
 * Trước đó mọi nhóm dùng một con số chung (`group.default_radius_meters`), và
 * `18-group.md` mục 5 để ngỏ: *"bán kính khác nhau theo rank hay chung một con
 * số?"*. Câu trả lời là theo bậc.
 *
 * ## Vì sao KHÔNG đổi số của Kim Cương
 *
 * Hôm nay `CREATE_GROUP` chỉ mở cho Kim Cương (`capability_rank_values`), nên đó
 * là bậc DUY NHẤT thật sự tạo được nhóm. Đặt Kim Cương đúng 10.000 m — bằng giá
 * trị chung đang chạy — để việc bật cơ chế này KHÔNG âm thầm đổi vùng của nhóm
 * nào. Bốn bậc dưới có số sẵn để dùng ngay khi Bên A hạ ngưỡng tạo nhóm.
 *
 * ## Thang số là ĐỀ XUẤT, cần Bên A chốt
 *
 * Bên A chưa cho con số nào. Thang dưới đây chọn theo hai điều kiện đo được, chứ
 * không theo cảm giác:
 *
 * - **Đơn điệu tăng** theo bậc. Bậc cao hơn mà vùng hẹp hơn thì thăng bậc thành
 *   hình phạt.
 * - **Nằm trong 1.000–50.000 m**, tức cận của `CHK_groups_radius` (1–50 km). Ra
 *   ngoài là database từ chối ghi.
 *
 * | Bậc | Mét | Km |
 * | --- | --- | --- |
 * | Thành viên | 3.000 | 3 |
 * | Bạc | 5.000 | 5 |
 * | Vàng | 7.000 | 7 |
 * | Kim Cương | 10.000 | 10 |
 *
 * VIEWER không có dòng: họ chưa qua onboarding nên `assertOnboarded` chặn từ
 * trước, và seed một khoá không ai đọc là đúng thứ `test:config-inventory` bắt.
 *
 * ## Bán kính vẫn là SNAPSHOT
 *
 * Bậc dùng để tính là bậc TẠI THỜI ĐIỂM TẠO. Tụt bậc về sau không làm vùng nhóm
 * co lại, và lên bậc cũng không làm nó rộng ra (BR-GRP-03) — cho đổi thì người ta
 * dời vùng theo nơi đang có nhiều sự kiện để gom điểm affiliate.
 */
export class SeedGroupRadiusByRank1796100000000 implements MigrationInterface {
  name = 'SeedGroupRadiusByRank1796100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, meters] of RADIUS_BY_RANK)
      await queryRunner.query(
        `
          INSERT INTO "system_configs"
            ("config_key", "value_json", "value_type", "version", "status", "change_reason")
          VALUES ($1, $2::jsonb, 'INTEGER', 1, 'PUBLISHED', $3)
          ON CONFLICT DO NOTHING
        `,
        [
          key,
          JSON.stringify(meters),
          'Bán kính vùng nhóm theo bậc thứ hạng (18-group mục 5). Kim Cương giữ đúng 10000 m bằng giá trị chung đang chạy để không đổi vùng của nhóm nào; bốn bậc dưới là đề xuất thang đơn điệu tăng, cần Bên A chốt',
        ],
      );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = ANY($1)`,
      [RADIUS_BY_RANK.map(([key]) => key)],
    );
  }
}

/**
 * Khoá viết thẳng thành chuỗi, không gọi `groupRadiusConfigKeyForRank`: migration
 * phải chạy được với mã nguồn của TƯƠNG LAI, và một hàm đổi cách sinh khoá sẽ làm
 * migration cũ ghi vào chỗ khác với dữ liệu nó đã ghi lần đầu.
 */
const RADIUS_BY_RANK: readonly (readonly [string, number])[] = [
  ['group.radius_meters.member', 3_000],
  ['group.radius_meters.silver', 5_000],
  ['group.radius_meters.gold', 7_000],
  ['group.radius_meters.diamond', 10_000],
];
