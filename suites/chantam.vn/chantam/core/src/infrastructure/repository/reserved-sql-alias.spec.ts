import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `user` là TỪ KHOÁ RESERVED của PostgreSQL.
 *
 * `FROM users user` rồi tham chiếu `user.global_id` không phải lỗi dữ liệu mà
 * là LỖI CÚ PHÁP — Postgres từ chối ngay cả dạng `AS user`, chỉ `"user"` có
 * nháy kép mới hợp lệ. Câu lệnh sai kiểu này chạy qua được mọi unit test vì
 * test mock hàm `query`, rồi nổ 500 ngay lần đầu chạm database thật.
 *
 * Đã từng làm hỏng /profile/me, /ranks/me và /referrals/me cùng lúc. Repo dùng
 * `user_account` làm alias chuẩn cho bảng `users`.
 */
const ReservedAliases = ['user', 'order', 'group', 'table', 'select', 'from'];

function readRepositorySources(): { file: string; sql: string }[] {
  const directory = __dirname;

  return readdirSync(directory)
    .filter((name) => name.endsWith('.repository.ts'))
    .map((name) => ({
      file: name,
      sql: readFileSync(join(directory, name), 'utf8'),
    }));
}

describe('SQL thô trong repository', () => {
  const sources = readRepositorySources();

  it('tìm thấy file repository để quét', () => {
    // Quét không ra file nào thì mọi khẳng định dưới đây đều vô nghĩa.
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each(ReservedAliases)(
    'không dùng "%s" làm alias bảng — Postgres từ chối từ khoá reserved',
    (alias) => {
      // KHÔNG dùng cờ `g`: `test()` trên regex có `g` nhớ `lastIndex` giữa các
      // lần gọi, nên quét file thứ hai trở đi sẽ bỏ sót.
      //
      // `(?!\\s+BY)` loại `ORDER BY` / `GROUP BY` đứng ngay sau tên bảng —
      // chúng là mệnh đề, không phải alias.
      const pattern = new RegExp(
        `(FROM|JOIN)\\s+[a-z_]+\\s+(AS\\s+)?${alias}\\b(?!\\s+BY)`,
        'i',
      );
      const offenders = sources
        .filter((source) => pattern.test(source.sql))
        .map((source) => source.file);

      expect(offenders).toEqual([]);
    },
  );
});
