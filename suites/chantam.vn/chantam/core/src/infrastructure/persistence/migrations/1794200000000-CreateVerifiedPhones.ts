import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lịch sử số điện thoại đã từng xác minh — sống lâu hơn tài khoản.
 *
 * **Vì sao cần một bảng riêng thay vì chỉ dựa vào `users.phone`.** Gỡ số khỏi
 * hồ sơ (`PATCH /profile/me` với `phone: null`) và xoá tài khoản
 * (`DELETE /auth/account` đặt `phone = null`) đều TRẢ LẠI số cho người khác
 * dùng, vì phép kiểm trùng chỉ nhìn giá trị hiện tại. Nên một SIM quay vòng
 * được vô hạn: xác minh, ăn 28đ, xong onboarding lấy 224đ, kích hoạt thưởng
 * giới thiệu cho người mời, gỡ số, tạo tài khoản mới, lặp lại.
 *
 * **Vì sao lưu BĂM chứ không lưu số.** Bảng này cố ý sống lâu hơn tài khoản —
 * kể cả tài khoản đã xoá. Giữ số ở dạng đọc được là giữ lại đúng thứ người ta
 * vừa yêu cầu xoá. Băm HMAC đủ để so trùng mà không đọc ngược ra được nếu
 * không có khoá.
 *
 * `released_at` là van xả cho Admin: mất điện thoại, mất tài khoản, số bị thu
 * hồi và cấp lại cho người khác — những chuyện có thật. Index UNIQUE một phần
 * chỉ áp cho hàng CHƯA giải phóng.
 */
export class CreateVerifiedPhones1794200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "verified_phones" (
        "id" SERIAL NOT NULL,
        "phone_hash" char(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "verified_at" timestamptz NOT NULL DEFAULT now(),
        "released_at" timestamptz,
        "released_by" uuid,
        "release_reason" text,
        CONSTRAINT "PK_verified_phones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_verified_phones_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_verified_phones_released_by"
          FOREIGN KEY ("released_by") REFERENCES "users"("global_id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_verified_phones_active"
      ON "verified_phones" ("phone_hash") WHERE "released_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_verified_phones_user"
      ON "verified_phones" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "verified_phones"`);
  }
}
