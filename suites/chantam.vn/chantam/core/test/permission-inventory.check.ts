/**
 * Mọi mã quyền Admin mà code KIỂM phải có dòng trong `admin_permissions`, và
 * SUPER_ADMIN phải giữ đủ mọi quyền.
 *
 * ## Vì sao cần một phép kiểm riêng
 *
 * Gõ sai một mã quyền — `@RequiresPermission('merit.raed')` — không làm gì đổ lúc
 * build hay lúc chạy unit test: guard và use case đều hỏi `hasPermission`, mà unit
 * test mock `hasPermission`. Ngoài production thì `hasPermission` trả `false` cho MỌI
 * người kể cả SUPER_ADMIN, và route đó lặng lẽ 403 vĩnh viễn. Không ai biết cho tới
 * khi có người bấm.
 *
 * Chiều NGƯỢC LẠI cũng hỏng lặng lẽ: một quyền có dòng mà không code nào kiểm là
 * một ô tick chết trong ma trận phân quyền — Admin bỏ tick, tưởng đã khoá, mà không
 * gì thay đổi. Nên mỗi quyền trong bảng phải được code dùng, hoặc nằm trong
 * `KnownUncheckedPermissions` kèm lý do.
 *
 * ## SUPER_ADMIN giữ đủ mọi quyền
 *
 * Từ 16/10 CMS sửa được role nhưng KHÔNG sửa được SUPER_ADMIN, vì quyền mới được
 * migration gắn cho nó lúc deploy. Một migration thêm quyền mà quên gắn cho
 * SUPER_ADMIN thì không còn đường nào trong CMS để vá — chỉ chỗ này bắt được.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DataSource } from 'typeorm';
import { EnforcedGroupPermissions } from '../src/application/contracts/admin-config';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_permission_inventory_check';

/** Có dòng trong bảng nhưng chưa code nào kiểm — mỗi dòng phải nói vì sao. */
const KnownUncheckedPermissions: Readonly<Record<string, string>> = {};

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === 'migrations' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

/**
 * Mã quyền code thật sự kiểm, kèm nơi dùng.
 *
 * Bốn dạng có trong code: decorator, lời gọi `hasPermission(actor, '...')`, hằng
 * `XPermission = '...'` và mảng `XPermissions = [...]`. Thêm một dạng thứ năm mà
 * không thêm vào đây thì mã đó không được kiểm — nên dạng nào cũng phải đi qua
 * một trong bốn lối này.
 */
function permissionsUsedInCode(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  const add = (code: string, file: string) => {
    if (!used.has(code)) used.set(code, new Set());
    used.get(code)?.add(basename(file));
  };
  const code = String.raw`([a-z_]+\.[a-z_.]+)`;
  const patterns = [
    new RegExp(String.raw`RequiresPermission\(\s*'${code}'`, 'g'),
    new RegExp(String.raw`hasPermission\([^)]*?'${code}'`, 'g'),
    new RegExp(
      String.raw`\b\w*Permission\w*\s*(?::\s*[\w<>]+)?\s*=\s*'${code}'`,
      'g',
    ),
  ];
  const arrayPattern = /\b\w*Permissions\w*\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g;

  for (const file of sourceFiles(join(__dirname, '..', 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of patterns)
      for (const match of text.matchAll(pattern))
        add(match[match.length - 1], file);
    for (const match of text.matchAll(arrayPattern))
      for (const quoted of match[1].matchAll(new RegExp(`'${code}'`, 'g')))
        add(quoted[1], file);
  }

  // Quyền NHÓM nằm ở `group_role_permissions`, không phải bảng quyền Admin.
  for (const groupPermission of EnforcedGroupPermissions)
    used.delete(groupPermission);
  return used;
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const opened: DataSource[] = [];
  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  opened.push(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const used = permissionsUsedInCode();
    const seeded = new Set(
      (
        await dataSource.query<{ code: string }[]>(
          `SELECT code FROM admin_permissions`,
        )
      ).map((row) => row.code),
    );

    console.log('1. Mã quyền code kiểm đều có trong admin_permissions');
    check(
      'quét được mã quyền từ mã nguồn (không phải regex trượt hết)',
      used.size >= 20,
      `${used.size} mã`,
    );
    const missing = [...used.keys()].filter((code) => !seeded.has(code));
    check(
      'không mã nào code kiểm mà bảng không có',
      missing.length === 0,
      missing
        .map((code) => `${code} (${[...(used.get(code) ?? [])].join(', ')})`)
        .join('; '),
    );

    console.log('\n2. Mỗi quyền trong bảng đều có code kiểm');
    const unchecked = [...seeded].filter(
      (code) => !used.has(code) && !(code in KnownUncheckedPermissions),
    );
    check(
      'không ô tick chết trong ma trận phân quyền',
      unchecked.length === 0,
      unchecked.join(', '),
    );
    const staleAllowlist = Object.keys(KnownUncheckedPermissions).filter(
      (code) => used.has(code) || !seeded.has(code),
    );
    check(
      'danh sách ngoại lệ không còn mã đã được kiểm hoặc đã bị xoá',
      staleAllowlist.length === 0,
      staleAllowlist.join(', '),
    );

    console.log('\n3. SUPER_ADMIN giữ đủ mọi quyền');
    const [superAdmin] = await dataSource.query<{ missing: string[] | null }[]>(
      `SELECT ARRAY(
         SELECT permission.code FROM admin_permissions permission
         WHERE NOT EXISTS (
           SELECT 1 FROM admin_role_permissions role_permission
           INNER JOIN admin_roles role ON role.id = role_permission.role_id
           WHERE role.code = 'SUPER_ADMIN'
             AND role_permission.permission_id = permission.id
         )
         ORDER BY permission.code
       ) AS missing`,
    );
    check(
      'SUPER_ADMIN có mọi quyền trong bảng',
      (superAdmin?.missing ?? []).length === 0,
      (superAdmin?.missing ?? []).join(', '),
    );
    const [{ active }] = await dataSource.query<{ active: boolean }[]>(
      `SELECT is_active AS active FROM admin_roles WHERE code = 'SUPER_ADMIN'`,
    );
    check('SUPER_ADMIN đang bật', active === true);
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Quyền Admin: mọi mã code kiểm đều có trong bảng, mọi quyền trong bảng đều được kiểm, và SUPER_ADMIN giữ đủ mọi quyền'
        : `${failures.length} phép kiểm thất bại`
    }`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
