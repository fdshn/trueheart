/**
 * Home động theo chiến dịch, trên Postgres + Redis THẬT (F63, UC-ADM-03).
 *
 * ## Vì sao phải có script này
 *
 * Unit test của use case mock cả repository lẫn đệm, nên nó chứng minh được thứ tự gọi và
 * tín hiệu trả về, mà KHÔNG chứng minh được ba thứ nằm dưới nó:
 *
 * **1. BR_CAMP_01 là một ràng buộc Postgres, không phải một nhánh `if`.** Phép kiểm nhóm 2
 * dưới đây là chỗ duy nhất hỏi được "ràng buộc `EXCLUDE USING gist` có thật sự chặn không".
 * Mock không có ràng buộc nào.
 *
 * **2. Quyết định `'[)'` thay vì `'[]'`.** Hai chiến dịch nối tiếp khít giờ — một cái kết
 * thúc đúng lúc cái sau bắt đầu — PHẢI xếp được. Lấy `'[]'` thì mọi lượt nối tiếp đều bị
 * từ chối và Admin không có cách nào xếp hai chiến dịch liên tiếp. Đó là một ký tự trong
 * migration, và chỉ Postgres trả lời được là đã viết đúng chưa.
 *
 * **3. `jsonb` có bị `JSON.stringify` hai lần không.** Lồng hai lần thì cột lưu một CHUỖI,
 * mọi `normalizeHome*` coi nó là "không phải object" rồi lặng lẽ lùi về mặc định — cấu hình
 * lưu được mà không bao giờ có tác dụng, và không có lỗi nào.
 *
 * Thêm nhóm 5 đi qua Redis thật: khoá và TTL mà UC-ADM-03 bước 5 gọi tên chỉ đúng nếu
 * `HomeLayoutCache` dùng đúng chuỗi đó — một lỗi chính tả trong tên khoá làm `invalidate`
 * xoá một khoá không ai đọc, và bố cục cũ phục vụ mãi.
 */
import {
  DefaultHomeLayout,
  HomeLayoutCacheKey,
  HomeLayoutCacheTtlSeconds,
  normalizeHomeSections,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { HomeLayoutCache } from '../src/infrastructure/cache/home-layout-cache';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { HomeCampaignRepository } from '../src/infrastructure/repository/home-campaign.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_home_campaign_check';

const AdminId = 'e1000000-0000-4000-8000-00000000e001';

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
  expectedFragment: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì — ràng buộc không chặn');
  } catch (error) {
    const message = (error as Error).message;
    check(label, message.includes(expectedFragment), message.slice(0, 120));
  }
}

function at(iso: string): Date {
  return new Date(iso);
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

  let redis: Redis | null = null;

  try {
    const repository = new HomeCampaignRepository(dataSource.manager);

    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'quantri', 'x', 'MEMBER', 'ACTIVE')`,
      [AdminId],
    );

    const write = (overrides: Record<string, unknown> = {}) => ({
      actorUserId: AdminId,
      campaignName: 'Vu Lan 2026',
      theme: {
        primaryColor: '#D97706',
        backgroundPatternUrl: 'https://cdn.chantam.vn/lotus.webp',
        headerGradient: ['#F59E0B', '#D97706'],
        greetingIcon: 'lotus_flower',
      },
      marqueeText: 'Triệu tấm lòng sẻ chia',
      banners: [
        {
          id: 'b1',
          imageUrl: 'https://cdn.chantam.vn/vu-lan.webp',
          title: 'Trao quà Vu Lan',
          ctaText: 'Xem',
          deepLink: 'givingapp://campaign/vu-lan-2026',
        },
      ],
      sectionsLayout: normalizeHomeSections([
        { id: 'sec_hero', type: 'HERO_BANNER_SLIDER', order: 1 },
        { id: 'sec_nearby', type: 'NEARBY_POSTS_GRID', order: 2 },
      ]),
      popup: null,
      floatingBanner: null,
      startTime: at('2026-08-01T00:00:00Z'),
      endTime: at('2026-08-31T00:00:00Z'),
      isActive: false,
      ...overrides,
    });

    console.log('1. jsonb lưu đúng kiểu và đọc lại nguyên vẹn');
    const created = await repository.createCampaign(write());
    const [row] = await dataSource.query<
      {
        theme_type: string;
        banners_type: string;
        sections_type: string;
      }[]
    >(
      `SELECT jsonb_typeof(theme_config) AS theme_type,
              jsonb_typeof(banners) AS banners_type,
              jsonb_typeof(sections_order) AS sections_type
       FROM home_campaign_configs WHERE global_id = $1`,
      [created.globalId],
    );
    // Lồng `JSON.stringify` hai lần thì ba giá trị này ra 'string', và mọi hàm
    // normalize lặng lẽ lùi về mặc định.
    check(
      'theme_config là object',
      row?.theme_type === 'object',
      row?.theme_type,
    );
    check('banners là array', row?.banners_type === 'array', row?.banners_type);
    check(
      'sections_order là array',
      row?.sections_type === 'array',
      row?.sections_type,
    );

    const reread = await repository.findByGlobalId(created.globalId);
    check(
      'đọc lại ra đúng theme đã ghi',
      reread?.theme.primaryColor === '#D97706' &&
        reread?.theme.headerGradient.length === 2,
      JSON.stringify(reread?.theme),
    );
    check(
      'đọc lại ra đúng banner kèm deep link',
      reread?.banners.length === 1 &&
        reread.banners[0].deepLink === 'givingapp://campaign/vu-lan-2026',
      JSON.stringify(reread?.banners),
    );
    check(
      'order đã đánh số lại liên tục',
      JSON.stringify(reread?.sectionsLayout.map((s) => s.order)) === '[1,2]',
      JSON.stringify(reread?.sectionsLayout.map((s) => s.order)),
    );

    console.log('\n2. BR_CAMP_01 — ràng buộc EXCLUDE chặn thật');
    // Hai bản NHÁP trùng giờ: phải cho qua. `WHERE (is_active)` là phần làm ràng buộc
    // này dùng được — không có nó thì Admin phải chờ chiến dịch này hết hạn mới dựng
    // được chiến dịch sau.
    const draftB = await repository.createCampaign(
      write({ campaignName: 'Nháp trùng giờ' }),
    );
    check(
      'hai bản NHÁP trùng giờ vẫn lưu được',
      draftB.globalId !== created.globalId,
    );

    const live = await repository.createCampaign(
      write({ campaignName: 'Đang bật', isActive: true }),
    );
    check('bản bật đầu tiên lưu được', live.isActive);

    await expectReject(
      'bản bật THỨ HAI trùng giờ bị Postgres từ chối',
      () =>
        repository.createCampaign(
          write({ campaignName: 'Bật trùng giờ', isActive: true }),
        ),
      'EXCL_home_campaign_configs_active_overlap',
    );

    // Giao nhau MỘT PHẦN cũng phải bị chặn, không chỉ trùng khít.
    await expectReject(
      'bản bật giao nhau một phần cũng bị từ chối',
      () =>
        repository.createCampaign(
          write({
            campaignName: 'Gối đầu',
            isActive: true,
            startTime: at('2026-08-15T00:00:00Z'),
            endTime: at('2026-09-15T00:00:00Z'),
          }),
        ),
      'EXCL_home_campaign_configs_active_overlap',
    );

    // Quyết định dùng khoảng nửa mở: nối tiếp khít giờ KHÔNG phải giao nhau.
    //
    // Bắt lỗi tại chỗ thay vì để nó ném: viết sai thành khoảng đóng hai đầu thì lượt
    // chèn này bị từ chối, và nếu không bắt thì cả script vỡ ở đây — đọc log chỉ thấy
    // một QueryFailedError, không thấy phép kiểm nào hỏng.
    let adjacentError = '';
    try {
      const adjacent = await repository.createCampaign(
        write({
          campaignName: 'Nối tiếp khít giờ',
          isActive: true,
          startTime: at('2026-08-31T00:00:00Z'),
          endTime: at('2026-09-30T00:00:00Z'),
        }),
      );
      if (!adjacent.isActive) adjacentError = 'lưu được nhưng isActive false';
    } catch (error) {
      adjacentError = (error as Error).message.slice(0, 100);
    }
    check(
      'hai bản bật NỐI TIẾP khít giờ xếp được — đó là lý do dùng khoảng nửa mở',
      adjacentError === '',
      adjacentError,
    );

    console.log('\n3. CHECK constraint chặn dữ liệu sai hình dạng');
    await expectReject(
      'theme_config kiểu array bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO home_campaign_configs
             (campaign_name, theme_config, sections_order, start_time, end_time)
           VALUES ('Sai kiểu', '[]'::jsonb, '[]'::jsonb, now(), now() + interval '1 day')`,
        ),
      'CHK_home_campaign_configs_theme_object',
    );
    await expectReject(
      'khoảng thời gian ngược bị từ chối ở tầng database nữa',
      () =>
        dataSource.query(
          `INSERT INTO home_campaign_configs
             (campaign_name, theme_config, sections_order, start_time, end_time)
           VALUES ('Ngược giờ', '{}'::jsonb, '[]'::jsonb, now(), now() - interval '1 day')`,
        ),
      'CHK_home_campaign_configs_window',
    );

    console.log('\n4. is_live suy ra đúng, và findActiveLayout chọn đúng bản');
    const future = await repository.findByGlobalId(live.globalId);
    check(
      'chiến dịch tương lai: isActive true mà isLive FALSE',
      future?.isActive === true && future?.isLive === false,
      `isActive=${String(future?.isActive)} isLive=${String(future?.isLive)}`,
    );

    const noneLive = await repository.findActiveLayout();
    check(
      'chưa bản nào tới hiệu lực thì findActiveLayout trả null',
      noneLive === null,
      JSON.stringify(noneLive),
    );

    const now = await repository.createCampaign(
      write({
        campaignName: 'Đang chạy ngay bây giờ',
        isActive: true,
        startTime: at(new Date(Date.now() - 86_400_000).toISOString()),
        endTime: at(new Date(Date.now() + 86_400_000).toISOString()),
      }),
    );
    const nowRecord = await repository.findByGlobalId(now.globalId);
    check(
      'bản đang trong khoảng thời gian có isLive TRUE',
      nowRecord?.isLive === true,
    );

    const layout = await repository.findActiveLayout();
    check(
      'findActiveLayout trả đúng bản đang chạy',
      layout?.campaignId === now.globalId,
      String(layout?.campaignId),
    );
    check(
      'layout mang theo khối đã chuẩn hoá',
      (layout?.sectionsLayout.length ?? 0) === 2,
      JSON.stringify(layout?.sectionsLayout.map((s) => s.type)),
    );

    console.log('\n5. UPDATE … RETURNING không bị bọc thành [rows, affected]');
    const updated = await repository.updateCampaign({
      ...write({ campaignName: 'Đã đổi tên', isActive: false }),
      globalId: created.globalId,
    });
    // Quên `updateReturning` thì `rows[0]` là MỘT MẢNG, và `toRecord` trả về object
    // toàn `undefined` mà không ném — chính cái bẫy đã bắt khắp repo này.
    check(
      'updateCampaign trả về hàng thật, không trả mảng lồng',
      updated.campaignName === 'Đã đổi tên' &&
        typeof updated.globalId === 'string',
      JSON.stringify(updated).slice(0, 80),
    );
    check(
      'updated_at đã nhích lên',
      updated.updatedAt.getTime() >= created.updatedAt.getTime(),
    );

    console.log('\n6. Đệm Redis — đúng khoá, đúng TTL, xoá được');
    const redisUri = process.env.REDIS_URI;
    if (!redisUri) {
      check('REDIS_URI có mặt để kiểm đệm', false, 'thiếu biến môi trường');
    } else {
      // `lazyConnect` + `connect()` để CHỜ kết nối xong mới gửi lệnh.
      //
      // Trong app thật client nối từ lúc boot nên không ai thấy chuyện này; ở script
      // thì lệnh đầu tiên chạy ngay sau `new Redis(...)`, và với
      // `enableOfflineQueue: false` nó ném `Stream isn't writeable` thay vì xếp hàng
      // chờ. Đó cũng là lý do `HomeLayoutCache` bắt lỗi ở cả ba phép: một lượt Redis
      // chưa sẵn sàng chỉ được phép thành một lượt trượt đệm.
      redis = new Redis(redisUri, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
      redis.on('error', () => undefined);
      await redis.connect();
      const cache = new HomeLayoutCache(redis);

      await redis.del(HomeLayoutCacheKey);
      check('chưa đệm thì read trả null', (await cache.read()) === null);

      await cache.write(DefaultHomeLayout);
      const raw = await redis.get(HomeLayoutCacheKey);
      // Tên khoá gõ sai thì `invalidate` xoá một khoá không ai đọc, và bố cục cũ
      // phục vụ mãi — nên phép kiểm này hỏi thẳng khoá theo tên đặc tả đặt.
      check(
        `ghi vào đúng khoá \`${HomeLayoutCacheKey}\``,
        raw !== null,
        raw === null ? 'khoá rỗng' : '',
      );

      const ttl = await redis.ttl(HomeLayoutCacheKey);
      check(
        'TTL đặt đúng một giờ',
        ttl > HomeLayoutCacheTtlSeconds - 10 &&
          ttl <= HomeLayoutCacheTtlSeconds,
        `${ttl}s`,
      );

      const roundTrip = await cache.read();
      check(
        'đọc lại từ đệm ra đúng bố cục',
        JSON.stringify(roundTrip) === JSON.stringify(DefaultHomeLayout),
      );

      check('invalidate báo thành công', (await cache.invalidate()) === true);
      check(
        'sau invalidate thì khoá đã mất',
        (await redis.get(HomeLayoutCacheKey)) === null,
      );

      // Giá trị rác trong đệm (do một bản mã cũ ghi) phải coi như chưa có đệm, không
      // được ném và không được trả một object thiếu trường cho client.
      await redis.set(HomeLayoutCacheKey, 'khong-phai-json');
      check(
        'giá trị rác trong đệm đọc ra null, không ném',
        (await cache.read()) === null,
      );
      await redis.del(HomeLayoutCacheKey);
    }

    console.log('\n7. Phân trang danh sách đếm đúng tổng');
    const page = await repository.listCampaigns({ limit: 2, offset: 0 });
    const all = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM home_campaign_configs`,
    );
    check(
      'total là tổng toàn bảng, không phải số dòng trang hiện tại',
      page.total === Number(all[0]?.total) && page.items.length === 2,
      `total=${page.total} items=${page.items.length} bảng=${all[0]?.total}`,
    );
  } finally {
    // `disconnect()` chứ không `quit()`: `quit` chờ Redis trả lời, và nếu client chưa
    // bao giờ nối được thì nó không bao giờ trả — script treo thay vì báo lỗi.
    if (redis) redis.disconnect();
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F63: BR_CAMP_01 chặn bằng ràng buộc EXCLUDE thật (và nối tiếp khít giờ vẫn xếp được), jsonb lưu đúng kiểu không lồng hai lần, is_live suy ra đúng nên chiến dịch tương lai không bị coi là đang chạy, UPDATE RETURNING trả hàng thật, và đệm Redis đúng khoá đúng TTL'
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
