#!/usr/bin/env node
/**
 * Sinh `docs/API-ERRORS.md` — bảng tra cứu mọi mã lỗi API — từ chính các danh
 * mục lỗi trong mã nguồn.
 *
 * Viết tay bảng này thì chỉ sau vài lần thêm lỗi là nó nói sai, mà đây lại là
 * tài liệu bên làm app di động tra hằng ngày. Sinh tự động thì nó không sai
 * được; và `--check` khiến CI chặn luôn commit nào quên chạy lại.
 *
 * Dùng:
 *   node bin/generate-error-docs.mjs            # ghi file
 *   node bin/generate-error-docs.mjs --check    # chỉ kiểm, khác thì exit 1
 *
 * Đọc từ mã đã biên dịch nên phải `npm run build` trước.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT = 'docs/API-ERRORS.md';
const CHECK_ONLY = process.argv.includes('--check');

/** Mỗi tầng một danh mục. Thêm tầng mới thì khai thêm ở đây. */
const SOURCES = [
  {
    layer: 'kernel/common-lib',
    title: 'Nền tảng — lỗi giao thức và vòng đời request',
    module: 'kernel/common-lib/consts/error-catalog.js',
    exportName: 'PlatformErrors',
  },
  {
    layer: 'system/auth-lib',
    title: 'Xác thực — access token',
    module: 'system/auth-lib/consts/error-catalog.js',
    exportName: 'AuthErrors',
  },
  {
    layer: 'chantam/core',
    title: 'Nghiệp vụ Chân Tâm',
    module: 'suites/chantam.vn/chantam/core-lib/consts/error-catalog.js',
    exportName: 'CoreErrors',
  },
];

/**
 * Dựng câu ví dụ từ bộ tham số mẫu khai trong danh mục.
 *
 * Không đoán kiểu tham số lúc chạy: đoán sai thì ra câu vô nghĩa mà vẫn sinh ra
 * file trông như đúng. Thà dừng lại bắt khai `sample`.
 */
function sampleMessage(layer, name, definition) {
  const text = definition.message(...(definition.sample ?? []));

  if (typeof text !== 'string' || text.length === 0)
    throw new Error(`${layer}.${name}: hàm message không trả ra chuỗi`);

  if (text.includes('undefined'))
    throw new Error(
      `${layer}.${name}: câu ví dụ có "undefined" — thiếu hoặc sai ` +
        '`sample` trong danh mục lỗi.',
    );

  return text;
}

const httpNames = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
};

async function build() {
  const lines = [
    '# Bảng tra mã lỗi API',
    '',
    '> **Sinh tự động.** Đừng sửa tay — sửa danh mục lỗi trong mã nguồn rồi chạy',
    '> `npm run docs:errors`. CI kiểm lại bằng `npm run docs:errors:check`.',
    '',
    'Mọi response đều cùng một hình dạng, kể cả khi lỗi:',
    '',
    '```json',
    '{',
    '  "success": false,',
    '  "errorCode": 772,',
    '  "errorOrigin": "chantam/core",',
    '  "message": ["Tên đăng nhập \\"an\\" đã có người dùng"],',
    '  "body": null',
    '}',
    '```',
    '',
    'Client phân biệt lỗi bằng **cặp `(errorOrigin, errorCode)`** — mã trùng nhau',
    'giữa hai `errorOrigin` khác nhau là bình thường và có chủ đích. Đừng bắt theo',
    '`message`: câu chữ sẽ đổi.',
    '',
  ];

  let total = 0;

  for (const source of SOURCES) {
    const imported = await import(
      pathToFileURL(resolve(process.cwd(), source.module)).href,
    );
    // Mã biên dịch ra CommonJS; Node thường suy được export có tên, nhưng
    // không phải lúc nào cũng vậy — nên thử cả `default`.
    const catalog =
      imported[source.exportName] ?? imported.default?.[source.exportName];

    if (!catalog)
      throw new Error(`Không tìm thấy ${source.exportName} trong ${source.module}`);

    const rows = Object.entries(catalog).sort(
      ([, a], [, b]) => a.code - b.code,
    );

    total += rows.length;

    lines.push(
      `## \`${source.layer}\``,
      '',
      source.title,
      '',
      '| Mã (hex) | Mã (thập phân) | HTTP | Tên | Thông điệp |',
      '| --- | --- | --- | --- | --- |',
    );

    for (const [name, definition] of rows) {
      const hex = `0x${definition.code.toString(16).padStart(4, '0')}`;
      const http = `${definition.httpStatus} ${httpNames[definition.httpStatus] ?? ''}`.trim();
      const message = sampleMessage(source.layer, name, definition).replaceAll(
        '|',
        '\|',
      );

      lines.push(
        `| \`${hex}\` | \`${definition.code}\` | ${http} | \`${name}\` | ${message} |`,
      );
    }

    lines.push('');
  }

  lines.push(
    '---',
    '',
    `Tổng cộng **${total} mã lỗi** trên ${SOURCES.length} tầng.`,
    'Một số mã đã khai trước cho milestone sau nên chưa endpoint nào trả về.',
    '',
  );

  return lines.join('\n');
}

const content = await build();

if (CHECK_ONLY) {
  let current = '';

  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    console.error(`${OUTPUT} chưa tồn tại. Chạy: npm run docs:errors`);
    process.exit(1);
  }

  if (current.replaceAll('\r\n', '\n') !== content) {
    console.error(
      `${OUTPUT} đã cũ so với danh mục lỗi trong mã nguồn.\n` +
        'Chạy: npm run docs:errors  rồi commit lại.',
    );
    process.exit(1);
  }

  console.log(`${OUTPUT} khớp với mã nguồn.`);
} else {
  writeFileSync(OUTPUT, content, 'utf8');
  console.log(`Đã ghi ${OUTPUT}.`);
}
