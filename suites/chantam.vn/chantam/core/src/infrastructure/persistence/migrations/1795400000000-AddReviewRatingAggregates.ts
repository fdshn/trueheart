import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Điểm sao 1–5 thôi là dữ liệu chết — 29/09.
 *
 * Cả hai bên đều bị hỏi chấm 1–5 sau mỗi lượt trao hoàn tất, có cả ràng buộc
 * `CHECK (rating BETWEEN 1 AND 5)`, nhưng con số đó chỉ quay ra đúng một chỗ:
 * danh sách đánh giá của chính lượt trao đó. Không tổng hợp ở đâu — không hồ sơ
 * công khai, không hồ sơ riêng, không danh sách Admin. Nên câu hỏi "người này có
 * đáng tin không?" không có câu trả lời nào dựng từ nó, dù đã hỏi hàng nghìn lần.
 *
 * **Hai chỉ số, không phải một.** Vai của người ĐƯỢC đánh giá là vai đối lập với
 * người đánh giá:
 *
 * - `reviewer_role = 'RECEIVER'` → đang chấm người kia **với vai người tặng**
 * - `reviewer_role = 'GIVER'` → đang chấm người kia **với vai người nhận**
 *
 * Gộp hai cái thành một con số là trộn "có đáng xin nhận từ người này không" với
 * "có nên duyệt cho người này không" — hai câu hỏi khác nhau mà hai người khác
 * nhau đi tìm.
 *
 * `numeric(2,1)` chứ không phải số nguyên: thang 1–5 chỉ có năm bậc, làm tròn 4,4
 * thành 4 là bỏ mất gần một phần tư dải giá trị. Accuracy thì ngược lại — thang
 * phần trăm nên phần lẻ không thêm thông tin gì.
 */
export class AddReviewRatingAggregates1795400000000 implements MigrationInterface {
  name = 'AddReviewRatingAggregates1795400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "giver_rating_average" numeric(2,1),
        ADD COLUMN IF NOT EXISTS "giver_rating_samples" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "receiver_rating_average" numeric(2,1),
        ADD COLUMN IF NOT EXISTS "receiver_rating_samples" integer NOT NULL DEFAULT 0
    `);

    // Ràng buộc đi theo cột: một điểm trung bình ngoài thang 1–5 là lỗi tính
    // toán, và để nó vào được database là để một con số vô nghĩa hiện lên hồ sơ
    // công khai của người thật.
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_users_giver_rating_average"
          CHECK ("giver_rating_average" IS NULL
                 OR ("giver_rating_average" >= 1 AND "giver_rating_average" <= 5)),
        ADD CONSTRAINT "CHK_users_receiver_rating_average"
          CHECK ("receiver_rating_average" IS NULL
                 OR ("receiver_rating_average" >= 1 AND "receiver_rating_average" <= 5)),
        ADD CONSTRAINT "CHK_users_giver_rating_samples"
          CHECK ("giver_rating_samples" >= 0),
        ADD CONSTRAINT "CHK_users_receiver_rating_samples"
          CHECK ("receiver_rating_samples" >= 0)
    `);

    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES (
        'rating.display',
        '{"minSamples": 3}',
        'JSON', 1, 'PUBLISHED',
        'Số mẫu tối thiểu trước khi công bố điểm sao trung bình. Thấp hơn ngưỡng của accuracy.giver vì điểm sao là cảm nhận trải nghiệm, không phải cáo buộc mô tả sai, và không gắn cờ ai vào diện Admin xem xét'
      )
      ON CONFLICT DO NOTHING
    `);

    // Dựng lại chỉ số cho những đánh giá ĐÃ CÓ. Không backfill là để hàng nghìn
    // lượt chấm cũ nằm im trong bảng trong khi hồ sơ báo "chưa có đánh giá nào".
    //
    // Ngưỡng số mẫu KHÔNG áp ở đây: câu này ghi số liệu thô, còn việc công bố hay
    // trả `null` do `computeReviewRating` quyết lúc đọc. Nhét ngưỡng vào SQL là
    // đặt cùng một luật ở hai nơi, và chúng sẽ trôi khỏi nhau.
    await queryRunner.query(`
      UPDATE "users" person
      SET "giver_rating_average" = sample.average,
          "giver_rating_samples" = sample.samples
      FROM (
        SELECT "reviewee_id",
               ROUND(AVG("rating")::numeric, 1) AS average,
               COUNT(*) AS samples
        FROM "transaction_reviews"
        WHERE "reviewer_role" = 'RECEIVER'
        GROUP BY "reviewee_id"
      ) sample
      WHERE sample."reviewee_id" = person."global_id"
    `);

    await queryRunner.query(`
      UPDATE "users" person
      SET "receiver_rating_average" = sample.average,
          "receiver_rating_samples" = sample.samples
      FROM (
        SELECT "reviewee_id",
               ROUND(AVG("rating")::numeric, 1) AS average,
               COUNT(*) AS samples
        FROM "transaction_reviews"
        WHERE "reviewer_role" = 'GIVER'
        GROUP BY "reviewee_id"
      ) sample
      WHERE sample."reviewee_id" = person."global_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "system_configs" WHERE "config_key" = 'rating.display'
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "CHK_users_giver_rating_average",
        DROP CONSTRAINT IF EXISTS "CHK_users_receiver_rating_average",
        DROP CONSTRAINT IF EXISTS "CHK_users_giver_rating_samples",
        DROP CONSTRAINT IF EXISTS "CHK_users_receiver_rating_samples"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "giver_rating_average",
        DROP COLUMN IF EXISTS "giver_rating_samples",
        DROP COLUMN IF EXISTS "receiver_rating_average",
        DROP COLUMN IF EXISTS "receiver_rating_samples"
    `);
  }
}
