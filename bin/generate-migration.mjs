#!/usr/bin/env node
/**
 * Sinh một migration TypeORM rồi **tự cập nhật barrel** `migrations/index.ts`.
 *
 * Barrel được liệt kê tường minh (không dùng glob) vì glob phải trỏ `.ts` khi
 * chạy ts-node và `.js` khi chạy từ `dist`, nên luôn sai ở một trong hai. Nhưng
 * liệt kê tay thì rất dễ quên — và quên nghĩa là migration **im lặng không chạy**,
 * lỗi chỉ lộ ra khi cột bị thiếu lúc chạy thật. Nên việc cập nhật barrel được làm
 * tự động ở đây.
 *
 * Dùng: npm run migration:generate -- CreateUsers
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'src/infrastructure/persistence/migrations';
const DATA_SOURCE = 'src/infrastructure/persistence/data-source.ts';

const name = process.argv[2];

if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
  console.error('Cách dùng: npm run migration:generate -- <TênKiểuPascalCase>');
  console.error('Ví dụ   : npm run migration:generate -- CreateUsers');
  process.exit(2);
}

/** Đọc danh sách file migration, bỏ barrel, sắp theo tiền tố thời gian. */
function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    // `.spec.ts` phải LOẠI RA. Thư mục này có bốn file spec (`onboarding-tasks`,
    // `posts-backfill`, `rank-referral-foundation`, `barrel-guard`), và vì barrel
    // được dựng lại TỪ THƯ MỤC, một lượt `migration:generate` sẽ export chúng như
    // migration. Chúng không có class nào nên TypeORM âm thầm bỏ qua, nhưng barrel
    // thì thành nói sai về chính nó — và `barrel-guard.spec.ts` sẽ đỏ đúng chỗ đó.
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        file !== 'index.ts' &&
        !file.endsWith('.spec.ts'),
    )
    .sort();
}

const before = new Set(listMigrations());

try {
  execFileSync(
    'npx',
    [
      'typeorm-ts-node-commonjs',
      'migration:generate',
      join(MIGRATIONS_DIR, name),
      '--dataSource',
      DATA_SOURCE,
      '--pretty',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
} catch {
  // typeorm thoát khác 0 cho CẢ hai trường hợp: lỗi thật, và "schema không đổi".
  // Trường hợp sau không phải lỗi — phân biệt bằng việc có sinh ra file mới không.
  if (listMigrations().length === before.size) {
    console.log('\nKhông có gì để sinh — schema đã khớp entity.');
    console.log('Nếu bạn vừa sửa entity thì kiểm tra lại: đã export nó ở');
    console.log('src/infrastructure/entity/index.ts chưa?');
    process.exit(0);
  }

  console.error('\nKhông sinh được migration. Kiểm tra DATABASE_URI trong .env.local.');
  process.exit(1);
}

const added = listMigrations().filter((file) => !before.has(file));

if (added.length === 0) {
  console.log('\nKhông có file mới — barrel giữ nguyên.');
  process.exit(0);
}

// Dựng lại barrel từ thư mục thay vì nối thêm dòng: thứ tự luôn khớp tên file,
// và file bị xoá tay cũng tự biến mất khỏi barrel.
const barrelPath = join(MIGRATIONS_DIR, 'index.ts');
const header = readFileSync(barrelPath, 'utf-8').split('\n');
const commentEnd = header.findIndex((line) => line.trim() === '*/');
const comment = commentEnd >= 0 ? header.slice(0, commentEnd + 1) : [];

const exports = listMigrations().map(
  (file) => `export * from './${file.replace(/\.ts$/, '')}';`,
);

writeFileSync(barrelPath, [...comment, '', ...exports, ''].join('\n'), 'utf-8');

// TypeORM sinh code theo style riêng (thụt 4 dấu cách, nháy kép) — lệch với
// prettier/eslint của repo, nên CI đỏ ngay lần sinh đầu tiên. Định dạng luôn ở
// đây để không ai phải nhớ.
const touched = [...added, 'index.ts'].map((file) => join(MIGRATIONS_DIR, file));

for (const tool of [
  ['prettier', '--write'],
  ['eslint', '--fix'],
]) {
  try {
    execFileSync('npx', [...tool, ...touched], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch {
    console.warn(`Không chạy được ${tool[0]} — định dạng tay trước khi commit.`);
  }
}

console.log('\nĐã thêm vào barrel:');
for (const file of added) console.log('  ' + file);
console.log('\nĐọc lại file migration trước khi commit — TypeORM sinh ra SQL huỷ');
console.log('dữ liệu (DROP COLUMN, ALTER TYPE) mà không cảnh báo gì.');
