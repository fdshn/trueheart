/**
 * Presence theo tab trên Redis THẬT (PR #46 §10).
 *
 * Unit test mock store nên không thấy được script Lua. Ở đây chạy đúng script đó:
 *
 * - hai thiết bị của một người ở cùng tab: đếm MỘT người;
 * - một thiết bị đổi tab: người đó rời tab cũ, trừ khi thiết bị kia vẫn ở đó;
 * - lặp cùng tab sớm hơn 30 giây: bỏ qua; đổi tab: ghi ngay;
 * - quá 120 giây không heartbeat: tự biến mất, cả khi đọc lẫn khi ghi lại;
 * - không có khoá nào sống quá TTL.
 *
 * Đồng hồ truyền vào (`nowMs`) nên không phải ngủ chờ TTL. Mỗi lần chạy dùng userId ngẫu
 * nhiên và dọn sạch khoá của mình — không đụng presence thật trên cùng Redis.
 *
 *   npm run test:presence
 */
import { PresenceSurfaces } from '@chantam.vn/chantam.core-lib/consts';
import { config as loadEnvFile } from 'dotenv';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { PresenceStore } from '../src/infrastructure/cache/presence-store';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const uri = process.env.REDIS_URI;
  if (!uri) throw new Error('Thiếu REDIS_URI.');
  const redis = new Redis(uri, { maxRetriesPerRequest: 2 });
  const store = new PresenceStore(redis);

  const [alice, bob, carol] = [randomUUID(), randomUUID(), randomUUID()];
  const carolPhone = randomUUID();
  const [phone, tablet, bobPhone] = [randomUUID(), randomUUID(), randomUUID()];
  const { DHARMA_FORUM: forum, DHARMA_HOME: home } = PresenceSurfaces;
  // Mốc giả lùi xa hiện tại: điểm của người thật trên cùng Redis luôn lớn hơn, nên phép
  // đếm ở đây chỉ thấy người kiểm — cắt theo `now - TTL` của mốc giả không cắt được họ,
  // còn đếm thì cộng cả họ vào. Vì vậy so CHÊNH LỆCH với số đếm nền, không so tuyệt đối.
  const t0 = Date.now() - 24 * 60 * 60 * 1_000;
  const baseline = async (surface: PresenceSurfaces, at: number) =>
    (await store.countOnline(surface, at)) ?? -1;
  const forumBase = await baseline(forum, t0);
  const homeBase = await baseline(home, t0);
  const count = async (surface: PresenceSurfaces, at: number) =>
    ((await store.countOnline(surface, at)) ?? -1) -
    (surface === forum ? forumBase : homeBase);
  const beat = (
    userId: string,
    sessionId: string,
    surface: PresenceSurfaces,
    nowMs: number,
    visible = false,
  ) => store.heartbeat({ userId, sessionId, surface, nowMs, visible });

  try {
    console.log('1. Gộp theo người');
    await beat(alice, phone, forum, t0);
    await beat(alice, tablet, forum, t0 + 1_000);
    await beat(bob, bobPhone, forum, t0 + 2_000);
    check(
      'hai thiết bị của một người cùng tab + một người khác: 2 người',
      (await count(forum, t0 + 3_000)) === 2,
    );

    console.log('\n2. Đổi tab');
    check(
      'một thiết bị đổi tab: ghi ngay, không bị chặn 30 giây',
      (await beat(alice, phone, home, t0 + 4_000)) === true,
    );
    check(
      'thiết bị kia vẫn ở Diễn đàn: người đó còn ở Diễn đàn và có mặt ở Trang chủ',
      (await count(forum, t0 + 5_000)) === 2 &&
        (await count(home, t0 + 5_000)) === 1,
    );
    await beat(alice, tablet, home, t0 + 6_000);
    check(
      'thiết bị còn lại cũng đổi tab: người đó rời hẳn Diễn đàn',
      (await count(forum, t0 + 7_000)) === 1 &&
        (await count(home, t0 + 7_000)) === 1,
    );

    console.log('\n3. Nhịp heartbeat');
    check(
      'lặp cùng tab sau 10 giây: bỏ qua',
      (await beat(bob, bobPhone, forum, t0 + 12_000)) === false,
    );
    check(
      'lặp cùng tab sau 31 giây: ghi',
      (await beat(bob, bobPhone, forum, t0 + 33_000)) === true,
    );

    console.log('\n4. Hết hạn');
    // Bob heartbeat cuối lúc t0+33s; Alice lúc t0+6s. Ở t0+130s Alice đã quá 120 giây.
    check(
      'quá 120 giây không heartbeat: tự rời khi đọc',
      (await count(home, t0 + 130_000)) === 0 &&
        (await count(forum, t0 + 130_000)) === 1,
    );
    await beat(alice, phone, forum, t0 + 140_000);
    const sessions = await redis.hgetall(`presence:sessions:${alice}`);
    check(
      'heartbeat mới dọn session đã chết khỏi hash',
      Object.keys(sessions).length === 1 && phone in sessions,
      JSON.stringify(Object.keys(sessions)),
    );

    console.log('\n5. Không lưu lâu');
    const ttls = await Promise.all([
      redis.pttl(`presence:sessions:${alice}`),
      redis.pttl(`presence:sessions:${bob}`),
      redis.pttl(`presence:surface:${forum}`),
    ]);
    check(
      'mọi khoá đều có TTL, không quá 120 giây',
      ttls.every((ttl) => ttl > 0 && ttl <= 120_000),
      JSON.stringify(ttls),
    );

    console.log('\n6. Hiện danh tính (showOnlineStatus)');
    // Lấy rộng rồi lọc đúng người kiểm: Redis dùng chung có thể có người thật.
    const visibleOn = async (surface: PresenceSurfaces, at: number) =>
      ((await store.listVisible(surface, at, 1_000)) ?? []).filter((id) =>
        ([alice, bob, carol] as string[]).includes(id),
      );
    await beat(carol, carolPhone, forum, t0 + 150_000, true);
    check(
      'người bật cờ có trong danh sách hiện, người không bật thì không — dù cả hai đều được đếm',
      // Ở Diễn đàn lúc này: alice (t0+140s, không bật), bob (t0+33s, còn trong TTL), carol.
      JSON.stringify(await visibleOn(forum, t0 + 151_000)) ===
        JSON.stringify([carol]) && (await count(forum, t0 + 151_000)) === 3,
      `${JSON.stringify(await visibleOn(forum, t0 + 151_000))} / ${await count(forum, t0 + 151_000)}`,
    );
    await beat(carol, carolPhone, home, t0 + 152_000, true);
    check(
      'đổi tab: rời danh sách hiện của tab cũ, có mặt ở tab mới',
      (await visibleOn(forum, t0 + 153_000)).length === 0 &&
        JSON.stringify(await visibleOn(home, t0 + 153_000)) ===
          JSON.stringify([carol]),
    );
    await beat(carol, carolPhone, forum, t0 + 160_000, false);
    check(
      'heartbeat với cờ đã tắt: gỡ khỏi danh sách hiện, vẫn được đếm',
      (await visibleOn(forum, t0 + 161_000)).length === 0 &&
        (await visibleOn(home, t0 + 161_000)).length === 0 &&
        (await count(forum, t0 + 161_000)) === 2,
    );
    check(
      'quá 120 giây: rời danh sách hiện khi đọc',
      (await visibleOn(home, t0 + 280_000)).length === 0,
    );

    console.log('\n7. Tắt cờ — xoá ngay');
    await beat(carol, carolPhone, forum, t0 + 200_000, true);
    const cleared = await store.clearUser(carol);
    const [carolSessions, carolScores] = await Promise.all([
      redis.exists(`presence:sessions:${carol}`),
      Promise.all(
        Object.values(PresenceSurfaces).flatMap((surface) => [
          redis.zscore(`presence:surface:${surface}`, carol),
          redis.zscore(`presence:visible:${surface}`, carol),
        ]),
      ),
    ]);
    check(
      'clearUser xoá hash session và gỡ khỏi cả 16 tập — không chờ TTL',
      cleared === true &&
        carolSessions === 0 &&
        carolScores.every((score) => score === null),
    );
  } finally {
    await redis.del(
      `presence:sessions:${alice}`,
      `presence:sessions:${bob}`,
      `presence:sessions:${carol}`,
    );
    for (const surface of Object.values(PresenceSurfaces)) {
      await redis.zrem(`presence:surface:${surface}`, alice, bob, carol);
      await redis.zrem(`presence:visible:${surface}`, alice, bob, carol);
    }
    await redis.quit();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Presence: gộp theo người, đổi tab đúng, nhịp 30 giây, tự hết hạn sau 120 giây'
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
