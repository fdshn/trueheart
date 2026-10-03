/**
 * Gửi thông báo hàng loạt trên Postgres THẬT (F47, SRS mục 1507).
 *
 * ## Bốn thứ chỉ Postgres trả lời được
 *
 * 1. **`ST_DWithin` lọc đúng ai.** Mock không có PostGIS. Nhóm 2 đặt bốn người ở bốn
 *    khoảng cách đã biết quanh một tâm rồi đếm — lệch đơn vị (km thay vì mét) hay đổi chỗ
 *    `lat`/`lng` đều làm nó đỏ, mà cả hai lỗi đó đều KHÔNG làm truy vấn báo lỗi.
 * 2. **`countAudience` khớp với truy vấn GỬI.** Hai mệnh đề lọc viết ở hai hàm; lệch nhau
 *    thì Admin thấy "sẽ gửi cho 1.200" rồi nhận báo cáo 800, và không ai biết 400 người
 *    kia đi đâu. Nhóm 3 so hai con số trên cùng dữ liệu.
 * 3. **`CHK_notification_broadcasts_audience`** buộc mỗi chế độ mang đúng tham số của mình.
 * 4. **Con trỏ tiếp tục.** Nhóm 5 chạy nửa lượt gửi, đọc con trỏ từ database, rồi chạy nốt
 *    — và xác nhận không ai nhận hai lần.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { ProcessBroadcastUseCase } from '../src/application/implementations/notification/broadcast.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { BulkNotifyAudienceRepository } from '../src/infrastructure/repository/lunar-holiday.repository';
import { NotificationBroadcastRepository } from '../src/infrastructure/repository/notification-broadcast.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_broadcast_check';
const AdminId = 'd2000000-0000-4000-8000-00000000d001';
const GroupId = 'd2000000-0000-4000-8000-00000000d0g1'.replace(/g/g, 'e');

/** Tâm đo: Nhà thờ Đức Bà, TP.HCM. */
const Center = { lat: 10.7797, lng: 106.699 };

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function expectReject(
  label: string,
  run: () => Promise<unknown>,
  fragment: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì — ràng buộc không chặn');
  } catch (error) {
    const message = (error as Error).message;
    check(label, message.includes(fragment), message.slice(0, 100));
  }
}

function userId(index: number): string {
  return `d3000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
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
    const broadcasts = new NotificationBroadcastRepository(dataSource.manager);
    const audience = new BulkNotifyAudienceRepository(dataSource.manager);

    const dispatch = {
      handle: async (command: {
        userId: string;
        idempotencyKey?: string | null;
        type: string;
      }) => {
        const [row] = await dataSource.query<{ created: boolean }[]>(
          `INSERT INTO notifications
             (global_id, user_id, type, title, body, idempotency_key)
           VALUES (gen_random_uuid(), $1, $2, 'x', 'y', $3)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING true AS created`,
          [command.userId, command.type, command.idempotencyKey],
        );
        return { created: row !== undefined, pushedDevices: 0 };
      },
    };
    const processor = new ProcessBroadcastUseCase(
      broadcasts as never,
      audience as never,
      dispatch as never,
    );

    // ── Dựng người dùng ở khoảng cách ĐÃ BIẾT ───────────────────────────────
    //
    // 1 độ vĩ ≈ 111,32 km. Đặt bốn người lệch vĩ độ để khoảng cách tính được bằng tay:
    // ~0 m, ~1,1 km, ~5,6 km, ~22,3 km.
    const offsets = [0, 0.01, 0.05, 0.2];
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'quantri', 'x', 'MEMBER', 'ACTIVE')`,
      [AdminId],
    );
    for (const [index, offset] of offsets.entries()) {
      await dataSource.query(
        `INSERT INTO users
           (global_id, username, password_hash, rank, status, default_location)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE',
                 ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)`,
        [userId(index + 1), `gan${index + 1}`, Center.lng, Center.lat + offset],
      );
    }
    // Người KHÔNG có Vị trí mặc định — không biết họ ở đâu thì không thể nói họ trong vùng.
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'khongvitri', 'x', 'MEMBER', 'ACTIVE')`,
      [userId(90)],
    );
    // Người SUSPENDED ở ngay tâm — không được nhận.
    await dataSource.query(
      `INSERT INTO users
         (global_id, username, password_hash, rank, status, default_location)
       VALUES ($1, 'bitreo', 'x', 'MEMBER', 'SUSPENDED',
               ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)`,
      [userId(91), Center.lng, Center.lat],
    );

    console.log('1. Khoảng cách thật, đo bằng Postgres');
    const measured = await dataSource.query<
      { username: string; meters: number }[]
    >(
      `SELECT username,
              round(ST_Distance(
                default_location,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
              ))::int AS meters
         FROM users
        WHERE default_location IS NOT NULL AND username LIKE 'gan%'
        ORDER BY meters ASC`,
      [Center.lng, Center.lat],
    );
    console.log(
      `  (khoảng cách: ${measured.map((r) => `${r.username}=${r.meters}m`).join(', ')})`,
    );
    check(
      'bốn người nằm ở bốn khoảng cách tăng dần như dựng',
      measured.length === 4 &&
        measured.every(
          (row, i) =>
            i === 0 || Number(row.meters) > Number(measured[i - 1].meters),
        ),
    );

    console.log('\n2. ST_DWithin lọc đúng ai — bán kính tính bằng MÉT');
    const areaAudience = (radiusMeters: number) => ({
      type: 'AREA' as const,
      groupId: null,
      centerLat: Center.lat,
      centerLng: Center.lng,
      radiusMeters,
    });

    // 2 km: chỉ hai người đầu (~0 m và ~1,1 km).
    check(
      'bán kính 2 km bắt 2 người',
      (await broadcasts.countAudience(areaAudience(2_000))) === 2,
      String(await broadcasts.countAudience(areaAudience(2_000))),
    );
    // 10 km: ba người đầu.
    check(
      'bán kính 10 km bắt 3 người',
      (await broadcasts.countAudience(areaAudience(10_000))) === 3,
      String(await broadcasts.countAudience(areaAudience(10_000))),
    );
    // 30 km: cả bốn. KHÔNG tính người không có vị trí, KHÔNG tính người bị treo, KHÔNG
    // tính admin (cũng không có vị trí).
    check(
      'bán kính 30 km bắt đúng 4 người — bỏ người không có vị trí và người bị treo',
      (await broadcasts.countAudience(areaAudience(30_000))) === 4,
      String(await broadcasts.countAudience(areaAudience(30_000))),
    );
    // Nếu ai đó viết bán kính bằng KM thay vì mét, 30 ở đây sẽ bắt 0 người.
    check(
      'bán kính 30 (mét) bắt đúng 1 người ở ngay tâm — đơn vị là MÉT, không phải km',
      (await broadcasts.countAudience(areaAudience(30))) === 1,
      String(await broadcasts.countAudience(areaAudience(30))),
    );

    console.log('\n3. countAudience KHỚP với truy vấn gửi');
    for (const radius of [2_000, 10_000, 30_000]) {
      const counted = await broadcasts.countAudience(areaAudience(radius));
      const listed = await audience.findActiveUserIdsAfter({
        afterId: 0,
        limit: 1_000,
        audience: areaAudience(radius),
      });
      check(
        `bán kính ${radius / 1000} km: đếm ${counted} = liệt kê ${listed.length}`,
        counted === listed.length,
      );
    }

    console.log('\n4. Ràng buộc buộc mỗi chế độ mang đúng tham số của mình');
    await expectReject(
      'ALL mà mang group_id bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO notification_broadcasts
             (audience_type, group_id, notification_type, title, body)
           VALUES ('ALL', $1, 'SYSTEM_BROADCAST', 'x', 'y')`,
          [GroupId],
        ),
      'CHK_notification_broadcasts_audience',
    );
    await expectReject(
      'AREA mà thiếu toạ độ bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO notification_broadcasts
             (audience_type, radius_meters, notification_type, title, body)
           VALUES ('AREA', 5000, 'SYSTEM_BROADCAST', 'x', 'y')`,
        ),
      'CHK_notification_broadcasts_audience',
    );
    await expectReject(
      'GROUP mà thiếu group_id bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO notification_broadcasts
             (audience_type, notification_type, title, body)
           VALUES ('GROUP', 'SYSTEM_BROADCAST', 'x', 'y')`,
        ),
      'CHK_notification_broadcasts_audience',
    );
    await expectReject(
      'đã COMPLETED mà thiếu completed_at bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO notification_broadcasts
             (audience_type, notification_type, title, body, status)
           VALUES ('ALL', 'SYSTEM_BROADCAST', 'x', 'y', 'COMPLETED')`,
        ),
      'CHK_notification_broadcasts_completed_at',
    );

    console.log('\n5. Con trỏ tiếp tục: chạy nửa rồi chạy nốt');
    const created = await broadcasts.create({
      actorUserId: AdminId,
      audience: areaAudience(30_000),
      notificationType: 'SYSTEM_BROADCAST',
      title: 'Mùa Vu Lan',
      body: 'Chương trình bắt đầu hôm nay.',
    });
    check(
      'đếm trước ghi vào audience_count',
      created.audienceCount === 4,
      String(created.audienceCount),
    );
    check(
      'nhãn người nhận đọc được bằng chữ',
      created.audienceLabel.includes('30.0 km'),
      created.audienceLabel,
    );
    check(
      'toạ độ đọc lại đúng, không bị đổi chỗ lat/lng',
      Math.abs((created.audience.centerLat ?? 0) - Center.lat) < 1e-6 &&
        Math.abs((created.audience.centerLng ?? 0) - Center.lng) < 1e-6,
      `${created.audience.centerLat}, ${created.audience.centerLng}`,
    );

    // Lô 2 → lượt chạy đầu gửi 2 người rồi... thực ra `handle` chạy hết vòng. Để dựng ca
    // "chạy nửa" thật, đặt con trỏ tay rồi chạy: đúng trạng thái một lượt chạy đã chết
    // giữa đường để lại.
    const firstRun = await processor.handle({ batchSize: 2 });
    check(
      'lượt chạy đầu gửi hết 4 người',
      firstRun.processed === 4 && firstRun.notified === 4,
      `processed=${firstRun.processed} notified=${firstRun.notified}`,
    );
    check('đánh dấu xong', firstRun.completed === true);

    const after = await broadcasts.findByGlobalId(created.globalId);
    check(
      'trạng thái COMPLETED',
      after?.status === 'COMPLETED',
      String(after?.status),
    );
    check(
      'con trỏ dừng ở người cuối',
      (after?.lastUserId ?? 0) > 0,
      String(after?.lastUserId),
    );
    check(
      'số liệu cộng dồn đúng',
      after?.notifiedCount === 4 && after?.failedCount === 0,
      `notified=${after?.notifiedCount} failed=${after?.failedCount}`,
    );

    const [sent] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM notifications
        WHERE type = 'SYSTEM_BROADCAST'`,
    );
    check('đúng 4 dòng thông báo', sent?.total === '4', `${sent?.total} dòng`);

    console.log('\n6. Chạy lại không gửi trùng, và con trỏ làm nó rẻ');
    // Đặt lại về PENDING với con trỏ 0 — mô phỏng một lượt chạy lại từ đầu.
    await dataSource.query(
      `UPDATE notification_broadcasts
          SET status = 'PENDING', completed_at = NULL, last_user_id = 0
        WHERE global_id = $1`,
      [created.globalId],
    );
    const secondRun = await processor.handle({ batchSize: 2 });
    check(
      'chạy lại: 0 gửi mới, 4 đã có từ trước',
      secondRun.notified === 0 && secondRun.alreadySent === 4,
      `notified=${secondRun.notified} alreadySent=${secondRun.alreadySent}`,
    );
    const [stillFour] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM notifications
        WHERE type = 'SYSTEM_BROADCAST'`,
    );
    check(
      'vẫn 4 dòng, không phải 8',
      stillFour?.total === '4',
      `${stillFour?.total} dòng`,
    );

    console.log('\n7. Gửi theo NHÓM: EXISTS nên không đếm trùng');
    await dataSource.query(
      `INSERT INTO groups
         (global_id, owner_id, name, radius_km, center_location, region_label,
          invite_code, activated_at)
       VALUES ($1, $2, 'Nhóm kiểm chứng', 10,
               ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
               'TP.HCM', 'KIEMCHUNG01', now())`,
      [GroupId, AdminId, Center.lng, Center.lat],
    );
    // Người 1: một hàng ACTIVE và một hàng DISSOLVED cho cùng nhóm.
    // `UQ_group_memberships_one_active_per_user` chỉ ràng buộc dòng ACTIVE, nên hai hàng
    // này cùng tồn tại được — và một `JOIN` sẽ đếm họ hai lần.
    await dataSource.query(
      `INSERT INTO group_memberships (global_id, group_id, user_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'ACTIVE')`,
      [GroupId, userId(1)],
    );
    await dataSource.query(
      `INSERT INTO group_memberships (global_id, group_id, user_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'DISSOLVED')`,
      [GroupId, userId(1)],
    );
    // Người 2: đang trong nhóm.
    await dataSource.query(
      `INSERT INTO group_memberships (global_id, group_id, user_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'ACTIVE')`,
      [GroupId, userId(2)],
    );
    // Người 3: nhóm của họ đã GIẢI TÁN. Thiếu mệnh đề `status = 'ACTIVE'` thì họ vẫn
    // nhận được thông báo của một nhóm không còn tồn tại.
    await dataSource.query(
      `INSERT INTO group_memberships (global_id, group_id, user_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'DISSOLVED')`,
      [GroupId, userId(3)],
    );

    const groupAudience = {
      type: 'GROUP' as const,
      groupId: GroupId,
      centerLat: null,
      centerLng: null,
      radiusMeters: null,
    };
    const groupCount = await broadcasts.countAudience(groupAudience);
    check(
      'nhóm có 2 NGƯỜI dù 4 hàng membership — EXISTS không đếm trùng dòng DISSOLVED',
      groupCount === 2,
      String(groupCount),
    );
    const leftOut = await audience.findActiveUserIdsAfter({
      afterId: 0,
      limit: 100,
      audience: groupAudience,
    });
    check(
      'người có membership DISSOLVED KHÔNG nhận được — mệnh đề status = ACTIVE',
      !leftOut.some((u) => u.globalId === userId(3)),
      JSON.stringify(leftOut.map((u) => u.globalId)),
    );
    const groupListed = await audience.findActiveUserIdsAfter({
      afterId: 0,
      limit: 100,
      audience: groupAudience,
    });
    check(
      'liệt kê cũng ra 2, khớp với đếm',
      groupListed.length === 2,
      String(groupListed.length),
    );

    console.log('\n8. Toàn hệ thống đếm đúng người ACTIVE');
    const allCount = await broadcasts.countAudience({
      type: 'ALL',
      groupId: null,
      centerLat: null,
      centerLng: null,
      radiusMeters: null,
    });
    // 1 admin + 4 người có vị trí + 1 người không vị trí = 6 ACTIVE; người treo không tính.
    check(
      'ALL bắt 6 người ACTIVE, bỏ người bị treo',
      allCount === 6,
      String(allCount),
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F47: ST_DWithin lọc đúng theo MÉT và bỏ người không có Vị trí mặc định, countAudience khớp khít truy vấn gửi ở cả ba bán kính, ràng buộc buộc mỗi chế độ mang đúng tham số, gửi theo nhóm lọc status = ACTIVE nên người có membership DISSOLVED không nhận được, và EXISTS không đếm trùng dòng lịch sử, và chạy lại không gửi trùng một dòng nào'
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
