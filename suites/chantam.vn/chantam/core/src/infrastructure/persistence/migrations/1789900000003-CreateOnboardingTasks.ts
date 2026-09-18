import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOnboardingTasks1789900000003 implements MigrationInterface {
  name = 'CreateOnboardingTasks1789900000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "onboarding_tasks" (
        "id" SERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "key" varchar(100) NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "evidence_type" varchar(100) NOT NULL,
        "required" boolean NOT NULL DEFAULT true,
        "active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_onboarding_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_onboarding_tasks_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_onboarding_tasks_key" UNIQUE ("key")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_onboarding_tasks_active_sort_order"
      ON "onboarding_tasks" ("active", "sort_order")
    `);
    await queryRunner.query(`
      CREATE TABLE "user_onboarding_task_completions" (
        "id" SERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "task_id" uuid NOT NULL,
        "completed_at" timestamptz NOT NULL DEFAULT now(),
        "evidence_ref" varchar(500),
        CONSTRAINT "PK_user_onboarding_task_completions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_onboarding_task_completions" UNIQUE ("user_id", "task_id"),
        CONSTRAINT "FK_user_onboarding_task_completions_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_onboarding_task_completions_task"
          FOREIGN KEY ("task_id") REFERENCES "onboarding_tasks"("global_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_onboarding_task_completions_user"
      ON "user_onboarding_task_completions" ("user_id")
    `);
    await queryRunner.query(`
      INSERT INTO "onboarding_tasks" (
        "global_id", "key", "title", "description", "evidence_type", "required", "active", "sort_order"
      ) VALUES
        ('40000000-0000-4000-8000-000000000001', 'PROFILE_COMPLETE', 'Hoàn thiện hồ sơ', 'Cập nhật họ tên, ảnh đại diện, email và số điện thoại.', 'PROFILE_COMPLETE', true, true, 1),
        ('40000000-0000-4000-8000-000000000002', 'PHONE_VERIFIED', 'Xác thực số điện thoại', 'Xác nhận số điện thoại bằng mã OTP.', 'PHONE_VERIFIED', true, true, 2)
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_onboarding_task_completions"`);
    await queryRunner.query(`DROP TABLE "onboarding_tasks"`);
  }
}
