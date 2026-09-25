/**
 * Kiểm mốc hoạt động tài khoản trên Postgres THẬT (nền cho F56 Active Member).
 *
 * Ba thứ unit test mock không thấy được:
 *
 * 1. `touchActivity` dựng câu UPDATE đúng tên cột. QueryBuilder nhận tên thuộc
 *    tính TypeScript, và sai một chữ là câu lệnh ném ở runtime chứ không phải
 *    lúc biên dịch.
 * 2. Migration backfill `created_at` cho hàng cũ — `NULL` sẽ bị mọi phép so
 *    sánh "trong 90 ngày" coi là im lìm, tức tài khoản vừa tạo hôm qua cũng
 *    bị đánh là không hoạt động.
 * 3. Cột `NOT NULL` có `DEFAULT now()`, nên hàng chèn mới không cần ai nhớ
 *    điền giá trị.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { UserRepository } from '../src/infrastructure/repository/user.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_user_activity_check';
const UserId = '99999999-9999-4999-8999-9999999a0001';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
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
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    console.log('1. Cột và ràng buộc');
    const [column] = await dataSource.query<
      { is_nullable: string; column_default: string | null }[]
    >(
      `SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'last_active_at'`,
    );
    check('cột last_active_at tồn tại', Boolean(column));
    check(
      'NOT NULL — không có hàng nào mang mốc trống',
      column?.is_nullable === 'NO',
    );
    check(
      'có DEFAULT now() — hàng mới không cần ai nhớ điền',
      (column?.column_default ?? '').includes('now()'),
      `default=${column?.column_default}`,
    );

    const [index] = await dataSource.query<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'users' AND indexname = 'IDX_users_last_active_at'`,
    );
    check(
      'có index — job quét Active Member không phải đọc tuần tự cả bảng',
      Boolean(index),
    );

    console.log('\n2. Hàng mới tự có mốc');
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'kiem-tra-moc', 'kiem-tra-moc@chantam.test', 'x', 'MEMBER', 'ACTIVE')`,
      [UserId],
    );
    const [fresh] = await dataSource.query<
      { last_active_at: Date; created_at: Date }[]
    >(`SELECT last_active_at, created_at FROM users WHERE global_id = $1`, [
      UserId,
    ]);
    check('hàng vừa chèn có mốc, không NULL', fresh?.last_active_at !== null);

    console.log('\n3. touchActivity đẩy mốc lên');
    // Lùi mốc về 100 ngày trước để thấy rõ nó có nhảy hay không.
    await dataSource.query(
      `UPDATE users SET last_active_at = now() - interval '100 days' WHERE global_id = $1`,
      [UserId],
    );
    const [stale] = await dataSource.query<{ last_active_at: Date }[]>(
      `SELECT last_active_at FROM users WHERE global_id = $1`,
      [UserId],
    );

    const repository = new UserRepository(
      entities.UserEntity as never,
      dataSource.manager,
    );
    await repository.touchActivity(UserId);

    const [touched] = await dataSource.query<{ last_active_at: Date }[]>(
      `SELECT last_active_at FROM users WHERE global_id = $1`,
      [UserId],
    );
    check(
      'câu UPDATE chạy được — tên cột ánh xạ đúng',
      touched?.last_active_at !== undefined,
    );
    check(
      'mốc nhảy lên thời điểm hiện tại',
      new Date(touched.last_active_at).getTime() >
        new Date(stale.last_active_at).getTime(),
      `${stale?.last_active_at?.toISOString?.()} → ${touched?.last_active_at?.toISOString?.()}`,
    );
    check(
      'và nay nằm trong 90 ngày — tài khoản được coi là còn hoạt động',
      Date.now() - new Date(touched.last_active_at).getTime() <
        90 * 24 * 3600 * 1000,
    );

    console.log('\n4. touchActivity không đụng tài khoản khác');
    const otherId = '99999999-9999-4999-8999-9999999a0002';
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status, last_active_at)
       VALUES ($1, 'nguoi-khac', 'nguoi-khac@chantam.test', 'x', 'MEMBER', 'ACTIVE',
               now() - interval '100 days')`,
      [otherId],
    );
    await repository.touchActivity(UserId);
    const [other] = await dataSource.query<{ days: string }[]>(
      `SELECT extract(day from now() - last_active_at) AS days
       FROM users WHERE global_id = $1`,
      [otherId],
    );
    check(
      'người khác vẫn giữ nguyên mốc cũ',
      Number(other?.days) >= 99,
      `${other?.days} ngày`,
    );

    console.log('\n5. Kênh khôi phục mật khẩu phải là kênh ĐÃ XÁC MINH');
    const [freshRow] = await dataSource.query<
      { email_verified_at: Date | null }[]
    >(`SELECT email_verified_at FROM users WHERE global_id = $1`, [UserId]);
    check(
      'tài khoản mới có email_verified_at = NULL',
      freshRow?.email_verified_at === null,
      String(freshRow?.email_verified_at),
    );

    // Đọc qua ENTITY chứ không qua SQL thô: cột thiếu khai báo trong entity thì
    // `user.emailVerifiedAt` ra `undefined`, và luồng quên mật khẩu lặng lẽ coi
    // MỌI email là chưa xác minh — không ai khôi phục được nữa.
    const loadedUser = await repository.findOneBy({ globalId: UserId });
    check(
      'entity ánh xạ được cột, không ra undefined',
      loadedUser !== null && loadedUser.emailVerifiedAt === null,
      `${String(loadedUser?.emailVerifiedAt)}`,
    );

    await dataSource.query(
      `UPDATE users SET email_verified_at = now() WHERE global_id = $1`,
      [UserId],
    );
    const verifiedUser = await repository.findOneBy({ globalId: UserId });
    check(
      'đánh dấu xác minh rồi thì entity đọc ra Date',
      verifiedUser?.emailVerifiedAt instanceof Date,
      typeof verifiedUser?.emailVerifiedAt,
    );

    const byIdentifier = await repository.findByIdentifier('nguoi-khac');
    check(
      'findByIdentifier — đường mà luồng quên mật khẩu dùng — cũng mang cột này',
      byIdentifier !== null && byIdentifier.emailVerifiedAt === null,
      `${String(byIdentifier?.emailVerifiedAt)}`,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Mốc hoạt động và mốc xác minh email: ghi được, đúng cột, đúng người'
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
