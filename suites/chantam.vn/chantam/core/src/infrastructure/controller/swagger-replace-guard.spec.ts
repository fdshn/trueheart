import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Description của Swagger KHÔNG được chứa mẫu thay thế của `String.replace()`.
 *
 * ## Lỗi thật, đo được trên staging 05/10
 *
 * `https://api-staging.chantam.vn/docs` trả về trang **TRẮNG TINH** sau khi đăng nhập
 * basic auth. Server hoàn toàn khoẻ: `/docs` trả 200 kèm HTML, `/docs/json` trả 200 kèm
 * 1,1 MB spec, và cả ba asset (`swagger-ui.css`, `swagger-ui-bundle.js`,
 * `swagger-ui-init.js`) đều 200.
 *
 * Nhưng `node --check` trên `swagger-ui-init.js` tải về cho:
 *
 * ```
 * SyntaxError: Invalid or unexpected token
 *   "description": "Nhận cả hai dạng: slug có dạng `^[a-z0-9]+(-[a-z0-9]+)*
 * ```
 *
 * Chuỗi bị CẮT đúng ở `*$`, và dòng ngay sau là `window.onload = function() {` — tức
 * phần còn lại của spec biến mất và thay bằng phần đuôi của template.
 *
 * ## Vì sao
 *
 * `@nestjs/swagger` dựng `swagger-ui-init.js` bằng cách nhét spec đã `JSON.stringify`
 * vào một template qua `String.prototype.replace()`. Trong **chuỗi thay thế** của
 * `replace()`, năm thứ sau là MẪU ĐẶC BIỆT, không phải chữ thường:
 *
 * | Mẫu | Nghĩa |
 * | --- | --- |
 * | `$$` | một dấu `$` |
 * | `` $` `` | **toàn bộ phần TRƯỚC chỗ khớp** |
 * | `$'` | toàn bộ phần SAU chỗ khớp |
 * | `$&` | chính chỗ khớp |
 * | `$1`…`$9` | nhóm bắt |
 *
 * Description của tôi chứa `` `^[a-z0-9]+(-[a-z0-9]+)*$` `` — dấu `$` đứng ngay trước
 * một backtick, tức chuỗi `` $` ``. `replace()` đọc nó thành "chèn phần trước chỗ khớp
 * vào đây", và spec vỡ từ điểm đó.
 *
 * ## Vì sao không cổng nào bắt được
 *
 * - Đây là chữ trong một chuỗi mô tả, nên TypeScript và ESLint không có gì để phàn nàn.
 * - `/docs/json` vẫn ĐÚNG hoàn toàn — spec chỉ vỡ ở đường `swagger-ui-init.js`.
 * - `scripts/smoke-test.sh` kiểm `/docs` trả 200 và `/docs/json` phân tích được. Cả hai
 *   đều xanh với trang trắng, vì không ai kiểm **init.js có phải JS hợp lệ**.
 * - Lỗi vào repo từ F65 (03/10) và lặp lại ở F65 Công đức rồi F73, cùng một câu chữ chép
 *   ba lần. Nên nó hỏng im lặng hai ngày, và chỉ lộ khi có người mở trang.
 *
 * Phép kiểm này soát CHỮ trong mã nguồn vì nó rẻ và chạy ở mọi lượt. Lớp thứ hai —
 * `node --check` trên `swagger-ui-init.js` do service thật trả về — nằm ở
 * `scripts/smoke-test.sh`, và đó mới là lớp chứng minh trang dựng được.
 */

/** Mẫu thay thế đặc biệt của `String.replace()`, trừ `$1`…`$9` (xem docblock). */
const ReplacementPatterns: readonly { pattern: string; meaning: string }[] = [
  { pattern: '$`', meaning: 'toàn bộ phần TRƯỚC chỗ khớp' },
  { pattern: "$'", meaning: 'toàn bộ phần SAU chỗ khớp' },
  { pattern: '$&', meaning: 'chính chỗ khớp' },
];

function readControllerSources(): { file: string; source: string }[] {
  const root = join(__dirname);
  const out: { file: string; source: string }[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      // Chỉ file nguồn. Bỏ spec để phép kiểm này không tự bắt chính nó: docblock ở
      // trên CÓ chứa đúng những mẫu nó đi tìm.
      if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))
        out.push({ file: path, source: readFileSync(path, 'utf8') });
    }
  };

  walk(root);
  return out;
}

describe('Mẫu thay thế của String.replace() trong description Swagger', () => {
  const sources = readControllerSources();

  it('tìm được file controller để quét', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(ReplacementPatterns)(
    'không file nguồn nào chứa `$pattern` ($meaning)',
    ({ pattern }) => {
      const offences = sources
        .filter(({ source }) => source.includes(pattern))
        .map(({ file }) => file);

      expect(offences).toEqual([]);
    },
  );

  it('bắt được đúng chuỗi đã làm trang docs trắng', () => {
    // Giữ lại ca thật để phép kiểm trên không thành một dòng ai cũng tin mà không ai đo.
    // Đây là nguyên văn description đã vào repo ở F65.
    const broke =
      'Nhận cả hai dạng: slug có dạng `^[a-z0-9]+(-[a-z0-9]+)*$` nên không chuỗi nào';
    expect(broke.includes('$' + '`')).toBe(true);

    // Và bản đã sửa thì sạch.
    const fixed =
      'Nhận cả hai dạng: slug có dạng `[a-z0-9]+(-[a-z0-9]+)*` khớp trọn chuỗi nên không chuỗi nào';
    expect(fixed.includes('$' + '`')).toBe(false);
  });
});
