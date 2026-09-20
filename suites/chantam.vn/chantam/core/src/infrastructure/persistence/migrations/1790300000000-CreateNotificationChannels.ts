import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationChannels1790300000000 implements MigrationInterface {
  name = 'CreateNotificationChannels1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Một dòng cho mỗi kênh gửi. Secret nằm ở `secret_encrypted` dạng
    // ciphertext AES-256-GCM — database KHÔNG bao giờ giữ bản rõ, và API chỉ
    // trả về trạng thái đã cấu hình hay chưa.
    await queryRunner.query(`
      CREATE TABLE "notification_channels" (
        "channel" varchar(20) NOT NULL,
        "provider" varchar(50) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "from_address" varchar(255),
        "from_name" varchar(150),
        "host" varchar(255),
        "port" integer,
        "username" varchar(255),
        "secret_encrypted" text,
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_channels" PRIMARY KEY ("channel"),
        CONSTRAINT "FK_notification_channels_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_notification_channels_channel"
          CHECK ("channel" IN ('EMAIL', 'SMS', 'ZALO')),
        CONSTRAINT "CHK_notification_channels_port"
          CHECK ("port" IS NULL OR ("port" > 0 AND "port" <= 65535)),
        -- Bật được thì phải có đủ thứ để gửi. Nếu không, bật lên rồi mới phát
        -- hiện thiếu host là đã hứa với người dùng là sẽ gửi.
        CONSTRAINT "CHK_notification_channels_ready"
          CHECK ("enabled" = false OR "secret_encrypted" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      INSERT INTO "notification_channels" ("channel", "provider", "enabled")
      VALUES
        ('EMAIL', 'SMTP', false),
        ('SMS', 'UNSET', false),
        ('ZALO', 'ZALO_ZNS', false)
    `);

    await queryRunner.query(`
      INSERT INTO "admin_permissions" ("code", "description")
      VALUES ('notification.manage', 'Cấu hình kênh gửi email/SMS/Zalo')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "admin_roles" role
      CROSS JOIN "admin_permissions" permission
      WHERE role."code" = 'SUPER_ADMIN'
        AND permission."code" = 'notification.manage'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "admin_permissions" WHERE "code" = 'notification.manage'
      )
    `);
    await queryRunner.query(
      `DELETE FROM "admin_permissions" WHERE "code" = 'notification.manage'`,
    );
    await queryRunner.query(`DROP TABLE "notification_channels"`);
  }
}
