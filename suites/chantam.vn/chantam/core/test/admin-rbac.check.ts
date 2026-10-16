/**
 * Tạo/sửa role Admin trên Postgres THẬT.
 *
 * ## Bốn thứ chỉ Postgres trả lời được
 *
 * 1. **Lỗi giữa chừng phải cuộn lại hết.** Tạo role kèm permission lạ, hay sửa role làm
 *    chính mình mất `admin.manage`, đều ném SAU khi đã ghi một phần. Mock không có
 *    transaction nên không thấy được dòng nào còn sót lại.
 * 2. **Kiểm khoá-mình-ra-ngoài trên trạng thái chưa commit.** `hasPermissionWith` phải
 *    đọc qua `manager` của transaction; đọc qua kết nối khác là thấy trạng thái cũ và
 *    cho qua.
 * 3. **`ON CONFLICT (code)`** khớp đúng ràng buộc `UQ_admin_roles_code`.
 * 4. **Tắt role là mất quyền ngay** — `hasPermission` lọc `role.is_active`.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CreateAdminRoleUseCase,
  UpdateAdminRoleUseCase,
} from '../src/application/implementations/admin-config/admin-role-definition.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_admin_rbac_check';
/** Chỉ có admin.manage qua đúng một role tự tạo — dễ tự khoá mình. */
const SoleManagerId = 'a9000000-0000-4000-8000-000000000001';
/** SUPER_ADMIN — vẫn giữ admin.manage dù role kia bị gỡ quyền. */
const SuperId = 'a9000000-0000-4000-8000-000000000002';
/** Chỉ giữ role CONTENT_EDITOR, dùng để đo tắt role. */
const EditorId = 'a9000000-0000-4000-8000-000000000003';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function expectThrow(
  label: string,
  run: () => Promise<unknown>,
  errorName: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì');
  } catch (error) {
    const name = (error as Error).constructor.name;
    check(label, name === errorName, name);
  }
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
    const repository = new AdminConfigRepository(dataSource.manager);
    const create = new CreateAdminRoleUseCase(repository);
    const update = new UpdateAdminRoleUseCase(repository);

    for (const [id, username] of [
      [SoleManagerId, 'quanly'],
      [SuperId, 'goc'],
      [EditorId, 'bientap'],
    ])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );
    await dataSource.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'SUPER_ADMIN'`,
      [SuperId],
    );

    const auditCount = async (action: string, code: string) =>
      Number(
        (
          await dataSource.query<{ total: string }[]>(
            `SELECT COUNT(*) AS total FROM admin_audit_logs
             WHERE action = $1 AND resource_type = 'ADMIN_ROLE_DEFINITION'
               AND resource_id = $2`,
            [action, code],
          )
        )[0].total,
      );
    const permissionsOf = async (code: string) =>
      (await repository.listRoles()).find((role) => role.code === code)
        ?.permissions ?? null;

    console.log('1. Danh mục permission');
    const permissions = await repository.listPermissions();
    check(
      'có permission và mô tả không rỗng',
      permissions.length > 0 &&
        permissions.every((permission) => permission.description.length > 0),
      `${permissions.length} permission`,
    );
    check(
      'có admin.manage trong danh mục',
      permissions.some((permission) => permission.code === 'admin.manage'),
    );

    console.log('\n2. Tạo role');
    const { roles } = await create.handle({
      actorUserId: SuperId,
      role: {
        code: 'ROLE_MANAGER',
        name: 'Quản lý phân quyền',
        permissions: ['admin.manage', 'admin.access'],
        reason: 'Tách người cấp quyền',
      },
    });
    check(
      'trả ma trận có role mới',
      roles.some((role) => role.code === 'ROLE_MANAGER' && role.isActive),
    );
    check(
      'ghi đúng bộ quyền',
      JSON.stringify(await permissionsOf('ROLE_MANAGER')) ===
        JSON.stringify(['admin.access', 'admin.manage']),
      JSON.stringify(await permissionsOf('ROLE_MANAGER')),
    );
    check(
      'ghi một audit CREATE_ROLE',
      (await auditCount('CREATE_ROLE', 'ROLE_MANAGER')) === 1,
    );

    await expectThrow(
      'trùng mã role bị từ chối',
      () =>
        create.handle({
          actorUserId: SuperId,
          role: {
            code: 'MODERATOR',
            name: 'Trùng',
            permissions: [],
            reason: 'Thử trùng',
          },
        }),
      'AdminRoleCodeConflictException',
    );
    await expectThrow(
      'permission lạ bị từ chối',
      () =>
        create.handle({
          actorUserId: SuperId,
          role: {
            code: 'BROKEN_ROLE',
            name: 'Hỏng',
            permissions: ['admin.access', 'post.fly'],
            reason: 'Thử quyền lạ',
          },
        }),
      'AdminPermissionUnknownException',
    );
    check(
      'role hỏng không còn sót lại',
      (await permissionsOf('BROKEN_ROLE')) === null,
    );

    console.log('\n3. Sửa bộ quyền');
    await dataSource.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'ROLE_MANAGER'`,
      [SoleManagerId],
    );
    await create.handle({
      actorUserId: SuperId,
      role: {
        code: 'CONTENT_EDITOR',
        name: 'Biên tập',
        permissions: ['admin.access'],
        reason: 'Nhóm biên tập',
      },
    });
    await dataSource.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'CONTENT_EDITOR'`,
      [EditorId],
    );

    const someOther = permissions
      .map((permission) => permission.code)
      .filter((code) => code !== 'admin.manage' && code !== 'admin.access')
      .slice(0, 2)
      .sort();
    await update.handle({
      actorUserId: SoleManagerId,
      roleCode: 'CONTENT_EDITOR',
      role: { permissions: someOther, reason: 'Thay trọn bộ quyền' },
    });
    check(
      'permissions là trọn bộ thay thế, không cộng dồn',
      JSON.stringify(await permissionsOf('CONTENT_EDITOR')) ===
        JSON.stringify(someOther),
      JSON.stringify(await permissionsOf('CONTENT_EDITOR')),
    );
    const [audit] = await dataSource.query<
      { before_json: { permissions: string[] }; after_json: unknown }[]
    >(
      `SELECT before_json, after_json FROM admin_audit_logs
       WHERE action = 'UPDATE_ROLE' AND resource_id = 'CONTENT_EDITOR'`,
    );
    check(
      'audit UPDATE_ROLE giữ bộ quyền cũ',
      JSON.stringify(audit?.before_json.permissions) ===
        JSON.stringify(['admin.access']),
    );

    await update.handle({
      actorUserId: SoleManagerId,
      roleCode: 'CONTENT_EDITOR',
      role: { permissions: someOther, reason: 'Gửi lại y nguyên' },
    });
    check(
      'gửi lại đúng trạng thái cũ không ghi audit mới',
      (await auditCount('UPDATE_ROLE', 'CONTENT_EDITOR')) === 1,
    );

    console.log('\n4. Không tự khoá mình ra ngoài');
    await expectThrow(
      'gỡ admin.manage khỏi role duy nhất cho mình quyền đó',
      () =>
        update.handle({
          actorUserId: SoleManagerId,
          roleCode: 'ROLE_MANAGER',
          role: { permissions: ['admin.access'], reason: 'Tự gỡ' },
        }),
      'AdminRoleSelfLockoutException',
    );
    check(
      'bộ quyền được cuộn lại nguyên vẹn',
      JSON.stringify(await permissionsOf('ROLE_MANAGER')) ===
        JSON.stringify(['admin.access', 'admin.manage']),
      JSON.stringify(await permissionsOf('ROLE_MANAGER')),
    );
    await expectThrow(
      'tắt role duy nhất cho mình admin.manage',
      () =>
        update.handle({
          actorUserId: SoleManagerId,
          roleCode: 'ROLE_MANAGER',
          role: { isActive: false, reason: 'Tự tắt' },
        }),
      'AdminRoleSelfLockoutException',
    );
    check(
      'role vẫn bật sau khi bị từ chối',
      (await repository.listRoles()).find(
        (role) => role.code === 'ROLE_MANAGER',
      )?.isActive === true,
    );
    check(
      'không ghi audit cho thay đổi bị cuộn lại',
      (await auditCount('UPDATE_ROLE', 'ROLE_MANAGER')) === 0,
    );

    await update.handle({
      actorUserId: SuperId,
      roleCode: 'ROLE_MANAGER',
      role: { permissions: ['admin.access'], reason: 'Thu về SUPER_ADMIN' },
    });
    check(
      'SUPER_ADMIN gỡ được vì vẫn giữ admin.manage qua role gốc',
      !(await repository.hasPermission(SoleManagerId, 'admin.manage')),
    );

    console.log('\n5. Tắt role và các ca từ chối');
    const editorPermission = someOther[0];
    check(
      'trước khi tắt, người giữ role có quyền',
      await repository.hasPermission(EditorId, editorPermission),
    );
    await update.handle({
      actorUserId: SuperId,
      roleCode: 'CONTENT_EDITOR',
      role: { isActive: false, name: 'Biên tập (tạm dừng)', reason: 'Dừng' },
    });
    check(
      'tắt role là mất quyền ngay',
      !(await repository.hasPermission(EditorId, editorPermission)),
    );
    check(
      'đổi tên cùng lượt',
      (await repository.listRoles()).find(
        (role) => role.code === 'CONTENT_EDITOR',
      )?.name === 'Biên tập (tạm dừng)',
    );

    await expectThrow(
      'role không tồn tại',
      () =>
        update.handle({
          actorUserId: SuperId,
          roleCode: 'NO_SUCH_ROLE',
          role: { name: 'X', reason: 'Thử' },
        }),
      'AdminRoleNotFoundException',
    );
    await expectThrow(
      'SUPER_ADMIN không sửa được',
      () =>
        update.handle({
          actorUserId: SuperId,
          roleCode: 'SUPER_ADMIN',
          role: { isActive: false, reason: 'Thử' },
        }),
      'AdminRoleProtectedException',
    );
    await expectThrow(
      'người mất admin.manage không sửa được nữa',
      () =>
        update.handle({
          actorUserId: SoleManagerId,
          roleCode: 'MODERATOR',
          role: { name: 'X', reason: 'Thử' },
        }),
      'ForbiddenException',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'RBAC: tạo/sửa role cuộn lại trọn vẹn khi lỗi giữa chừng, permissions là thay thế trọn bộ, không ai tự khoá mình ra khỏi admin.manage, tắt role là mất quyền ngay, và SUPER_ADMIN không sửa được từ CMS'
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
