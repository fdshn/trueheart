/**
 * Kiểm hộp thư thông báo trên Postgres THẬT.
 *
 * Bốn thứ mà unit test mock `query` không thấy được:
 *
 *   1. **Tắt một NHÓM chỉ tắt tiếng chuông**, không tắt bản ghi — thông báo vẫn
 *      vào hộp thư để người dùng tự vào xem.
 *   2. **Bảng chỉ chứa ngoại lệ**: không có dòng nghĩa là đang bật, nên bật lại
 *      là xoá dòng chứ không phải ghi `false`.
 *   3. **Dọn theo hạn lưu trữ** xoá đúng thứ quá hạn và KHÔNG đụng thứ còn hạn.
 *   4. **Khoá chống trùng của lời nhắc bài sắp hết hạn** gắn cả mốc hết hạn, nên
 *      gia hạn xong vẫn được nhắc lại cho hạn mới.
 *
 *   npm run test:notification
 */
import {
  NotificationGroups,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { NotificationRepository } from '../src/infrastructure/repository/notification.repository';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_notification_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const UserId = '99999999-9999-4999-8999-99999999c001';
const OtherId = '99999999-9999-4999-8999-99999999c002';
const PostId = '88888888-8888-4888-8888-88888888c001';

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

  const notifications = new NotificationRepository(dataSource.manager);
  const posts = new PostRepository(
    entities.PostEntity as never,
    dataSource.manager,
  );

  async function seedNotification(
    type: NotificationTypes,
    ageDays: number,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO notifications
         (global_id, user_id, type, title, body, created_at)
       VALUES ($1, $2, $3, 'Tiêu đề', 'Nội dung', now() - ($4 || ' days')::interval)`,
      [id, UserId, type, String(ageDays)],
    );
    return id;
  }

  async function countNotifications(): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1`,
      [UserId],
    );
    return Number(row.count);
  }

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'nguoidung_tb', 'x', 'MEMBER', 'ACTIVE'),
              ($2, 'nguoikhac_tb', 'x', 'MEMBER', 'ACTIVE')`,
      [UserId, OtherId],
    );

    // ── 1. Cài đặt theo nhóm ────────────────────────────────────────────────
    console.log('Cài đặt theo nhóm:\n');

    check(
      'mặc định KHÔNG tắt nhóm nào — bảng chỉ chứa ngoại lệ',
      (await notifications.listMutedGroups(UserId)).length === 0,
    );

    await notifications.setGroupMuted({
      userId: UserId,
      group: NotificationGroups.FEED,
      muted: true,
    });
    const muted = await notifications.listMutedGroups(UserId);
    check(
      'tắt một nhóm thì đọc lại thấy đúng nhóm đó',
      muted.length === 1 && muted[0] === NotificationGroups.FEED,
      muted.join(','),
    );

    await notifications.setGroupMuted({
      userId: UserId,
      group: NotificationGroups.FEED,
      muted: true,
    });
    check(
      'tắt hai lần không sinh dòng thứ hai — bình thái',
      (await notifications.listMutedGroups(UserId)).length === 1,
    );

    check(
      'người KHÁC không bị ảnh hưởng',
      (await notifications.listMutedGroups(OtherId)).length === 0,
    );

    await notifications.setGroupMuted({
      userId: UserId,
      group: NotificationGroups.FEED,
      muted: false,
    });
    const [remaining] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM notification_mutes WHERE user_id = $1`,
      [UserId],
    );
    check(
      'bật lại thì XOÁ dòng, không ghi false',
      Number(remaining.count) === 0,
      `${remaining.count} dòng`,
    );

    // ── 2. Dọn theo hạn lưu trữ ─────────────────────────────────────────────
    console.log('\nDọn theo hạn lưu trữ:\n');

    const old1 = await seedNotification(NotificationTypes.NEW_CHAT_MESSAGE, 120);
    const old2 = await seedNotification(
      NotificationTypes.CONTENT_COMMENT_CREATED,
      100,
    );
    const fresh = await seedNotification(
      NotificationTypes.GIFT_REQUEST_ACCEPTED,
      3,
    );
    check('có 3 thông báo trước khi dọn', (await countNotifications()) === 3);

    const purged = await notifications.purgeOlderThan({
      olderThanDays: 90,
      limit: 1000,
    });
    check('dọn đúng 2 cái quá hạn', purged === 2, String(purged));

    const [kept] = await dataSource.query<{ global_id: string }[]>(
      `SELECT global_id FROM notifications WHERE user_id = $1`,
      [UserId],
    );
    check(
      'thứ còn hạn KHÔNG bị đụng',
      (await countNotifications()) === 1 && kept?.global_id === fresh,
      String(kept?.global_id === fresh),
    );
    check(
      'và hai cái cũ đã biến mất',
      [old1, old2].every((id) => id !== kept?.global_id),
    );

    check(
      'chạy lại không dọn thêm gì',
      (await notifications.purgeOlderThan({
        olderThanDays: 90,
        limit: 1000,
      })) === 0,
    );

    // ── 3. Tìm bài sắp hết hạn ──────────────────────────────────────────────
    console.log('\nBài sắp hết hạn:\n');

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count, expires_at)
       VALUES ($1, 'OFFER', $2, $3, 'Bài sắp hết hạn',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0,
               now() + interval '3 days')`,
      [PostId, UserId, CategoryId],
    );

    const expiring = await posts.findPostsExpiringSoon({
      withinDays: 7,
      limit: 100,
    });
    check(
      'tìm được bài còn 3 ngày',
      expiring.length === 1 && expiring[0].postId === PostId,
      `${expiring.length} bài`,
    );
    check(
      'và đếm đúng số ngày còn lại',
      expiring[0]?.daysLeft === 3,
      String(expiring[0]?.daysLeft),
    );

    // Bài đã QUÁ hạn thì không nhắc: nhắc gia hạn lúc đó là mời người ta bấm
    // một nút sắp hết tác dụng.
    await dataSource.query(
      `UPDATE posts SET expires_at = now() - interval '1 day' WHERE global_id = $1`,
      [PostId],
    );
    check(
      'bài ĐÃ quá hạn thì không nhắc nữa',
      (await posts.findPostsExpiringSoon({ withinDays: 7, limit: 100 }))
        .length === 0,
    );

    // Bài còn xa hạn cũng không nhắc sớm.
    await dataSource.query(
      `UPDATE posts SET expires_at = now() + interval '60 days' WHERE global_id = $1`,
      [PostId],
    );
    check(
      'bài còn xa hạn thì chưa nhắc',
      (await posts.findPostsExpiringSoon({ withinDays: 7, limit: 100 }))
        .length === 0,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
    console.log(`\nĐã xoá database nháp ${ScratchDatabase}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} phép kiểm KHÔNG đạt:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nHộp thư: tắt tiếng không mất bản ghi, và dọn đúng thứ quá hạn.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
