import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `query()` của TypeORM bọc kết quả `UPDATE`/`DELETE ... RETURNING` thành
 * `[rows, affectedCount]`, còn `INSERT ... RETURNING` và `SELECT` thì trả
 * thẳng `rows`.
 *
 * Hai hình dạng khác nhau cho hai câu lệnh nằm cạnh nhau, nên chỗ sai trông y
 * hệt chỗ đúng. Và nó hỏng im lặng: `rows.length === 0` không bao giờ đúng vì
 * độ dài luôn là 2, `[0].cột` ra `undefined`, rồi `findOne` nhận `undefined`
 * thì BỎ QUA điều kiện lọc và trả về hàng đầu bảng — bản ghi của người khác.
 *
 * Đã từng làm đường rút yêu cầu xin nhận trả về yêu cầu của người dùng khác,
 * làm `/transactions/:id/accept` không phát hiện hết hàng, và khiến
 * `qualifyReferral` luôn báo chưa đủ điều kiện sau khi đã cộng điểm.
 *
 * Mọi `UPDATE`/`DELETE ... RETURNING` phải đi qua `updateReturning()`.
 */
function readRepositorySources(): { file: string; source: string }[] {
  const directory = __dirname;

  return readdirSync(directory)
    .filter((name) => name.endsWith('.repository.ts'))
    .map((name) => ({
      file: name,
      source: readFileSync(join(directory, name), 'utf8'),
    }));
}

/** Trả về nội dung từng lời gọi `.query(...)`, cắt theo ngoặc cân bằng. */
function queryCalls(source: string): string[] {
  const calls: string[] = [];
  const opener = /\.query\s*(?:<[^>]*>)?\s*\(/g;

  let match = opener.exec(source);
  while (match !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;

    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '(' || character === '[' || character === '{')
        depth += 1;
      else if (character === ')' || character === ']' || character === '}')
        depth -= 1;
      index += 1;
    }

    calls.push(source.slice(start, index));
    match = opener.exec(source);
  }

  return calls;
}

describe('UPDATE/DELETE ... RETURNING trong repository', () => {
  const sources = readRepositorySources();

  it('tìm thấy file repository để quét', () => {
    // Quét không ra file nào thì khẳng định dưới đây vô nghĩa.
    expect(sources.length).toBeGreaterThan(5);
  });

  it('bộ dò nhận ra đúng mẫu vi phạm', () => {
    // Tự kiểm bộ dò: một phép kiểm luôn xanh vì không dò được gì thì vô dụng.
    const offending = `
      const rows = await manager.query(\`
        UPDATE users SET rank = $2 WHERE global_id = $1 RETURNING global_id
      \`, [id, rank]);
    `;
    const calls = queryCalls(offending).filter(
      (call) => /RETURNING/i.test(call) && /\bUPDATE\b/i.test(call),
    );

    expect(calls).toHaveLength(1);
  });

  it.each(['UPDATE', 'DELETE'])(
    '%s ... RETURNING luôn đi qua updateReturning()',
    (verb) => {
      const offenders = sources
        .filter(({ source }) =>
          queryCalls(source).some(
            (call) =>
              /RETURNING/i.test(call) &&
              new RegExp(`\\b${verb}\\b`, 'i').test(call) &&
              // INSERT ... ON CONFLICT DO UPDATE không bị bọc, nó là INSERT.
              !/\bINSERT\b/i.test(call),
          ),
        )
        .map(({ file }) => file);

      expect(offenders).toEqual([]);
    },
  );
});
