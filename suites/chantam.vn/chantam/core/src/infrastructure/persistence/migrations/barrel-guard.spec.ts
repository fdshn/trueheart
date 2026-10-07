import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as migrations from './index';

/**
 * Mọi file migration phải được export từ barrel `index.ts`.
 *
 * ## Vì sao cần lưới cho một file barrel
 *
 * `data-source.ts` và `persistence.module.ts` đều nạp migration bằng
 * `import * as migrations from './migrations'` — tức **chỉ những gì `index.ts` export
 * mới tồn tại**. Barrel đó viết tay, 102 dòng.
 *
 * Ngày 07/10 `1799200000000-SeedGiftValueBonusCap` được thêm mà quên export. Và đây
 * là một kiểu hỏng **im lặng đặc biệt tệ**:
 *
 * - file có, tên đúng quy ước, class đúng `MigrationInterface`;
 * - `tsc` xanh — không ai nhập nó nên không có lỗi kiểu nào;
 * - 1292 unit test xanh — chúng mock database;
 * - `npm run migration:run` xanh — nó chạy đúng 101 migration và không có cách nào
 *   biết là lẽ ra phải 102.
 *
 * Nó chỉ lộ ra ở `test:config-inventory` trên CI, và lộ ra dưới dạng một câu nói về
 * chuyện khác: *"FAIL `point.value_bonus_max_value_vnd` đã seed"*. Mất một lượt CI đỏ
 * cộng một lượt đọc log để lần ra nguyên nhân thật là một dòng `export` thiếu.
 *
 * Hậu quả nghiệp vụ của lần đó: khoá cấu hình trần giá trị không có dòng nào trong
 * `system_configs`, nên `normalize*` rơi về mặc định và **Admin không thấy cái núm**
 * để hạ trần khi phát hiện bị lạm dụng — đúng cái lỗ mà docblock của chính migration
 * đó nói nó được dựng ra để bịt.
 *
 * ## Và gốc sâu hơn: migration phải sinh bằng `npm run migration:generate`
 *
 * Docblock của `index.ts` nói thẳng *"`bin/generate-migration.mjs` tự dựng lại danh
 * sách này sau mỗi lần sinh — không sửa tay"*. Lần 07/10 migration được viết TAY nên
 * generator không bao giờ chạy, và barrel không bao giờ biết tới nó. Một dòng
 * `export` thêm tay chữa được hậu quả nhưng không chữa được cách làm; phép kiểm này
 * là chỗ bắt lần sau.
 *
 * Phép kiểm này không cần database và chạy trong vài milli giây.
 */
const MigrationsDir = __dirname;

/** Tên file migration trên đĩa, trừ barrel và spec. */
function migrationFileNames(): string[] {
  return readdirSync(MigrationsDir)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => name !== 'index.ts')
    .filter((name) => !name.endsWith('.spec.ts'))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort();
}

/** Đường dẫn được export, **theo đúng thứ tự xuất hiện trong file**. */
function exportedPathsInFileOrder(): string[] {
  const barrel = readFileSync(join(MigrationsDir, 'index.ts'), 'utf-8');
  return [...barrel.matchAll(/^export \* from '\.\/([^']+)';$/gm)].map(
    (match) => match[1],
  );
}

function exportedPaths(): string[] {
  return [...exportedPathsInFileOrder()].sort();
}

describe('barrel migration', () => {
  it('mọi file migration đều được export — thiếu một dòng là migration KHÔNG chạy', () => {
    const missing = migrationFileNames().filter(
      (name) => !exportedPaths().includes(name),
    );

    expect(missing).toEqual([]);
  });

  it('không export nào trỏ tới file KHÔNG phải migration', () => {
    // Phép kiểm này KHÔNG bắt được một export trỏ tới file không tồn tại: chính
    // spec này `import * as migrations from './index'`, nên đường dẫn chết làm cả
    // suite không biên dịch được trước khi chạy tới đây — `tsc` là chốt cho ca đó,
    // và nói vậy ở đây thì lần sau không ai tưởng đã có lưới.
    //
    // Ca nó thật sự bắt: export trỏ tới file CÓ THẬT mà không phải migration. Đúng
    // tình trạng `bin/generate-migration.mjs` từng tạo ra — nó dựng barrel từ thư
    // mục và không loại `.spec.ts`, nên một lượt sinh migration sẽ export bốn file
    // spec trong cùng thư mục. Đã sửa generator 07/10; đây là lưới cho lần sau.
    const files = migrationFileNames();
    const notMigrations = exportedPaths().filter(
      (path) => !files.includes(path),
    );

    expect(notMigrations).toEqual([]);
  });

  it('thứ tự export tăng theo dấu thời gian', () => {
    // TypeORM tự sắp theo timestamp trong TÊN CLASS nên thứ tự ở đây không đổi
    // hành vi lúc chạy. Nhưng một barrel 102 dòng không theo thứ tự thì người thêm
    // dòng mới sẽ chèn vào giữa, và lần soát sau không ai nhìn ra chỗ nào thiếu —
    // tức đúng chỗ phép kiểm đầu vừa bắt được.
    //
    // Bản đầu của phép kiểm này đọc qua `exportedPaths()`, mà hàm đó `.sort()` —
    // nên nó so một mảng đã sắp với chính nó đã sắp và **không bao giờ đỏ được**.
    // Dựng lại lỗi mới lộ ra: dời một dòng ra sai chỗ mà nó vẫn xanh.
    const timestamps = exportedPathsInFileOrder().map(
      (path) => path.split('-')[0],
    );

    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('mỗi file export ra đúng một class migration dùng được', () => {
    // Export một file KHÔNG có class — hoặc có class nhưng thiếu `up` — thì
    // TypeORM bỏ qua nó mà không nói gì, y như trường hợp quên export.
    const classes = Object.values(migrations as Record<string, unknown>).filter(
      (value) => typeof value === 'function',
    );

    expect(classes.length).toBe(migrationFileNames().length);
    for (const candidate of classes)
      expect(
        typeof (candidate as { prototype?: { up?: unknown } }).prototype?.up,
      ).toBe('function');
  });
});
