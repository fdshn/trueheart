import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chuyển tuỳ chọn tắt thông báo từ 4 nhóm sang 8 nhóm, 11/10 (`BR-NOTI-01`).
 *
 * ## Vì sao KHÔNG thể bỏ qua lượt di trú này
 *
 * `listMutedGroups` lọc giá trị lạ qua enum, nên không di trú thì không có gì
 * **đổ** — bốn tên nhóm cũ chỉ lặng lẽ bị bỏ qua. Hậu quả: người đã tắt nhóm bỗng
 * nhận lại đúng những thông báo họ đã tắt, và không ai thấy gì sai ở log.
 *
 * Đó là chiều tệ hơn trong hai chiều. Thông báo bất ngờ là thứ làm người ta tắt
 * thông báo ở mức HỆ ĐIỀU HÀNH — rồi mất luôn `GIFT_REQUEST_ACCEPTED`. Còn thiếu
 * một thông báo thì họ vẫn thấy nó trong hộp thư.
 *
 * ## Ánh xạ, và chỗ KHÔNG đối xứng
 *
 * ```text
 * TRANSACTION → STATUS                                   (phủ khít)
 * CHAT        → CONTACT                                   (phủ khít)
 * FEED        → CONTACT                                   (phủ khít, nhưng GỘP)
 * SYSTEM      → POINT, EVENT, REWARD, WARNING, CONDITION   (phủ khít, TÁCH 5)
 * ```
 *
 * **`SYSTEM` tách thành NĂM dòng.** Nhóm cũ đó gom hạng, nhắc hẹn, kết luận báo
 * xấu, hậu kiểm và lịch âm. Một dòng không thể thành năm cái công tắc, nên phải
 * chèn đủ năm: ai đã tắt `SYSTEM` thì đã tắt đúng tập loại đó, và tắt cả năm nhóm
 * kế nhiệm giữ nguyên **chính xác** tập loại bị im lặng. Chỉ chèn một nhóm là bật
 * lại bốn phần họ đã tắt.
 *
 * **`CHAT` và `FEED` gộp vào một.** Phân loại của SRS không có chỗ nào khác cho
 * "có người bình luận vào bài của bạn" ngoài *Liên lạc*. Nên ai đã tắt MỘT trong
 * hai sẽ thấy `CONTACT` tắt — tức có thể mất thêm phần họ chưa tắt. `ON CONFLICT
 * DO NOTHING` làm đúng việc đó: tắt-thắng. Đây là mất mát thật của việc đổi sang
 * tám nhóm, và nó được chọn thay vì chiều ngược lại.
 *
 * Cột `notification_group` là `varchar(32)`, không phải enum Postgres — nên đây
 * thuần là di trú DỮ LIỆU, không đụng schema.
 */
export class ExpandNotificationGroupsToEight1799400000000 implements MigrationInterface {
  name = 'ExpandNotificationGroupsToEight1799400000000';

  /** Ánh xạ cũ → mới. Một nguồn duy nhất cho cả `up` lẫn `down`. */
  private static readonly Forward: readonly [string, readonly string[]][] = [
    ['TRANSACTION', ['STATUS']],
    ['CHAT', ['CONTACT']],
    ['FEED', ['CONTACT']],
    ['SYSTEM', ['POINT', 'EVENT', 'REWARD', 'WARNING', 'CONDITION']],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [
      legacy,
      targets,
    ] of ExpandNotificationGroupsToEight1799400000000.Forward) {
      // Chèn TRƯỚC rồi xoá sau, trong cùng transaction của TypeORM. Xoá trước thì
      // một lượt chạy bị ngắt giữa đường để lại người dùng KHÔNG còn tuỳ chọn nào
      // — tức bật lại mọi thứ họ đã tắt.
      await queryRunner.query(
        `
          INSERT INTO "notification_mutes" ("user_id", "notification_group", "muted_at")
          SELECT old."user_id", target."name", old."muted_at"
          FROM "notification_mutes" old
          CROSS JOIN unnest($2::text[]) AS target("name")
          WHERE old."notification_group" = $1
          ON CONFLICT ("user_id", "notification_group") DO NOTHING
        `,
        [legacy, targets],
      );
      await queryRunner.query(
        `DELETE FROM "notification_mutes" WHERE "notification_group" = $1`,
        [legacy],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Gộp ngược: nhóm cũ bị tắt nếu BẤT KỲ nhóm kế nhiệm nào đang tắt. Không
    // dựng lại được trạng thái gốc — `up` đã làm mất thông tin "người này tắt
    // CHAT nhưng không tắt FEED" — nên đây là xấp xỉ theo phía im lặng, cùng
    // hướng với `up`, và nói rõ ở đây chứ không để ai tưởng là khôi phục.
    for (const [
      legacy,
      targets,
    ] of ExpandNotificationGroupsToEight1799400000000.Forward) {
      await queryRunner.query(
        `
          INSERT INTO "notification_mutes" ("user_id", "notification_group", "muted_at")
          SELECT DISTINCT cur."user_id", $1, min(cur."muted_at") OVER (PARTITION BY cur."user_id")
          FROM "notification_mutes" cur
          WHERE cur."notification_group" = ANY($2::text[])
          ON CONFLICT ("user_id", "notification_group") DO NOTHING
        `,
        [legacy, targets],
      );
    }

    await queryRunner.query(
      `
        DELETE FROM "notification_mutes"
        WHERE "notification_group" = ANY($1::text[])
      `,
      [
        [
          'GUIDE',
          'POINT',
          'EVENT',
          'STATUS',
          'REWARD',
          'WARNING',
          'CONTACT',
          'CONDITION',
        ],
      ],
    );
  }
}
