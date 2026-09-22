/**
 * Kiểm phân trang tin nhắn trên Postgres THẬT.
 *
 * Vì sao cần script riêng: tài nguyên chat **không có một unit test nào**, và
 * kể cả có thì chúng mock `query` nên không bao giờ chạm tới câu SQL. Hai thứ
 * cần chứng minh đều chỉ thấy được trên database thật:
 *
 *   1. Cửa sổ không lặp và không bỏ sót tin KHI CÓ TIN MỚI ĐẾN GIỮA CHỪNG —
 *      đây đúng là chỗ mà OFFSET sai, và sai một cách im lặng.
 *   2. Câu lệnh đi index chứ không quét cả bảng — thứ quyết định một phòng
 *      50.000 tin có làm nghẽn máy chủ hay không.
 *
 *   npm run test:chat-paging
 */
import {
  clampChatMessageLimit,
  decodeChatCursor,
  encodeChatCursor,
  MaxChatMessageLimit,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_chat_paging_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const GiverId = '99999999-9999-4999-8999-99999999a001';
const ReceiverId = '99999999-9999-4999-8999-99999999a002';
const PostId = '88888888-8888-4888-8888-88888888a001';
const TransactionId = '55555555-5555-4555-8555-55555555a001';
const RoomId = '66666666-6666-4666-8666-66666666a001';

const TotalMessages = 120;

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
    const users: [string, string][] = [
      [GiverId, 'nguoitang_chat'],
      [ReceiverId, 'nguoinhan_chat'],
    ];
    for (const [id, username] of users)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm phân trang chat',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, GiverId, CategoryId],
    );
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status)
       VALUES ($1, $2, $3, $4, 1, 'ACCEPTED')`,
      [TransactionId, PostId, GiverId, ReceiverId],
    );
    await dataSource.query(
      `INSERT INTO chat_rooms
         (global_id, transaction_id, post_id, giver_id, receiver_id, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
      [RoomId, TransactionId, PostId, GiverId, ReceiverId],
    );

    /**
     * Ghi tin với mốc thời gian TRÙNG NHAU theo cụm 4.
     *
     * Cố ý: nếu khoá sắp xếp chỉ là `created_at`, bốn tin cùng mốc sẽ xếp ngẫu
     * nhiên giữa hai lần gọi và phân trang lặp/sót ngay. Dữ liệu thật cũng ra
     * như vậy khi hai người gõ nhanh hoặc khi ghi hàng loạt.
     */
    async function seedMessages(from: number, count: number): Promise<void> {
      for (let index = from; index < from + count; index += 1) {
        const bucket = Math.floor(index / 4);
        await dataSource.query(
          `INSERT INTO chat_messages
             (global_id, room_id, sender_id, body, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3,
                   TIMESTAMPTZ '2026-09-01 00:00:00+00'
                     + ($4 || ' seconds')::interval)`,
          [
            RoomId,
            index % 2 === 0 ? GiverId : ReceiverId,
            `tin số ${index}`,
            String(bucket),
          ],
        );
      }
    }

    await seedMessages(0, TotalMessages);
    console.log(`Đã ghi ${TotalMessages} tin, mốc trùng theo cụm 4\n`);

    const chat = new ChatRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    );

    // ── 1. Cuộn hết lịch sử: không lặp, không sót ───────────────────────────
    console.log('Cuộn ngược hết lịch sử:\n');

    const seen: number[] = [];
    let before: { createdAt: Date; id: number } | null = null;
    let rounds = 0;
    for (;;) {
      const page = await chat.listMessages({
        roomId: RoomId,
        limit: 25,
        before,
      });
      seen.push(...page.items.map((item) => item.message.id));
      rounds += 1;
      if (!page.hasMoreBefore || page.items.length === 0 || rounds > 20) break;
      const oldest = page.items[page.items.length - 1];
      before = { createdAt: oldest.message.createdAt, id: oldest.message.id };
    }

    check(
      'lấy đủ toàn bộ tin, không sót',
      seen.length === TotalMessages,
      `${seen.length}/${TotalMessages}`,
    );
    check(
      'không tin nào bị lặp',
      new Set(seen).size === seen.length,
      `${new Set(seen).size} id khác nhau`,
    );
    check(
      'thứ tự giảm dần liên tục, kể cả trong cụm cùng mốc thời gian',
      seen.every((id, index) => index === 0 || seen[index - 1] > id),
    );
    check('dừng đúng lúc, không lặp vô hạn', rounds <= 6, `${rounds} vòng`);

    // ── 2. Tin mới đến GIỮA CHỪNG — chỗ OFFSET sai ──────────────────────────
    console.log('\nTin mới đến khi đang cuộn (chỗ OFFSET sai):\n');

    const first = await chat.listMessages({ roomId: RoomId, limit: 25 });
    const anchor = first.items[first.items.length - 1];

    // 10 tin mới đến. Với OFFSET 25, cửa sổ tiếp theo sẽ trôi đúng 10 dòng và
    // trả lại 10 tin mà người dùng VỪA xem.
    await seedMessages(TotalMessages, 10);

    const second = await chat.listMessages({
      roomId: RoomId,
      limit: 25,
      before: { createdAt: anchor.message.createdAt, id: anchor.message.id },
    });

    const firstIds = new Set(first.items.map((item) => item.message.id));
    const overlap = second.items.filter((item) => firstIds.has(item.message.id));
    check(
      'cửa sổ sau KHÔNG lặp lại tin của cửa sổ trước',
      overlap.length === 0,
      overlap.length ? `lặp ${overlap.length} tin` : '',
    );
    check(
      'cửa sổ sau nối liền cửa sổ trước, không hở',
      second.items[0].message.id === anchor.message.id - 1,
      `${second.items[0].message.id} nối sau ${anchor.message.id}`,
    );

    /**
     * Đối chứng: chính câu OFFSET cũ, trên cùng bộ dữ liệu.
     *
     * Một phép kiểm chỉ đáng tin khi nó đỏ được. Khối này chạy lại cách cũ
     * để chứng minh lỗi có THẬT chứ không phải lý thuyết: nếu một ngày nào đó
     * OFFSET thôi trôi thì chính dòng này sẽ đỏ, và lúc đó cả con trỏ lẫn lời
     * giải thích trong `chat-cursor.ts` đều cần đọc lại.
     */
    const offsetSecond = (await dataSource.query(
      `SELECT m.id FROM chat_messages m
       WHERE m.room_id = $1
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 25 OFFSET 25`,
      [RoomId],
    )) as { id: string }[];
    const offsetOverlap = offsetSecond.filter((row) =>
      firstIds.has(Number(row.id)),
    );
    check(
      'cách cũ (OFFSET) thật sự lặp tin — lỗi có thật, không phải lý thuyết',
      offsetOverlap.length === 10,
      `OFFSET lặp đúng ${offsetOverlap.length} tin sau khi 10 tin mới đến`,
    );

    // ── 3. Bắt kịp tin mới bằng `after` ─────────────────────────────────────
    console.log('\nBắt kịp sau khi mất kết nối:\n');

    const caughtUp = await chat.listMessages({
      roomId: RoomId,
      limit: 25,
      after: { createdAt: anchor.message.createdAt, id: anchor.message.id },
    });
    check(
      'chỉ trả về tin MỚI HƠN mốc đã thấy',
      caughtUp.items.every((item) => item.message.id > anchor.message.id),
    );
    check(
      'vẫn trả về mới-nhất-trước như hướng kia',
      caughtUp.items.every((item, index) =>
        index === 0
          ? true
          : caughtUp.items[index - 1].message.id > item.message.id,
      ),
    );
    check(
      'báo còn tin mới hơn nữa khi chưa lấy hết',
      caughtUp.hasMoreAfter === true,
      `hasMoreAfter=${caughtUp.hasMoreAfter}`,
    );

    // ── 4. Biên ─────────────────────────────────────────────────────────────
    console.log('\nBiên:\n');

    const oldestPage = await chat.listMessages({
      roomId: RoomId,
      limit: 25,
      before: { createdAt: new Date('2026-09-01T00:00:00Z'), id: 1 },
    });
    check(
      'chạm đáy hội thoại thì báo hết, không trả rỗng kèm hasMore=true',
      oldestPage.items.length === 0 && oldestPage.hasMoreBefore === false,
      `${oldestPage.items.length} tin, hasMoreBefore=${oldestPage.hasMoreBefore}`,
    );

    const newest = await chat.listMessages({ roomId: RoomId, limit: 25 });
    check(
      'không con trỏ thì trả về cửa sổ MỚI NHẤT',
      newest.items[0].message.body === `tin số ${TotalMessages + 9}`,
      String(newest.items[0].message.body),
    );
    check(
      'cửa sổ mới nhất báo không còn gì mới hơn',
      newest.hasMoreAfter === false,
    );

    const capped = await chat.listMessages({
      roomId: RoomId,
      limit: clampChatMessageLimit(999999),
    });
    check(
      'trần số tin chặn được yêu cầu xin cả phòng',
      capped.items.length === MaxChatMessageLimit,
      `${capped.items.length} tin`,
    );

    check(
      'con trỏ hỏng bị bỏ qua, không làm vỡ truy vấn',
      decodeChatCursor('khong-phai-con-tro') === null,
    );

    const roundTrip = decodeChatCursor(
      encodeChatCursor({
        createdAt: anchor.message.createdAt,
        id: anchor.message.id,
      }),
    );
    check(
      'con trỏ qua Postgres rồi mã hoá lại vẫn khớp từng millisecond',
      roundTrip?.createdAt.getTime() === anchor.message.createdAt.getTime() &&
        roundTrip?.id === anchor.message.id,
    );

    // ── 5. Có ĐI INDEX không — phần "nặng" của yêu cầu ──────────────────────
    console.log('\nKế hoạch thực thi:\n');

    const plan = (await dataSource.query(
      `EXPLAIN (FORMAT TEXT)
       SELECT m.id FROM chat_messages m
       WHERE m.room_id = $1
         AND (m.created_at, m.id) < ($2::timestamptz, $3::bigint)
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 25`,
      [RoomId, anchor.message.createdAt, anchor.message.id],
    )) as Record<string, string>[];
    const planText = plan.map((row) => row['QUERY PLAN']).join('\n');

    check(
      'truy vấn cửa sổ đi INDEX, không quét cả bảng',
      planText.includes('Index') && !planText.includes('Seq Scan'),
      planText.split('\n')[0].trim(),
    );
    check(
      'không có bước sắp xếp riêng — index đã cho sẵn thứ tự',
      !planText.includes('Sort'),
      planText.includes('Sort') ? 'vẫn phải Sort' : '',
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
  console.log('\nPhân trang tin nhắn không lặp, không sót, và đi index.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
