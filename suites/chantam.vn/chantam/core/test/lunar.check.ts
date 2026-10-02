/**
 * Lịch Âm và danh mục Ngày lễ trên Postgres THẬT (F46, UC-LUNAR-01).
 *
 * ## Bốn thứ chỉ Postgres trả lời được
 *
 * 1. **Danh mục seed có thật không.** Mười ngày lễ được chèn trong migration; một lỗi
 *    chính tả trong câu `INSERT` không làm build đỏ, và app sẽ không có huy hiệu nào.
 * 2. **`UQ_lunar_holidays_date`** chặn hai ngày lễ cùng một ngày âm lịch.
 * 3. **`CHK_lunar_holidays_day`** chặn ngày 31 — tháng âm lịch không bao giờ có.
 * 4. **`replaceAll` chạy trong MỘT transaction.** Nó `DELETE` cả bảng rồi chèn lại; một
 *    lượt chèn hỏng giữa đường mà không rollback sẽ để lại danh mục RỖNG, tức app mất hết
 *    huy hiệu. Nhóm 4 dựng đúng ca đó.
 *
 * Phần chuyển đổi âm lịch là số học thuần và đã có 23 phép kiểm ở `core-lib`, trong đó bảy
 * ca là ngày thật tra độc lập. Không lặp lại ở đây — nhưng nhóm 5 đối chiếu một lượt
 * đầu-cuối: ngày Vu Lan 2026 phải tra ra đúng dòng trong bảng.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { GetLunarTodayUseCase } from '../src/application/implementations/lunar/lunar.use-cases';
import { NotifyLunarObservanceUseCase } from '../src/application/implementations/lunar/notify-lunar-observance.use-case';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import {
  BulkNotifyAudienceRepository,
  LunarHolidayRepository,
} from '../src/infrastructure/repository/lunar-holiday.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_lunar_check';
const AdminId = 'b1000000-0000-4000-8000-00000000b001';

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
    const repository = new LunarHolidayRepository(dataSource.manager);

    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'quantri', 'x', 'MEMBER', 'ACTIVE')`,
      [AdminId],
    );

    console.log('1. Danh mục seed có thật, và BẬT');
    const seeded = await repository.listAll();
    check('seed đúng 10 ngày lễ', seeded.length === 10, String(seeded.length));
    check(
      'mọi dòng seed đều đang bật',
      seeded.every((h) => h.isActive),
      JSON.stringify(seeded.filter((h) => !h.isActive).map((h) => h.name)),
    );
    check(
      'sortOrder liên tục từ 1',
      JSON.stringify(seeded.map((h) => h.sortOrder)) ===
        JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      JSON.stringify(seeded.map((h) => h.sortOrder)),
    );
    // Ba mốc lớn nhất phải có mặt — thiếu một trong ba là danh mục sai, không phải thiếu.
    for (const [month, day, name] of [
      [1, 1, 'Tết Nguyên Đán'],
      [4, 15, 'Đại lễ Phật Đản'],
      [7, 15, 'Đại lễ Vu Lan Báo Hiếu'],
    ] as const) {
      const found = await repository.findByLunarDate(month, day);
      check(
        `${day}/${month} ÂL là "${name}"`,
        found?.name === name,
        String(found?.name),
      );
    }

    console.log('\n2. Ràng buộc chặn dữ liệu sai');
    await expectReject(
      'hai ngày lễ cùng một ngày âm lịch bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO lunar_holidays (lunar_month, lunar_day, name)
           VALUES (7, 15, 'Trùng Vu Lan')`,
        ),
      'UQ_lunar_holidays_date',
    );
    await expectReject(
      'ngày 31 âm lịch bị từ chối — tháng âm lịch không bao giờ có',
      () =>
        dataSource.query(
          `INSERT INTO lunar_holidays (lunar_month, lunar_day, name)
           VALUES (5, 31, 'Ngày không tồn tại')`,
        ),
      'CHK_lunar_holidays_day',
    );
    await expectReject(
      'tháng 13 bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO lunar_holidays (lunar_month, lunar_day, name)
           VALUES (13, 1, 'Tháng không tồn tại')`,
        ),
      'CHK_lunar_holidays_month',
    );

    console.log(
      '\n3. Dòng đã TẮT không ra đường công khai nhưng vẫn ở danh mục',
    );
    await dataSource.query(
      `UPDATE lunar_holidays SET is_active = false WHERE lunar_month = 4 AND lunar_day = 15`,
    );
    check(
      'tra ngày lễ đã tắt trả null',
      (await repository.findByLunarDate(4, 15)) === null,
    );
    const afterDisable = await repository.listAll();
    check(
      'nhưng listAll vẫn thấy nó — CMS cần để bật lại',
      afterDisable.length === 10 &&
        afterDisable.some((h) => h.lunarMonth === 4 && !h.isActive),
    );

    console.log('\n4. replaceAll là MỘT transaction');
    const replaced = await repository.replaceAll({
      actorUserId: AdminId,
      holidays: [
        {
          lunarMonth: 1,
          lunarDay: 1,
          name: 'Tết',
          description: null,
          isActive: true,
        },
        {
          lunarMonth: 7,
          lunarDay: 15,
          name: 'Vu Lan',
          description: 'Mùa báo hiếu',
          isActive: true,
        },
        {
          lunarMonth: 4,
          lunarDay: 15,
          name: 'Phật Đản',
          description: null,
          isActive: false,
        },
      ],
    });
    check(
      'thay cả bộ còn đúng 3 dòng',
      replaced.length === 3,
      String(replaced.length),
    );
    check(
      'sortOrder do VỊ TRÍ trong mảng quyết định',
      JSON.stringify(replaced.map((h) => [h.sortOrder, h.name])) ===
        JSON.stringify([
          [1, 'Tết'],
          [2, 'Vu Lan'],
          [3, 'Phật Đản'],
        ]),
      JSON.stringify(replaced.map((h) => [h.sortOrder, h.name])),
    );
    check(
      'updated_by được ghi',
      (
        await dataSource.query<{ count: string }[]>(
          `SELECT count(*)::text AS count FROM lunar_holidays WHERE updated_by = $1`,
          [AdminId],
        )
      )[0]?.count === '3',
    );

    // Ca quyết định: một lượt thay cả bộ mà chèn hỏng giữa đường PHẢI rollback, nếu không
    // bảng còn lại rỗng và app mất hết huy hiệu.
    let rolledBack = false;
    try {
      await repository.replaceAll({
        actorUserId: AdminId,
        holidays: [
          {
            lunarMonth: 2,
            lunarDay: 8,
            name: 'Hợp lệ',
            description: null,
            isActive: true,
          },
          // Ngày 31 không qua được CHECK — chèn này sẽ ném giữa vòng lặp.
          {
            lunarMonth: 3,
            lunarDay: 31,
            name: 'Sai ngày',
            description: null,
            isActive: true,
          },
        ],
      });
    } catch {
      rolledBack = true;
    }
    check('lượt thay có dòng sai thì NÉM', rolledBack);
    const afterFailure = await repository.listAll();
    check(
      'và danh mục CŨ còn nguyên 3 dòng, không bị xoá trắng',
      afterFailure.length === 3,
      `còn ${afterFailure.length} dòng`,
    );
    check(
      'đúng ba dòng cũ, không phải dòng mới',
      afterFailure.map((h) => h.name).join(',') === 'Tết,Vu Lan,Phật Đản',
      afterFailure.map((h) => h.name).join(','),
    );

    console.log('\n5. Đầu-cuối: ngày Vu Lan 2026 tra ra đúng dòng');
    const useCase = new GetLunarTodayUseCase(repository as never);
    // 27/08/2026 dương = 15/07 âm lịch. Phép kiểm này nối bộ chuyển đổi với bảng: lệch
    // một ngày ở bất kỳ đầu nào cũng làm nó đỏ.
    const vuLan = await useCase.handle({
      at: new Date('2026-08-27T03:00:00Z'),
    });
    check(
      'ngày âm lịch đúng 15/07',
      vuLan.lunarDay === 15 && vuLan.lunarMonth === 7,
      `${vuLan.lunarDay}/${vuLan.lunarMonth}`,
    );
    check(
      'tra ra đúng ngày lễ trong bảng',
      vuLan.holiday?.name === 'Vu Lan',
      String(vuLan.holiday?.name),
    );
    check('có biểu ngữ Ngày Rằm', (vuLan.banner ?? '').includes('Ngày Rằm'));
    check('can chi đúng Bính Ngọ', vuLan.canChi === 'Bính Ngọ', vuLan.canChi);

    // Ngày lễ đã TẮT thì không ra, dù ngày âm lịch khớp.
    const phatDan = await useCase.handle({
      at: new Date('2026-05-31T03:00:00Z'),
    });
    check(
      'ngày Phật Đản tra ra 15/04 âm lịch',
      phatDan.lunarDay === 15 && phatDan.lunarMonth === 4,
      `${phatDan.lunarDay}/${phatDan.lunarMonth}`,
    );
    check(
      'nhưng ngày lễ đã TẮT nên holiday là null, biểu ngữ Rằm vẫn có',
      phatDan.holiday === null && (phatDan.banner ?? '').includes('Ngày Rằm'),
      `holiday=${String(phatDan.holiday)}`,
    );

    console.log('\n6. Vai CAMPAIGN_MANAGER (mục mở L24)');
    const [role] = await dataSource.query<{ name: string }[]>(
      `SELECT name FROM admin_roles WHERE code = 'CAMPAIGN_MANAGER'`,
    );
    check('vai đã được seed', role !== undefined, String(role?.name));

    const granted = await dataSource.query<{ code: string }[]>(
      `SELECT permission.code
         FROM admin_roles role
         JOIN admin_role_permissions map ON map.role_id = role.id
         JOIN admin_permissions permission ON permission.id = map.permission_id
        WHERE role.code = 'CAMPAIGN_MANAGER'
        ORDER BY permission.code`,
    );
    const codes = granted.map((row) => row.code);
    check(
      'nhận đủ 5 quyền nội dung',
      JSON.stringify(codes) ===
        JSON.stringify([
          'blog.manage',
          'blog.read',
          'campaign.manage',
          'campaign.read',
          'config.read',
        ]),
      JSON.stringify(codes),
    );
    // Đây là phép kiểm quan trọng nhất của nhóm: cả mục đích của vai này là KHÔNG có
    // `config.write`. Thêm nó vào là quay lại đúng chỗ L24 phàn nàn.
    for (const forbidden of [
      'config.write',
      'admin.manage',
      'post.moderate',
      'report.resolve',
      'point.adjust',
    ]) {
      check(`KHÔNG nhận \`${forbidden}\``, !codes.includes(forbidden));
    }

    console.log('\n7. Thông báo ngày Rằm (mục mở L28)');
    const notifier = new NotifyLunarObservanceUseCase(
      repository as never,
      new BulkNotifyAudienceRepository(dataSource.manager),
      {
        handle: async (command: {
          userId: string;
          idempotencyKey?: string | null;
        }) => {
          const [row] = await dataSource.query<{ created: boolean }[]>(
            `INSERT INTO notifications
               (global_id, user_id, type, title, body, idempotency_key)
             VALUES (gen_random_uuid(), $1, 'LUNAR_OBSERVANCE', 'x', 'y', $2)
             ON CONFLICT (idempotency_key) DO NOTHING
             RETURNING true AS created`,
            [command.userId, command.idempotencyKey],
          );
          return { created: row !== undefined, pushedDevices: 0 };
        },
      } as never,
    );

    // Ba người ACTIVE, một SUSPENDED, một đã xoá mềm.
    for (const [index, status] of [
      ['ACTIVE'],
      ['ACTIVE'],
      ['ACTIVE'],
      ['SUSPENDED'],
    ].entries()) {
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', $3)`,
        [
          `c1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          `nhan${index + 1}`,
          status[0],
        ],
      );
    }
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status, deleted_at)
       VALUES ($1, 'daxoa', 'x', 'MEMBER', 'ACTIVE', now())`,
      ['c1000000-0000-4000-8000-000000000099'],
    );

    // Danh mục hiện còn 3 dòng từ nhóm 4, trong đó 15/07 là "Vu Lan" đang bật.
    const sent = await notifier.handle({
      at: new Date('2026-08-27T03:00:00Z'),
    });
    check(
      'gửi cho đúng người ACTIVE, bỏ SUSPENDED và đã xoá mềm',
      // 1 admin (quantri, ACTIVE) + 3 người ACTIVE vừa thêm = 4.
      sent.audience === 4,
      `audience=${sent.audience}`,
    );
    check(
      'tất cả đều gửi được',
      sent.notified === 4 && sent.failed === 0,
      `notified=${sent.notified} failed=${sent.failed}`,
    );
    check(
      'nhận ra ngày lễ Vu Lan',
      sent.holidayName === 'Vu Lan',
      String(sent.holidayName),
    );

    // Chạy LẠI cùng ngày: khoá chống trùng phải chặn hết.
    const again = await notifier.handle({
      at: new Date('2026-08-27T09:00:00Z'),
    });
    check(
      'chạy lại cùng ngày KHÔNG gửi trùng',
      again.notified === 0 && again.alreadySent === 4,
      `notified=${again.notified} alreadySent=${again.alreadySent}`,
    );
    const [count] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM notifications WHERE type = 'LUNAR_OBSERVANCE'`,
    );
    check(
      'bảng notifications chỉ có 4 dòng, không phải 8',
      count?.total === '4',
      `${count?.total} dòng`,
    );

    // Ngày thường: thoát sớm, không thêm dòng nào.
    const quiet = await notifier.handle({
      at: new Date('2026-08-22T03:00:00Z'),
    });
    check('ngày thường thoát sớm', quiet.skipped === true);
    const [stillFour] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM notifications WHERE type = 'LUNAR_OBSERVANCE'`,
    );
    check('vẫn 4 dòng', stillFour?.total === '4', `${stillFour?.total} dòng`);
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F46 + L23/L24/L28: danh mục 10 ngày lễ seed thật và bật, ràng buộc chặn ngày 31 và tháng 13 và ngày lễ trùng, replaceAll rollback nguyên vẹn khi có dòng sai nên danh mục không bị xoá trắng, và lượt đầu-cuối nối bộ chuyển đổi âm lịch với bảng đúng ngày Vu Lan 2026; vai CAMPAIGN_MANAGER nhận đúng 5 quyền nội dung và KHÔNG có config.write; thông báo ngày Rằm gửi đúng người ACTIVE và chạy lại không gửi trùng'
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
