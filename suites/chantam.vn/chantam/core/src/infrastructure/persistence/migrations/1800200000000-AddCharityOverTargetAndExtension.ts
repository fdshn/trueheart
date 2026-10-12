import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cờ cho phép vượt mục tiêu, và lịch sử gia hạn chiến dịch (F65b §5, §8).
 *
 * ## `allow_over_target` — ở CHIẾN DỊCH, không ở dòng nhu cầu
 *
 * §5: *"Nếu số organizer chọn vượt phần còn thiếu và chiến dịch không cho vượt mục
 * tiêu, trả 409"*. Đặc tả đặt nó ở chiến dịch, nên cột ở chiến dịch. Mặc định `false`:
 * mọi chiến dịch đang có giữ đúng hành vi đã chạy (luôn chặn vượt).
 *
 * Cờ này CHỈ nới lượt chấp nhận đề nghị. Đóng góp ngoài app vốn không bao giờ bị chặn
 * vượt — đó là vật phẩm đã ở trong kho thật.
 *
 * ## `campaign_schedule_changes` — gia hạn có audit
 *
 * §8: *"cho phép gia hạn trước khi đóng và lưu audit thay đổi thời hạn"*. Một hàng cho
 * mỗi lần đổi, chỉ ghi thêm: trigger chặn `UPDATE` và `DELETE`, cùng lối các bảng audit
 * khác. CHECK chỉ cho DỜI RA SAU — rút ngắn thời hạn là một quyết định khác (nó có thể
 * đóng ngay một chiến dịch người ta đang tặng vào), và nó đi qua đường đóng.
 */
export class AddCharityOverTargetAndExtension1800200000000 implements MigrationInterface {
  name = 'AddCharityOverTargetAndExtension1800200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN IF NOT EXISTS "allow_over_target" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_schedule_changes" (
        "id" BIGSERIAL NOT NULL,
        "campaign_id" uuid NOT NULL,
        "previous_end_time" timestamptz NOT NULL,
        "new_end_time" timestamptz NOT NULL,
        "changed_by" uuid NOT NULL,
        "reason" varchar(500) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_schedule_changes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_campaign_schedule_changes_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id")
          -- RESTRICT chứ không CASCADE: CASCADE cộng trigger chặn DELETE là hai câu
          -- trái nhau, và lịch sử thời hạn không được biến mất theo một lệnh xoá.
          ON DELETE RESTRICT,
        CONSTRAINT "FK_campaign_schedule_changes_actor"
          FOREIGN KEY ("changed_by") REFERENCES "users"("global_id")
          ON DELETE RESTRICT,
        CONSTRAINT "CHK_campaign_schedule_changes_extends"
          CHECK ("new_end_time" > "previous_end_time")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_schedule_changes_campaign"
      ON "campaign_schedule_changes" ("campaign_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION campaign_schedule_changes_append_only()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'campaign_schedule_changes chi duoc ghi them';
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_campaign_schedule_changes_append_only"
      ON "campaign_schedule_changes"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_campaign_schedule_changes_append_only"
      BEFORE UPDATE OR DELETE ON "campaign_schedule_changes"
      FOR EACH ROW EXECUTE FUNCTION campaign_schedule_changes_append_only()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_schedule_changes"`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS campaign_schedule_changes_append_only()`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "allow_over_target"
    `);
  }
}
