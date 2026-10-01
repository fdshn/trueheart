import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mọi `test/*.check.ts` phải có npm script, và script đó phải đi vào CI.
 *
 * ## Vì sao cần một phép kiểm cơ học
 *
 * Các script trong `test/` là lớp DUY NHẤT bắt được những lỗi mà unit test không
 * thấy: unit test mock `query`, nên một câu SQL sai cú pháp vẫn xanh hết. Một
 * script không được gọi ở đâu là một phép kiểm **không tồn tại** — tệ hơn là
 * không có nó, vì đọc danh sách file thì thấy có.
 *
 * Chuyện này đã xảy ra: 25 trong 30 script chỉ chạy khi có người gõ tay, suốt
 * nhiều commit. Lần dọn ngày 30/09 nối chúng vào CI bằng một vòng lặp **suy ra
 * danh sách từ `package.json`** chứ không chép tay — nên script mới tự được gọi.
 *
 * ## Lỗ còn lại mà phép kiểm này bịt
 *
 * Vòng lặp đó gom script bằng `k.startsWith('test:')`. Nên một script kiểm chứng
 * đặt tên ngoài tiền tố ấy — `check:foo`, `verify:bar` — bị bỏ **lặng lẽ**: CI
 * vẫn xanh, không cảnh báo nào, và không ai biết phép kiểm đó chưa từng chạy.
 *
 * Hai điều kiện dưới đây là hai điều kiện độc lập, và một file có thể qua cái
 * thứ nhất mà trượt cái thứ hai.
 */

const PackageRoot = join(__dirname, '..');
const CheckScriptDir = join(PackageRoot, 'test');

/**
 * Script chạy được ở CI dù KHÔNG mang tiền tố `test:`.
 *
 * Mỗi dòng phải nêu bước CI đang gọi nó. Thêm một dòng vào đây mà không có bước
 * đó là tự cấp cho mình một ngoại lệ rỗng — đúng thứ phép kiểm này ngăn.
 */
const ScriptsRunByTheirOwnCiStep: Record<string, string> = {
  // ci.yaml, bước "Kiểm chứng backfill M2.1 với dữ liệu thật".
  'migration:backfill-check': 'posts-backfill.check.ts',
};

function readScripts(): Record<string, string> {
  const manifest = JSON.parse(
    readFileSync(join(PackageRoot, 'package.json'), 'utf-8'),
  ) as { scripts?: Record<string, string> };
  return manifest.scripts ?? {};
}

function checkFiles(): string[] {
  return readdirSync(CheckScriptDir)
    .filter((name) => name.endsWith('.check.ts'))
    .sort();
}

/** Tên file `.check.ts` mà một dòng script chạy tới. */
function referencedCheckFiles(command: string): string[] {
  return [...command.matchAll(/test\/([A-Za-z0-9-]+\.check\.ts)/g)].map(
    (match) => match[1],
  );
}

describe('wiring của script kiểm chứng trên Postgres thật', () => {
  it('mọi test/*.check.ts đều có một npm script gọi tới', () => {
    const scripts = readScripts();
    const referenced = new Set(
      Object.values(scripts).flatMap((command) =>
        referencedCheckFiles(command),
      ),
    );

    const orphans = checkFiles().filter((file) => !referenced.has(file));

    expect(orphans).toEqual([]);
  });

  it('script gọi check phải mang tiền tố test: hoặc có bước CI riêng', () => {
    // Đây là điều kiện mà phép kiểm thứ nhất KHÔNG bắt được: một script tên
    // `check:foo` vẫn làm file hết mồ côi, nhưng vòng lặp CI không nhặt nó.
    const scripts = readScripts();

    const unreachable = Object.entries(scripts)
      .filter(([name, command]) => {
        if (referencedCheckFiles(command).length === 0) return false;
        if (name.startsWith('test:')) return false;
        return !(name in ScriptsRunByTheirOwnCiStep);
      })
      .map(([name]) => name);

    expect(unreachable).toEqual([]);
  });

  it('danh sách miễn trừ không có dòng chết', () => {
    // Một ngoại lệ trỏ tới script đã đổi tên hoặc đã xoá là một dòng không ai
    // dọn, và nó sẽ che đúng cái script tiếp theo trùng tên.
    const scripts = readScripts();
    const files = new Set(checkFiles());

    for (const [scriptName, checkFile] of Object.entries(
      ScriptsRunByTheirOwnCiStep,
    )) {
      expect(Object.keys(scripts)).toContain(scriptName);
      expect(files).toContain(checkFile);
      // Và ngoại lệ phải trỏ đúng file mà script đó thật sự chạy.
      expect(referencedCheckFiles(scripts[scriptName])).toContain(checkFile);
    }
  });
});
