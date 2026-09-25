import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nền cho Group, Sub-team và membership (F51–F55, BR-GRP).
 *
 * **Tâm và bán kính là SNAPSHOT, Owner không đổi được.** Cho đổi thì người ta
 * dời vùng theo nơi đang có nhiều sự kiện để gom điểm affiliate. Snapshot cũng
 * không đổi theo khi Owner đổi Default Location hoặc tụt rank (BR-GRP-03) — nên
 * hai cột này là bản sao, không phải khoá ngoại.
 *
 * **Mỗi người tối đa MỘT membership.** Ràng buộc UNIQUE trên `user_id`, không
 * phải trên `(group_id, user_id)`: cái sau chỉ chặn vào cùng một nhóm hai lần,
 * còn cái này mới thật sự chặn một người thuộc hai nhóm.
 *
 * **Không rời, không chuyển** (BR-GRP-06, xác nhận lại 2026-09-24). Nên không có
 * cột `left_at` và không có trạng thái `LEFT`: thêm chúng là mở một đường mà đặc
 * tả cố ý đóng, và ai đó sẽ dùng.
 */
export class CreateGroups1793700000000 implements MigrationInterface {
  name = 'CreateGroups1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."groups_status_enum" AS ENUM ('ACTIVE', 'DISSOLVED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."group_member_roles_enum"
        AS ENUM ('OWNER', 'SUBTEAM_ADMIN', 'MEMBER')
    `);

    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "owner_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "description" varchar(1000),
        "avatar_url" varchar(500),
        "cover_url" varchar(500),
        -- Bản sao Default Location của Owner lúc tạo, KHÔNG phải tham chiếu.
        "center_location" geography(Point, 4326) NOT NULL,
        "region_label" varchar(200) NOT NULL,
        "radius_km" integer NOT NULL,
        -- Link mời không tự hết hạn và không giới hạn lượt (BR-GRP-04). Nó chỉ
        -- ngừng dùng được khi nhóm rời khỏi ACTIVE.
        "invite_code" varchar(32) NOT NULL,
        "status" "public"."groups_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "activated_at" timestamptz NOT NULL DEFAULT now(),
        "dissolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_groups" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_groups_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_groups_invite_code" UNIQUE ("invite_code"),
        CONSTRAINT "FK_groups_owner"
          FOREIGN KEY ("owner_id") REFERENCES users("global_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_groups_radius" CHECK ("radius_km" BETWEEN 1 AND 50),
        -- DISSOLVED thì bắt buộc có mốc giải tán, và ngược lại. Thiếu mốc là một
        -- nhóm đã chết mà không ai biết chết lúc nào.
        CONSTRAINT "CHK_groups_dissolved_at" CHECK (
          ("status" = 'DISSOLVED') = ("dissolved_at" IS NOT NULL)
        )
      )
    `);
    // Mỗi người sở hữu tối đa MỘT nhóm còn sống (BR-GRP-01). Index một phần vì
    // nhóm đã giải tán không nên chặn người đó lập nhóm mới.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_groups_one_active_per_owner"
      ON "groups" ("owner_id")
      WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_groups_center_location"
      ON "groups" USING GIST ("center_location")
    `);

    await queryRunner.query(`
      CREATE TABLE "sub_teams" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "group_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_sub_teams" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sub_teams_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_sub_teams_group"
          FOREIGN KEY ("group_id") REFERENCES "groups"("global_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "group_memberships" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "group_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "sub_team_id" uuid,
        "role" "public"."group_member_roles_enum" NOT NULL DEFAULT 'MEMBER',
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_group_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_group_memberships_global_id" UNIQUE ("global_id"),
        -- Trên user_id, KHÔNG phải (group_id, user_id): cái sau chỉ chặn vào
        -- cùng một nhóm hai lần, cái này mới chặn thuộc hai nhóm.
        CONSTRAINT "UQ_group_memberships_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_group_memberships_group"
          FOREIGN KEY ("group_id") REFERENCES "groups"("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_memberships_user"
          FOREIGN KEY ("user_id") REFERENCES users("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_memberships_sub_team"
          FOREIGN KEY ("sub_team_id") REFERENCES "sub_teams"("global_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_group_memberships_group_role"
      ON "group_memberships" ("group_id", "role")
    `);

    await queryRunner.query(`
      CREATE TABLE "group_role_permissions" (
        "id" BIGSERIAL NOT NULL,
        "role" "public"."group_member_roles_enum" NOT NULL,
        "permission" varchar(100) NOT NULL,
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_group_role_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_group_role_permissions" UNIQUE ("role", "permission"),
        CONSTRAINT "FK_group_role_permissions_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES users("global_id") ON DELETE SET NULL
      )
    `);

    // Bộ quyền khởi tạo. Admin hệ thống sửa được lúc chạy.
    //
    // Cố ý TÁCH khỏi `admin_permissions`: RBAC Admin là toàn cục
    // (`hasPermission(userId, 'x')` không có chiều phạm vi), nên gán
    // `group.member.remove` ở đó cho một trưởng nhóm là cho họ quyền trên MỌI
    // nhóm trong hệ thống.
    await queryRunner.query(`
      INSERT INTO "group_role_permissions" ("role", "permission") VALUES
        ('OWNER', 'group.overview.view'),
        ('OWNER', 'group.member.view'),
        ('OWNER', 'group.member.assign_role'),
        ('OWNER', 'group.subteam.manage'),
        ('OWNER', 'group.invite.view'),
        ('OWNER', 'group.activity.view'),
        ('OWNER', 'group.affiliate.view'),
        ('OWNER', 'group.settings.manage'),
        -- Trưởng nhóm con chỉ thấy tổ mình. KHÔNG có affiliate toàn nhóm, không
        -- tạo sub-team, không quản lý link mời, không đổi cài đặt (BR-GRP-05).
        ('SUBTEAM_ADMIN', 'group.subteam.member.view'),
        ('SUBTEAM_ADMIN', 'group.subteam.activity.view'),
        -- Thành viên thường: chỉ xem trang nhóm.
        ('MEMBER', 'group.overview.view')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "group_role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "group_memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sub_teams"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "groups"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."group_member_roles_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."groups_status_enum"`,
    );
  }
}
