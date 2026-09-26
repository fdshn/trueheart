/**
 * Kiểm khoá danh tính theo SỐ ĐIỆN THOẠI trên Postgres THẬT.
 *
 * Bốn thứ unit test mock không thấy được:
 *
 * 1. Index UNIQUE một phần `UQ_verified_phones_active` — chỉ áp cho hàng chưa
 *    giải phóng. Viết sai mệnh đề WHERE thì hoặc khoá cả hàng đã giải phóng,
 *    hoặc không khoá gì.
 * 2. `ON CONFLICT ... WHERE released_at IS NULL DO NOTHING` phải khớp ĐÚNG index
 *    một phần đó, nếu không Postgres ném "no unique or exclusion constraint
 *    matching the ON CONFLICT specification".
 * 3. Câu lệnh nắn số về E.164 chạy được trên dữ liệu thật, và phép dò va chạm
 *    nhìn ra được hai tài khoản trỏ về cùng một SIM ở hai cách gõ.
 * 4. Seed onboarding nay đánh `PHONE_VERIFIED` là bắt buộc.
 * 5. Câu tra hàng đợi Admin cho cờ độ chính xác — câu đó gom `GROUP BY` một
 *    danh sách cột dài, và thiếu một cột là lỗi lúc chạy chứ không lúc biên
 *    dịch.
 *
 *   npm run test:phone-identity
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminUserRepository } from '../src/infrastructure/repository/admin-user.repository';
import { VerifiedPhoneRepository } from '../src/infrastructure/repository/verified-phone.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_phone_identity_check';
const FirstUserId = '99999999-9999-4999-8999-9999999b0001';
const SecondUserId = '99999999-9999-4999-8999-9999999b0002';
const Phone = '+84912345678';

const NormalizeSql = `
  CASE
    WHEN phone LIKE '+%' THEN phone
    WHEN phone LIKE '0%' THEN '+84' || substring(phone from 2)
    WHEN phone LIKE '84%' THEN '+' || phone
    ELSE '+84' || phone
  END
`;

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

  const verifiedPhones = new VerifiedPhoneRepository(dataSource.manager, {
    security: { phoneHashPepper: 'hat-tieu-cho-kiem-thu' },
  } as never);

  try {
    console.log('1. Onboarding nay ĐÒI xác minh SĐT');
    const tasks = await dataSource.query<{ key: string; required: boolean }[]>(
      `SELECT key, required FROM onboarding_tasks ORDER BY sort_order`,
    );
    check(
      'PHONE_VERIFIED là nhiệm vụ bắt buộc',
      tasks.find((task) => task.key === 'PHONE_VERIFIED')?.required === true,
    );
    check(
      'PROFILE_COMPLETE vẫn bắt buộc',
      tasks.find((task) => task.key === 'PROFILE_COMPLETE')?.required === true,
    );

    for (const [id, name] of [
      [FirstUserId, 'nguoi-thu-nhat'],
      [SecondUserId, 'nguoi-thu-hai'],
    ] as const)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, name],
      );

    console.log('\n2. Sổ số đã xác minh');
    check(
      'người đầu tiên nhận được số',
      (await verifiedPhones.claim({ phone: Phone, userId: FirstUserId })) ===
        'CLAIMED',
    );
    check(
      'chính người đó xác minh lại vẫn qua',
      (await verifiedPhones.claim({ phone: Phone, userId: FirstUserId })) ===
        'ALREADY_OWN',
    );
    check(
      'người KHÁC bị chặn — đây là chỗ khoá vòng lặp tài khoản ảo',
      (await verifiedPhones.claim({ phone: Phone, userId: SecondUserId })) ===
        'TAKEN',
    );

    const [stored] = await dataSource.query<{ phone_hash: string }[]>(
      `SELECT phone_hash FROM verified_phones LIMIT 1`,
    );
    check(
      'lưu BĂM, không lưu số đọc được',
      stored !== undefined && !stored.phone_hash.includes('84912345678'),
      stored?.phone_hash.slice(0, 16),
    );

    console.log('\n3. Gỡ số khỏi hồ sơ KHÔNG trả số lại cho người khác');
    // Đây đúng là lỗ cũ: phép kiểm trùng chỉ nhìn `users.phone` hiện tại, nên
    // gỡ số ra là số đó tự do cho tài khoản tiếp theo.
    await dataSource.query(
      `UPDATE users SET phone = NULL, phone_verified_at = NULL WHERE global_id = $1`,
      [FirstUserId],
    );
    check(
      'gỡ số xong, người khác VẪN không lấy được',
      (await verifiedPhones.claim({ phone: Phone, userId: SecondUserId })) ===
        'TAKEN',
    );

    console.log('\n4. Van xả: Admin giải phóng số');
    // Người giữ còn sống và vẫn mang dấu xác minh thì KHÔNG giải phóng ngang
    // được — lúc đó là tranh chấp giữa hai người thật.
    await dataSource.query(
      `UPDATE users SET phone_verified_at = now() WHERE global_id = $1`,
      [FirstUserId],
    );
    const blocked = await verifiedPhones.release({
      phone: Phone,
      actorUserId: SecondUserId,
      reason: 'thu giai phong khi chu con song',
    });
    check(
      'chủ còn sống và còn dấu xác minh thì TỪ CHỐI',
      blocked.status === 'IN_USE',
      blocked.status,
    );

    await dataSource.query(
      `UPDATE users SET phone_verified_at = NULL WHERE global_id = $1`,
      [FirstUserId],
    );
    const released = await verifiedPhones.release({
      phone: Phone,
      actorUserId: SecondUserId,
      reason: 'chu cu mat tai khoan, da xac minh qua ho tro',
    });
    check(
      'gỡ dấu xác minh rồi thì giải phóng được',
      released.status === 'RELEASED',
      released.status,
    );

    const [audit] = await dataSource.query<{ total: string; reason: string }[]>(
      `SELECT count(*)::text AS total, max(reason) AS reason
       FROM admin_audit_logs WHERE action = 'RELEASE_VERIFIED_PHONE'`,
    );
    check(
      'ghi đúng một dòng audit kèm lý do',
      Number(audit?.total) === 1 &&
        audit?.reason === 'chu cu mat tai khoan, da xac minh qua ho tro',
      `${audit?.total} dòng`,
    );

    check(
      'giải phóng lần hai thì không còn gì để giải phóng',
      (
        await verifiedPhones.release({
          phone: Phone,
          actorUserId: SecondUserId,
          reason: 'bam nham lan hai',
        })
      ).status === 'NOT_FOUND',
    );
    check(
      'giải phóng rồi thì người khác nhận được',
      (await verifiedPhones.claim({ phone: Phone, userId: SecondUserId })) ===
        'CLAIMED',
    );
    const [rows] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM verified_phones`,
    );
    check(
      'hàng cũ GIỮ LẠI để tra lại được',
      Number(rows?.total) === 2,
      `${rows?.total} dòng`,
    );

    console.log('\n5. Nắn số về E.164');
    await dataSource.query(
      `UPDATE users SET phone = '0987654321' WHERE global_id = $1`,
      [FirstUserId],
    );
    await dataSource.query(`
      UPDATE users SET phone = ${NormalizeSql}
      WHERE phone IS NOT NULL AND phone NOT LIKE '+%'
    `);
    const [normalized] = await dataSource.query<{ phone: string }[]>(
      `SELECT phone FROM users WHERE global_id = $1`,
      [FirstUserId],
    );
    check(
      '0987654321 thành +84987654321',
      normalized?.phone === '+84987654321',
      normalized?.phone,
    );

    // Hai cách gõ cùng một SIM: index UNIQUE trên `users.phone` không chặn được
    // vì nó so chuỗi — đó là lý do migration phải tự dò và ném.
    await dataSource.query(
      `UPDATE users SET phone = '0987654321' WHERE global_id = $1`,
      [SecondUserId],
    );
    const clashes = await dataSource.query<{ normalized: string }[]>(`
      WITH normalized AS (
        SELECT global_id, ${NormalizeSql} AS normalized
        FROM users
        WHERE phone IS NOT NULL AND deleted_at IS NULL
      )
      SELECT normalized FROM normalized
      GROUP BY normalized HAVING count(*) > 1
    `);
    check(
      'dò ra hai tài khoản chung một SIM ở hai cách gõ',
      clashes.length === 1 && clashes[0]?.normalized === '+84987654321',
      `${clashes.length} số trùng`,
    );

    console.log('\n6. Hàng đợi Admin cho cờ độ chính xác');
    const adminUsers = new AdminUserRepository(dataSource.manager);
    await dataSource.query(
      `UPDATE users
       SET accuracy_review_required = true, giver_accuracy_percent = 62,
           giver_accuracy_samples = 9
       WHERE global_id = $1`,
      [FirstUserId],
    );

    const flagged = await adminUsers.search({
      accuracyReviewRequired: true,
      skip: 0,
      take: 20,
    });
    check(
      'lọc ra ĐÚNG người bị gắn cờ',
      flagged.total === 1 && flagged.entries[0]?.userId === FirstUserId,
      `${flagged.total} người`,
    );
    check(
      'kèm luôn chỉ số để Admin quyết ngay, không phải mở từng hồ sơ',
      flagged.entries[0]?.giverAccuracyPercent === 62 &&
        flagged.entries[0]?.giverAccuracySamples === 9,
      `${flagged.entries[0]?.giverAccuracyPercent}% / ${flagged.entries[0]?.giverAccuracySamples} mẫu`,
    );

    const notFlagged = await adminUsers.search({
      accuracyReviewRequired: false,
      skip: 0,
      take: 20,
    });
    check(
      'lọc ngược lại thì không có người đó',
      !notFlagged.entries.some((row) => row.userId === FirstUserId),
    );
    check(
      'và danh sách mang cả cờ xác minh email',
      typeof flagged.entries[0]?.emailVerified === 'boolean',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Danh tính theo SĐT khoá được, và hàng đợi cờ độ chính xác tra được'
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
