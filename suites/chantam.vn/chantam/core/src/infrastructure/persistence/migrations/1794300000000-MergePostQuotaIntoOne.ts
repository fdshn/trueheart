import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gộp `POST_OFFER` và `POST_WANTED` thành một hạn mức `POST_OPEN`.
 *
 * Hai capability đó trông như hai rổ riêng, mỗi cái một bộ số theo hạng. Nhưng
 * phép đếm trong `createPostWithinQuota` là MỌI bài đang mở, bất kể loại, rồi
 * so với con số của loại đang đăng. Tức một rổ chung, đo bằng cái thước của
 * loại đang đăng.
 *
 * Hôm nay hai số bằng nhau nên không ai thấy gì. Đặt lệch đi là ra kết quả khó
 * đoán: với `POST_WANTED=10`, `POST_OFFER=3` và 5 bài OFFER đang mở, người dùng
 * đăng WANTED được (5 < 10) mà đăng OFFER không (5 >= 3). Admin chỉnh theo trực
 * giác sẽ nhận một hành vi không giải thích được.
 *
 * Chép số từ `POST_OFFER` ĐANG CÓ chứ không từ hằng số gốc: Admin có thể đã
 * chỉnh, và ghi đè bằng baseline là lặng lẽ huỷ thay đổi của họ.
 *
 * Chỉ đụng bản cấu hình ĐANG HIỆU LỰC. Các bản cũ giữ nguyên — chúng là lịch
 * sử, và một bút toán điểm cũ phải tra lại được nó ra đời dưới luật nào.
 */
export class MergePostQuotaIntoOne1794300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const [revision] = (await queryRunner.query(`
      SELECT id FROM config_revisions
      WHERE scope = 'ENTITLEMENT' AND status = 'PUBLISHED'
        AND effective_from <= now()
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC
      LIMIT 1
    `)) as { id: string }[];

    // Chưa có bản nào thì không có gì để gộp; seed sau này sẽ dựng thẳng
    // `POST_OPEN`.
    if (!revision) return;

    await queryRunner.query(
      `
        INSERT INTO capability_policies (revision_id, code, enabled)
        SELECT $1, 'POST_OPEN', enabled
        FROM capability_policies
        WHERE revision_id = $1 AND code = 'POST_OFFER'
        ON CONFLICT ("revision_id", "code") DO NOTHING
      `,
      [revision.id],
    );

    await queryRunner.query(
      `
        INSERT INTO capability_rank_values (policy_id, "rank", allowed, limit_value)
        SELECT target.id, source_value."rank", source_value.allowed, source_value.limit_value
        FROM capability_policies target
        INNER JOIN capability_policies source
          ON source.revision_id = target.revision_id AND source.code = 'POST_OFFER'
        INNER JOIN capability_rank_values source_value
          ON source_value.policy_id = source.id
        WHERE target.revision_id = $1 AND target.code = 'POST_OPEN'
      `,
      [revision.id],
    );

    await queryRunner.query(
      `
        DELETE FROM capability_rank_values
        WHERE policy_id IN (
          SELECT id FROM capability_policies
          WHERE revision_id = $1 AND code IN ('POST_OFFER', 'POST_WANTED')
        )
      `,
      [revision.id],
    );

    await queryRunner.query(
      `
        DELETE FROM capability_policies
        WHERE revision_id = $1 AND code IN ('POST_OFFER', 'POST_WANTED')
      `,
      [revision.id],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [revision] = (await queryRunner.query(`
      SELECT id FROM config_revisions
      WHERE scope = 'ENTITLEMENT' AND status = 'PUBLISHED'
        AND effective_from <= now()
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC
      LIMIT 1
    `)) as { id: string }[];

    if (!revision) return;

    // Dựng lại HAI capability từ cùng một nguồn — chúng vốn luôn bằng nhau
    // trước khi gộp, và không còn cách nào biết chúng từng khác nhau hay không.
    for (const code of ['POST_OFFER', 'POST_WANTED']) {
      await queryRunner.query(
        `
          INSERT INTO capability_policies (revision_id, code, enabled)
          SELECT $1, $2, enabled
          FROM capability_policies
          WHERE revision_id = $1 AND code = 'POST_OPEN'
          ON CONFLICT ("revision_id", "code") DO NOTHING
        `,
        [revision.id, code],
      );

      await queryRunner.query(
        `
          INSERT INTO capability_rank_values (policy_id, "rank", allowed, limit_value)
          SELECT target.id, source_value."rank", source_value.allowed, source_value.limit_value
          FROM capability_policies target
          INNER JOIN capability_policies source
            ON source.revision_id = target.revision_id AND source.code = 'POST_OPEN'
          INNER JOIN capability_rank_values source_value
            ON source_value.policy_id = source.id
          WHERE target.revision_id = $1 AND target.code = $2
        `,
        [revision.id, code],
      );
    }

    await queryRunner.query(
      `
        DELETE FROM capability_rank_values
        WHERE policy_id IN (
          SELECT id FROM capability_policies
          WHERE revision_id = $1 AND code = 'POST_OPEN'
        )
      `,
      [revision.id],
    );
    await queryRunner.query(
      `DELETE FROM capability_policies WHERE revision_id = $1 AND code = 'POST_OPEN'`,
      [revision.id],
    );
  }
}
