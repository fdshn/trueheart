import { EntityManager } from 'typeorm';

/**
 * Chạy `UPDATE`/`DELETE ... RETURNING` và trả về ĐÚNG mảng bản ghi.
 *
 * `query()` của TypeORM (driver Postgres) trả về hai hình dạng khác nhau tuỳ
 * loại câu lệnh:
 *
 * ```
 * UPDATE ... RETURNING  ->  [rows, affectedCount]
 * DELETE ... RETURNING  ->  [rows, affectedCount]
 * INSERT ... RETURNING  ->  rows
 * SELECT                ->  rows
 * ```
 *
 * Nên `const [x] = await manager.query('UPDATE ... RETURNING ...')` gán cho
 * `x` cả mảng `rows`, còn `rows.length === 0` thì KHÔNG BAO GIỜ đúng vì độ
 * dài luôn là 2. Chỗ sai trông y hệt chỗ đúng ngay bên cạnh, vì `INSERT` liền
 * kề lại không bị bọc.
 *
 * Hỏng theo kiểu im lặng chứ không ném lỗi: `if (!updated)` qua được vì mảng
 * là truthy, `rows[0].cot` ra `undefined`, và `findOne({ where: { id:
 * undefined } })` không ném lỗi mà BỎ QUA điều kiện lọc rồi trả về hàng đầu
 * bảng — tức bản ghi của người dùng khác. Đó chính là triệu chứng đã đo được
 * ở đường rút yêu cầu xin nhận.
 *
 * Dùng hàm này cho mọi `UPDATE`/`DELETE ... RETURNING`. `INSERT` thì gọi
 * `manager.query` như bình thường.
 */
export async function updateReturning<T>(
  manager: EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  const result = (await manager.query(sql, parameters)) as unknown;

  // Dạng đã bọc: đúng hai phần tử, phần đầu là mảng bản ghi, phần sau là số
  // dòng bị ảnh hưởng.
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  )
    return result[0] as T[];

  // Một số bản driver trả thẳng mảng bản ghi. Không đoán mò: mảng rỗng và
  // mảng bản ghi đều đi qua nhánh này an toàn.
  return (Array.isArray(result) ? result : []) as T[];
}
