#!/usr/bin/env node
/**
 * Sinh `docs/API-ROUTES.md` — danh sách MỌI route HTTP của Core — từ chính metadata Nest của
 * các controller đã biên dịch: method, đường dẫn, mức truy cập, tóm tắt Swagger.
 *
 * Vì sao có file này: ma trận endpoint viết tay (`docs/diagram/30-endpoint-matrix.md`) và
 * `docs/API.md` trôi khỏi code — kiểm 03/11/2026 thấy hơn 150 route không có trong ma trận,
 * vài dòng trỏ vào route đã xoá, và vài route ghi sai quyền. Danh sách sinh tự động thì không
 * sai được; `--check` để CI chặn commit thêm route mà quên chạy lại.
 *
 * Mức truy cập:
 *   - `Công khai`       — có `@Public()`.
 *   - `perm:<mã>`       — `@RequiresPermission('<mã>')` (guard RBAC của khu Admin).
 *   - `Bearer`          — mặc định: cần access token. Một số route còn kiểm thêm trong use case
 *                         (chủ sở hữu, `category.manage`, `rank.operate`…) — xem `docs/API.md`.
 *
 * Dùng:
 *   node bin/generate-route-docs.mjs            # ghi file
 *   node bin/generate-route-docs.mjs --check    # chỉ kiểm, khác thì exit 1
 *
 * Đọc từ mã đã biên dịch nên phải `npm run build` trước.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

const OUTPUT = 'docs/API-ROUTES.md';
const CHECK_ONLY = process.argv.includes('--check');
const CORE_DIST = resolve('suites/chantam.vn/chantam/core/dist');
const CONTROLLER_DIR = join(CORE_DIST, 'infrastructure/controller/api');
const PREFIX = '/api/v1';

const require = createRequire(join(CORE_DIST, 'main.js'));
require('reflect-metadata');

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const PUBLIC_KEY = 'chantam:public-route';
const PERMISSION_KEY = 'chantam:required-permission';
const SWAGGER_OPERATION = 'swagger/apiOperation';
const Methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

function controllerFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.js') ? [full] : [];
  });
}

function joinPath(...parts) {
  const path = parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return `/${path.replace(/^\//, '')}`;
}

function oneLine(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

const routes = [];
for (const file of controllerFiles(CONTROLLER_DIR)) {
  const exported = require(file);
  for (const value of Object.values(exported)) {
    if (typeof value !== 'function') continue;
    const controllerPath = Reflect.getMetadata(PATH_METADATA, value);
    if (controllerPath === undefined) continue;
    const classPublic = Reflect.getMetadata(PUBLIC_KEY, value) === true;
    const classPermission = Reflect.getMetadata(PERMISSION_KEY, value);

    for (const name of Object.getOwnPropertyNames(value.prototype)) {
      if (name === 'constructor') continue;
      const handler = value.prototype[name];
      if (typeof handler !== 'function') continue;
      const routePath = Reflect.getMetadata(PATH_METADATA, handler);
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (routePath === undefined || method === undefined) continue;

      const permission = Reflect.getMetadata(PERMISSION_KEY, handler) ?? classPermission;
      const isPublic = Reflect.getMetadata(PUBLIC_KEY, handler) === true || classPublic;
      const operation = Reflect.getMetadata(SWAGGER_OPERATION, handler) ?? {};
      routes.push({
        method: Methods[method] ?? String(method),
        path: joinPath(controllerPath, routePath),
        access: permission ? `perm:${permission}` : isPublic ? 'Công khai' : 'Bearer',
        summary: oneLine(operation.summary),
        source: relative(CONTROLLER_DIR, file).replace(/\\/g, '/').replace(/\.js$/, '.ts'),
      });
    }
  }
}

const methodOrder = (method) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method);
routes.sort(
  (a, b) => a.path.localeCompare(b.path) || methodOrder(a.method) - methodOrder(b.method),
);

const groups = new Map();
for (const route of routes) {
  const segments = route.path.split('/').filter(Boolean);
  const key = segments[0] === 'admin' ? `admin/${segments[1] ?? ''}` : segments[0];
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(route);
}

const count = (access) => routes.filter((r) => r.access === access).length;
const lines = [
  '# Danh sách route API',
  '',
  '> **File sinh tự động** bởi `npm run docs:routes` từ metadata của controller đã biên dịch.',
  '> Đừng sửa tay — sửa controller rồi chạy lại lệnh. CI chạy `docs:routes:check`.',
  '',
  `Tiền tố chung: \`${PREFIX}\` (riêng \`/health\` nằm ngoài tiền tố). Tổng **${routes.length}** route:`,
  `${count('Công khai')} công khai, ${routes.filter((r) => r.access.startsWith('perm:')).length} cần quyền Admin, ${count('Bearer')} cần access token.`,
  '',
  'Mức truy cập: `Công khai` = không cần token; `Bearer` = cần access token (một số route còn',
  'kiểm chủ sở hữu hoặc quyền RBAC trong use case — xem `docs/API.md`); `perm:<mã>` = quyền Admin',
  'kiểm bởi guard. Chi tiết request/response ở Swagger (`/docs`) và `docs/API.md`.',
  '',
];
for (const [key, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`## \`/${key}\``, '', '| Method | Đường dẫn | Truy cập | Tóm tắt |', '| --- | --- | --- | --- |');
  for (const route of items)
    lines.push(`| \`${route.method}\` | \`${route.path}\` | ${route.access} | ${route.summary} |`);
  lines.push('');
}
const output = `${lines.join('\n').trimEnd()}\n`;

if (CHECK_ONLY) {
  let current = '';
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    current = '';
  }
  if (current !== output) {
    console.error(`${OUTPUT} lệch với controller. Chạy: npm run docs:routes`);
    process.exit(1);
  }
  console.log(`${OUTPUT} khớp ${routes.length} route.`);
} else {
  writeFileSync(OUTPUT, output);
  console.log(`Đã ghi ${OUTPUT} (${routes.length} route).`);
}
