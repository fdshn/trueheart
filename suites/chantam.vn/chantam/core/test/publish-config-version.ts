import { DataSource } from 'typeorm';

/**
 * Xuất bản một phiên bản cấu hình động trong script kiểm chứng.
 *
 * ## Vì sao cần một hàm dùng chung
 *
 * Ba script từng tự viết câu `INSERT INTO system_configs` với **số phiên bản ghi
 * cứng là 1**, và cả ba đều hỏng theo cùng một cách khi migration
 * `1795700000000-SeedMissingSystemConfigs` seed sẵn version 1 cho `chat.retention`
 * và `rank.points_source`:
 *
 * - `chat-purge.check.ts` nổ `UQ_system_configs_key_version` — hỏng ỒN ÀO, dễ thấy.
 * - `redemption.check.ts` dùng `ON CONFLICT DO NOTHING` nên lượt ghi bị **bỏ qua
 *   lặng lẽ**: cấu hình vẫn là `BALANCE`, và phép kiểm "nguồn LIFETIME thì không
 *   cảnh báo tụt hạng" đo một thứ nó tưởng đã đặt. Đây là kiểu tệ hơn — một phép
 *   kiểm đo sai đối tượng mà vẫn trông như đang làm việc.
 *
 * Cả hai lọt qua nhiều commit vì 25 trong 30 script kiểm chứng chưa nằm trong CI.
 *
 * ## Hợp đồng
 *
 * Đóng cửa sổ hiệu lực của bản đang chạy rồi mở bản mới ở `MAX(version) + 1`, đúng
 * lối `publishSystemConfig` làm lúc chạy thật. Hai ràng buộc phải thoả cùng lúc:
 *
 * - `CHK_system_configs_dates` đòi `effective_to > effective_from`, nên mốc đóng
 *   dùng `GREATEST(now(), effective_from + 1 microsecond)` — trên một database vừa
 *   dựng, migration và script chạy sát nhau đủ để `now()` ra cùng microsecond.
 * - `EX_system_configs_published_window` loại trừ theo khoảng `[from, to)`, nên bản
 *   mới phải bắt đầu ĐÚNG ở mốc bản cũ kết thúc.
 *
 * Làm trong MỘT câu để hai mốc không thể lệch nhau.
 */
export async function publishConfigVersion(
  dataSource: DataSource,
  key: string,
  value: unknown,
  valueType: 'JSON' | 'INTEGER' = 'JSON',
): Promise<number> {
  const [row] = await dataSource.query<{ version: string }[]>(
    `
      WITH closed AS (
        UPDATE system_configs
        SET effective_to =
              GREATEST(now(), effective_from + interval '1 microsecond')
        WHERE config_key = $1 AND effective_to IS NULL
        RETURNING effective_to
      ), next_version AS (
        SELECT COALESCE(MAX(version), 0) + 1 AS version
        FROM system_configs WHERE config_key = $1
      )
      INSERT INTO system_configs
        (config_key, value_json, value_type, version, status,
         change_reason, effective_from)
      SELECT $1, $2::jsonb, $3, next_version.version, 'PUBLISHED',
             'Script kiểm chứng', COALESCE((SELECT effective_to FROM closed), now())
      FROM next_version
      RETURNING version::text
    `,
    [key, JSON.stringify(value), valueType],
  );

  // Trả số phiên bản để nơi gọi khẳng định được là mình THẬT SỰ ghi được. Trả
  // `void` thì một lượt ghi không xảy ra lại trông y như một lượt thành công.
  return Number(row.version);
}
