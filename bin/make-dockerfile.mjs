#!/usr/bin/env node
/**
 * Sinh Dockerfile multi-stage cho package hiện tại.
 *
 * Trong monorepo dùng dependency `file:`, Dockerfile phải copy đúng cây phụ thuộc
 * nội bộ (và chỉ cây đó) để tận dụng cache layer của Docker. Viết tay thì sai
 * ngay lần đầu và lệch dần sau mỗi lần thêm dependency — nên sinh tự động.
 *
 * Dùng: cd <package> && node ../../bin/make-dockerfile.mjs > Dockerfile
 *       (hoặc: npm run docker:generate)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const NODE_IMAGE = 'node:22';
const RUNNER_IMAGE = 'node:22-slim';

/** Đi ngược lên cho tới package.json có khai báo `workspaces` — đó là gốc monorepo. */
function findRepoRoot(startDir) {
  let current = resolve(startDir);

  for (;;) {
    const manifest = join(current, 'package.json');

    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf-8'));
      if (parsed.workspaces) return current;
    }

    const parent = dirname(current);
    if (parent === current)
      throw new Error('Không tìm thấy gốc monorepo (package.json có "workspaces")');

    current = parent;
  }
}

function readManifest(packageDir) {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'));
}

/** Chuẩn hoá đường dẫn cho Dockerfile: luôn dùng dấu "/" kể cả khi chạy trên Windows. */
function toPosix(path) {
  return path.split(sep).join('/');
}

/**
 * Duyệt đệ quy toàn bộ dependency `file:` và trả về đường dẫn tương đối so với
 * gốc monorepo, theo thứ tự phụ thuộc (lá trước, gốc sau).
 */
function collectLocalDependencies(packageDir, repoRoot, seen = new Set()) {
  const manifest = readManifest(packageDir);
  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };

  const collected = [];

  for (const specifier of Object.values(dependencies)) {
    if (typeof specifier !== 'string' || !specifier.startsWith('file:')) continue;

    const dependencyDir = resolve(packageDir, specifier.slice('file:'.length));
    const relativePath = toPosix(relative(repoRoot, dependencyDir));

    if (seen.has(relativePath)) continue;
    seen.add(relativePath);

    collected.push(...collectLocalDependencies(dependencyDir, repoRoot, seen));
    collected.push(relativePath);
  }

  return collected;
}

const packageDir = process.cwd();
const repoRoot = findRepoRoot(packageDir);
const manifest = readManifest(packageDir);
const packagePath = toPosix(relative(repoRoot, packageDir));
const localDependencies = collectLocalDependencies(packageDir, repoRoot);

const lines = [
  `# Sinh tự động bởi bin/make-dockerfile.mjs cho package: ${manifest.name}`,
  '# Không sửa tay — chạy lại `npm run docker:generate` sau khi đổi dependency.',
  '',
  `FROM ${NODE_IMAGE} AS builder`,
  '',
  'WORKDIR /app',
  '',
  '# Copy manifest trước để layer cài đặt được cache lại khi source thay đổi',
];

for (const dependencyPath of localDependencies)
  lines.push(`COPY ./${dependencyPath}/package.json ./${dependencyPath}/package.json`);

lines.push(
  `COPY ./${packagePath}/package.json ./${packagePath}/package.json`,
  'COPY ./package.json ./package-lock.json ./lerna.json ./',
  '',
  'RUN npm ci',
  '',
  '# Copy source',
);

for (const dependencyPath of localDependencies)
  lines.push(`COPY ./${dependencyPath}/ ./${dependencyPath}/`);

lines.push(
  `COPY ./${packagePath}/ ./${packagePath}/`,
  '',
  '# Build thư viện phụ thuộc trước, rồi tới package đích',
);

for (const dependencyPath of localDependencies)
  lines.push(`RUN npm run build --workspace ./${dependencyPath}`);

lines.push(
  `RUN npm run build --workspace ./${packagePath}`,
  '',
  'RUN npm prune --omit=dev',
  '',
  '# Bỏ source và test khỏi image cuối',
  // `-name node_modules -prune` chứ KHÔNG phải `-path ./node_modules`: dạng sau
  // chỉ bỏ qua node_modules ở gốc, nên find vẫn chui vào các node_modules lồng
  // nhau và xoá thư mục src của những package npm có ship kèm source.
  "RUN find . -name node_modules -prune -o -type d \\( -name src -o -name test \\) -print0 \\",
  '  | xargs -0 rm -rf',
  '',
  `FROM ${RUNNER_IMAGE} AS runner`,
  '',
  'COPY --from=builder /app /app',
  '',
  `WORKDIR /app/${packagePath}`,
  '',
  'ENV NODE_ENV=production',
  'USER node',
  '',
  'CMD ["npm", "start"]',
  '',
);

process.stdout.write(lines.join('\n'));
