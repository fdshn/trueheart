/**
 * Chat trực tiếp giữa hai người dùng (`DIRECT_USER`) trên Postgres THẬT (yêu cầu 30/10).
 *
 * - Một cặp người đúng một phòng: mở lại, mở NGƯỢC chiều, mở song song đều ra một phòng.
 * - Phòng không bài: danh sách phòng (LEFT JOIN posts) vẫn trả, `postId`/`postTitle` null.
 * - Chặn hai chiều: không mở phòng mới, không gửi tin vào phòng DIRECT_USER; phòng
 *   DIRECT_POST của cùng hai người vẫn gửi được. Bỏ chặn thì gửi lại được.
 * - "Không nhận tin người lạ": người lạ không mở được; người đã từng có phòng thì được.
 * - Giới hạn phòng mới / 24 giờ, kể cả khi mở song song; mở lại phòng cũ không tốn suất.
 * - Ràng buộc database: DIRECT_USER không có bài, phải có người mở; loại khác phải có bài.
 * - Migration down/up chạy được khi chưa có phòng DIRECT_USER.
 *
 *   npm run test:direct-user-chat
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_direct_user_chat_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
// Thứ tự id cố ý: A > B để kiểm việc chuẩn hoá LEAST/GREATEST khi A là người mở.
const A = '7d000000-0000-4000-8000-0000000000aa';
const B = '7d000000-0000-4000-8000-000000000011';
const C = '7d000000-0000-4000-8000-000000000022';
const D = '7d000000-0000-4000-8000-000000000033';
const E = '7d000000-0000-4000-8000-000000000044';
const Spammer = '7d000000-0000-4000-8000-000000000055';
const Classified = '7c000000-0000-4000-8000-000000000001';

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
    // Mở song song cần nhiều kết nối thật, không phải một kết nối xếp hàng.
    extra: { max: 12 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);

    console.log('0. Migration');
    // Down rồi up lại khi chưa có phòng DIRECT_USER nào: rebuild enum hai chiều phải chạy.
    await dataSource.undoLastMigration();
    await dataSource.runMigrations();
    const [config] = await sql(
      `SELECT value_json FROM system_configs WHERE config_key = 'chat.direct_user_daily_limit'`,
    );
    check(
      'down → up chạy được, khoá cấu hình seed 20',
      Number(config?.value_json) === 20,
      JSON.stringify(config),
    );

    for (const [id, username] of [
      [A, 'du_a'],
      [B, 'du_b'],
      [C, 'du_c'],
      [D, 'du_d'],
      [E, 'du_e'],
      [Spammer, 'du_spam'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status, full_name)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', $3)`,
        [id, username, username],
      );
    const [defaults] = await sql(
      `SELECT allow_stranger_messages FROM users WHERE global_id = $1`,
      [A],
    );
    check(
      'allow_stranger_messages mặc định BẬT',
      defaults.allow_stranger_messages === true,
    );

    const chat = new ChatRepository(dataSource.manager, {
      getConfigValue: async () => null,
    } as never);
    const open = (initiatorId: string, recipientId: string, dailyLimit = 20) =>
      chat.openDirectUserRoom({ initiatorId, recipientId, dailyLimit });
    const send = (roomId: string, senderId: string) =>
      chat.appendMessage({
        globalId: randomUUID(),
        roomId,
        senderId,
        body: 'chào',
      });

    console.log('\n1. Một cặp người, một phòng');
    const first = await open(A, B);
    const again = await open(A, B);
    const reverse = await open(B, A);
    const firstId = first.status === 'OPENED' ? first.room.globalId : '';
    check(
      'mở lần đầu: created; mở lại và mở NGƯỢC chiều: cùng phòng, created=false',
      first.status === 'OPENED' &&
        first.created &&
        again.status === 'OPENED' &&
        !again.created &&
        again.room.globalId === firstId &&
        reverse.status === 'OPENED' &&
        !reverse.created &&
        reverse.room.globalId === firstId,
    );
    const [stored] = await sql(
      `SELECT giver_id, receiver_id, created_by, post_id, transaction_id, room_type
       FROM chat_rooms WHERE global_id = $1`,
      [firstId],
    );
    check(
      'lưu chuẩn hoá (id nhỏ ở giver_id), created_by = người mở, không bài, không giao dịch',
      stored.giver_id === B &&
        stored.receiver_id === A &&
        stored.created_by === A &&
        stored.post_id === null &&
        stored.transaction_id === null &&
        stored.room_type === 'DIRECT_USER',
      JSON.stringify(stored),
    );

    const racing = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        index % 2 === 0 ? open(C, D) : open(D, C),
      ),
    );
    const racingIds = new Set(
      racing.map((outcome) =>
        outcome.status === 'OPENED' ? outcome.room.globalId : outcome.status,
      ),
    );
    const [{ n: cdRooms }] = await sql(
      `SELECT count(*)::int AS n FROM chat_rooms
       WHERE room_type = 'DIRECT_USER'
         AND LEAST(giver_id, receiver_id) = LEAST($1::uuid, $2::uuid)
         AND GREATEST(giver_id, receiver_id) = GREATEST($1::uuid, $2::uuid)`,
      [C, D],
    );
    check(
      'sáu lượt mở song song từ cả hai phía: đúng một phòng, đúng một created',
      racingIds.size === 1 &&
        cdRooms === 1 &&
        racing.filter((o) => o.status === 'OPENED' && o.created).length === 1,
      `${[...racingIds].join(',')} rooms=${cdRooms}`,
    );

    console.log('\n2. Danh sách phòng — phòng không bài');
    const list = await chat.listRoomsForUser({ userId: A, skip: 0, take: 10 });
    const item = list.items.find((entry) => entry.room.globalId === firstId);
    check(
      'phòng DIRECT_USER có trong danh sách, post null, counterpartId đúng, chưa chặn',
      list.total === 1 &&
        item !== undefined &&
        item.postTitle === null &&
        item.room.postId === null &&
        item.postThumbnailKey === null &&
        item.postPrice === null &&
        item.counterpartId === B &&
        item.counterpartUsername === 'du_b' &&
        item.blockedByMe === false,
      JSON.stringify(item),
    );

    console.log('\n3. Gửi tin và chặn');
    const sentBefore = await send(firstId, A);
    check('chưa chặn: gửi được', sentBefore.status === 'APPENDED');

    // Một phòng DIRECT_POST giữa hai người đó — chặn không được làm hỏng nó.
    await sql(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'CLASSIFIED', $2, $3, 'Bài kiểm', 'Mô tả đủ dài cho bài kiểm chat trực tiếp',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1,
               jsonb_build_object('price', 1000, 'negotiable', false), 0)`,
      [Classified, B, CategoryId],
    );
    const postRoom = await chat.openDirectPostRoom({
      postId: Classified,
      buyerId: A,
      sellerId: B,
    });

    await sql(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`,
      [B, A],
    );
    const blockedSendA = await send(firstId, A);
    const blockedSendB = await send(firstId, B);
    check(
      'B chặn A: CẢ HAI không gửi được trong phòng DIRECT_USER',
      blockedSendA.status === 'BLOCKED' && blockedSendB.status === 'BLOCKED',
      `${blockedSendA.status}/${blockedSendB.status}`,
    );
    check(
      'phòng DIRECT_POST của cùng hai người vẫn gửi được',
      (await send(postRoom.room.globalId, A)).status === 'APPENDED',
    );
    const reopened = await open(A, B);
    check(
      'mở lại phòng đã có khi bị chặn: vẫn trả phòng (đọc lịch sử), không tạo mới',
      reopened.status === 'OPENED' && !reopened.created,
    );
    await sql(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`,
      [E, C],
    );
    const blockedNew = await open(C, E);
    const blockedNewReverse = await open(E, C);
    check(
      'có quan hệ chặn: không ai mở được phòng MỚI (cả hai chiều)',
      blockedNew.status === 'RECIPIENT_UNAVAILABLE' &&
        blockedNewReverse.status === 'RECIPIENT_UNAVAILABLE',
    );
    const listB = await chat.listRoomsForUser({ userId: B, skip: 0, take: 10 });
    const listA = await chat.listRoomsForUser({ userId: A, skip: 0, take: 10 });
    check(
      'blockedByMe một chiều: B (người chặn) thấy true, A thấy false',
      listB.items.find((entry) => entry.room.globalId === firstId)
        ?.blockedByMe === true &&
        listA.items.find((entry) => entry.room.globalId === firstId)
          ?.blockedByMe === false,
    );
    await sql(`DELETE FROM user_blocks WHERE blocker_id = $1`, [B]);
    check(
      'bỏ chặn: gửi lại được',
      (await send(firstId, A)).status === 'APPENDED',
    );

    console.log('\n4. Không nhận tin người lạ');
    await sql(
      `UPDATE users SET allow_stranger_messages = false WHERE global_id IN ($1, $2)`,
      [E, B],
    );
    const stranger = await open(D, E);
    check(
      'người lạ không mở được khi người nhận tắt cài đặt',
      stranger.status === 'RECIPIENT_UNAVAILABLE',
    );
    // D chưa có phòng nào với B (B cũng tắt cài đặt). Mở phòng DIRECT_POST D–B để D thành
    // "người quen" — rồi phòng DIRECT_USER mới phải mở được.
    const strangerToB = await open(D, B);
    const knownPost = await chat.openDirectPostRoom({
      postId: Classified,
      buyerId: D,
      sellerId: B,
    });
    const acquaintance = await open(D, B);
    check(
      'đã từng có phòng (DIRECT_POST) thì vẫn mở được phòng DIRECT_USER mới',
      strangerToB.status === 'RECIPIENT_UNAVAILABLE' &&
        knownPost.created &&
        acquaintance.status === 'OPENED' &&
        acquaintance.created,
    );

    console.log('\n5. Giới hạn phòng mới mỗi ngày');
    const targets: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const id = randomUUID();
      targets.push(id);
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, `du_t${index}`],
      );
    }
    const burst = await Promise.all(
      targets.map((target) => open(Spammer, target, 3)),
    );
    const createdInBurst = burst.filter(
      (outcome) => outcome.status === 'OPENED' && outcome.created,
    ).length;
    const limited = burst.filter(
      (outcome) => outcome.status === 'DAILY_LIMIT_REACHED',
    );
    check(
      'giới hạn 3, mở song song 5: đúng 3 phòng, 2 lượt bị chặn',
      createdInBurst === 3 && limited.length === 2,
      burst.map((o) => o.status).join(','),
    );
    check(
      'lượt bị chặn có retryAfterSeconds trong (0, 86400]',
      limited.every(
        (outcome) =>
          outcome.status === 'DAILY_LIMIT_REACHED' &&
          outcome.retryAfterSeconds > 0 &&
          outcome.retryAfterSeconds <= 86_400,
      ),
    );
    const openedTarget = burst.findIndex(
      (outcome) => outcome.status === 'OPENED',
    );
    const reopenAtLimit = await open(Spammer, targets[openedTarget], 3);
    check(
      'hết suất vẫn mở lại được phòng cũ',
      reopenAtLimit.status === 'OPENED' && !reopenAtLimit.created,
    );
    // Người KIA mở với Spammer không tốn suất của Spammer — cũng không bị suất của Spammer chặn.
    const limitedTarget =
      targets[burst.findIndex((o) => o.status === 'DAILY_LIMIT_REACHED')];
    const inbound = await open(limitedTarget, Spammer, 3);
    check(
      'người khác mở phòng với người đã hết suất: được (suất tính theo người mở)',
      inbound.status === 'OPENED' && inbound.created,
    );
    await sql(
      `UPDATE chat_rooms SET created_at = now() - interval '25 hours'
       WHERE created_by = $1`,
      [Spammer],
    );
    const afterWindow = await open(Spammer, D, 3);
    check(
      'phòng cũ ra khỏi cửa sổ 24 giờ thì có suất lại',
      afterWindow.status === 'OPENED' && afterWindow.created,
      afterWindow.status,
    );
    const zero = await open(Spammer, C, 0);
    check(
      'giới hạn 0: không mở được phòng mới nào',
      zero.status === 'DAILY_LIMIT_REACHED',
    );

    console.log('\n6. Ràng buộc database');
    const rejects = async (query: string, params: unknown[]) => {
      try {
        await sql(query, params);
        return '';
      } catch (error) {
        return (error as { code?: string }).code ?? 'ERR';
      }
    };
    check(
      'DIRECT_USER có bài → 23514',
      (await rejects(
        `INSERT INTO chat_rooms (global_id, room_type, post_id, giver_id, receiver_id, created_by, status)
         VALUES ($1, 'DIRECT_USER', $2, $3, $4, $3, 'OPEN')`,
        [randomUUID(), Classified, C, E],
      )) === '23514',
    );
    check(
      'DIRECT_USER thiếu người mở → 23514',
      (await rejects(
        `INSERT INTO chat_rooms (global_id, room_type, giver_id, receiver_id, status)
         VALUES ($1, 'DIRECT_USER', $2, $3, 'OPEN')`,
        [randomUUID(), C, E],
      )) === '23514',
    );
    check(
      'DIRECT_POST thiếu bài → 23514',
      (await rejects(
        `INSERT INTO chat_rooms (global_id, room_type, giver_id, receiver_id, status)
         VALUES ($1, 'DIRECT_POST', $2, $3, 'OPEN')`,
        [randomUUID(), C, E],
      )) === '23514',
    );
    check(
      'cặp đảo chiều chèn tay → 23505 (unique LEAST/GREATEST)',
      (await rejects(
        `INSERT INTO chat_rooms (global_id, room_type, giver_id, receiver_id, created_by, status)
         VALUES ($1, 'DIRECT_USER', $2, $3, $2, 'OPEN')`,
        [randomUUID(), A, B],
      )) === '23505',
    );
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
        ? 'Chat trực tiếp: một phòng mỗi cặp, chặn hai chiều, người lạ, giới hạn ngày đều đúng'
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
