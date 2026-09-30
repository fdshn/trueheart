import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trưởng tổ nay xem được trang tổng quan nhóm — 30/09.
 *
 * ## Lỗ này chỉ hiện ra khi có endpoint để thử
 *
 * Bộ quyền seed ban đầu cho `MEMBER` mã `group.overview.view` nhưng KHÔNG cho
 * `SUBTEAM_ADMIN`. Trong khi trưởng tổ cũng là thành viên nhóm, và vai của họ là
 * mở RỘNG chứ không phải thay thế — nên họ mất một thứ mà thành viên thường có.
 *
 * Suốt ba tháng không ai thấy, vì `group.overview.view` không có dòng code nào
 * kiểm: một quyền không ai đọc thì thiếu hay đủ đều không khác gì. Đúng lúc
 * `GET /groups/:groupId` ra đời thì nó thành 403 ngay lượt gọi thật đầu tiên.
 *
 * Bài học cho lần sau: một quyền chưa ai kiểm cũng chưa ai BIẾT là đúng. Nên
 * `test:config-inventory` khai riêng nhóm "seed mà chưa ai kiểm" — danh sách đó
 * không phải chỗ cất quyền cho phép kiểm xanh, nó là danh sách những chỗ chưa
 * được chứng minh.
 *
 * ## Ghi thành PHIÊN BẢN mới, không sửa tại chỗ
 *
 * Đi qua đúng cơ chế `1796200000000` dựng: bộ đang hiệu lực là `MAX(version)` của
 * từng vai, dòng cũ ở lại. Sửa tại chỗ thì mất đường tra lại bộ nào đang chạy lúc
 * một trưởng tổ bị từ chối — mà đó chính là câu hỏi dẫn tới migration này.
 *
 * Câu dưới CỘNG thêm vào bộ đang hiệu lực chứ không ghi một danh sách cứng: nếu
 * Bên A đã sửa bộ quyền qua `PUT /admin/groups/role-permissions` trước khi
 * migration này chạy, ghi cứng sẽ xoá thay đổi của họ.
 */
export class GrantOverviewToSubTeamAdmin1796300000000 implements MigrationInterface {
  name = 'GrantOverviewToSubTeamAdmin1796300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH live AS (
        SELECT COALESCE(MAX("version"), 0) AS "version"
        FROM "group_role_permissions"
        WHERE "role" = 'SUBTEAM_ADMIN'
      ), current_set AS (
        SELECT grant_row."permission"
        FROM "group_role_permissions" grant_row, live
        WHERE grant_row."role" = 'SUBTEAM_ADMIN'
          AND grant_row."version" = live."version"
      ), next_set AS (
        SELECT "permission" FROM current_set
        WHERE "permission" <> '__none__'
        UNION
        SELECT 'group.overview.view'
      )
      INSERT INTO "group_role_permissions"
        ("role", "permission", "version", "change_reason")
      SELECT 'SUBTEAM_ADMIN', next_set."permission", live."version" + 1,
             'Trưởng tổ cũng là thành viên nhóm nên phải xem được trang tổng quan; bộ seed đầu cho MEMBER mã này mà bỏ sót SUBTEAM_ADMIN, và không ai thấy vì chưa có endpoint nào kiểm nó'
      FROM next_set, live
      -- Không làm gì nếu bộ đang hiệu lực ĐÃ có mã này: một phiên bản mới giống
      -- hệt phiên bản cũ chỉ làm lịch sử dài ra mà không nói thêm điều gì.
      WHERE NOT EXISTS (
        SELECT 1 FROM current_set
        WHERE current_set."permission" = 'group.overview.view'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Bỏ đúng phiên bản migration này tạo ra, nếu nó vẫn là bộ đang hiệu lực.
    await queryRunner.query(`
      DELETE FROM "group_role_permissions"
      WHERE "role" = 'SUBTEAM_ADMIN'
        AND "version" = (
          SELECT MAX("version") FROM "group_role_permissions"
          WHERE "role" = 'SUBTEAM_ADMIN'
        )
        AND EXISTS (
          SELECT 1 FROM "group_role_permissions" older
          WHERE older."role" = 'SUBTEAM_ADMIN'
            AND older."version" < (
              SELECT MAX("version") FROM "group_role_permissions"
              WHERE "role" = 'SUBTEAM_ADMIN'
            )
        )
    `);
  }
}
