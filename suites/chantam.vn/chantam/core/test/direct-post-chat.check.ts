/**
 * Chat trực tiếp theo bài Rao vặt (`DIRECT_POST`) chạy song song chat giao dịch, trên
 * Postgres THẬT (PR #46 §7).
 *
 *   npm run test:direct-post-chat
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_direct_post_chat_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const Seller = '7e000000-0000-4000-8000-000000000001';
const Buyer = '7e000000-0000-4000-8000-000000000002';
const Outsider = '7e000000-0000-4000-8000-000000000003';
const ClassifiedA = '7f000000-0000-4000-8000-000000000001';
const ClassifiedB = '7f000000-0000-4000-8000-000000000002';
const OfferPost = '7f000000-0000-4000-8000-000000000003';

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
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);

    for (const [id, username] of [
      [Seller, 'dp_seller'],
      [Buyer, 'dp_buyer'],
      [Outsider, 'dp_outsider'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status, full_name, avatar_url)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', $3, $4)`,
        // Tham số riêng cho từng cột: dùng lại `$2` vừa làm varchar vừa nối chuỗi là 42P08.
        [id, username, username, `https://cdn/${username}.png`],
      );
    for (const [id, type, price] of [
      [ClassifiedA, 'CLASSIFIED', 150000],
      [ClassifiedB, 'CLASSIFIED', 90000],
      [OfferPost, 'OFFER', null],
    ] as const)
      await sql(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count)
         VALUES ($1, $2, $3, $4, 'Bài kiểm chat', 'Mô tả đủ dài cho bài kiểm chat trực tiếp',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'PUBLISHED', 1, 1,
                 CASE WHEN $5::int IS NULL THEN '{}'::jsonb
                      ELSE jsonb_build_object('price', $5::int, 'negotiable', false) END, 0)`,
        [id, type, Seller, CategoryId, price],
      );
    await sql(
      `INSERT INTO post_media (post_id, r2_key, sort_order)
       VALUES ($1, 'posts/a/first.webp', 0), ($1, 'posts/a/second.webp', 1)`,
      [ClassifiedA],
    );

    const chat = new ChatRepository(dataSource.manager, {
      getConfigValue: async () => null,
    } as never);

    console.log('1. Mở phòng trực tiếp');
    const first = await chat.openDirectPostRoom({
      postId: ClassifiedA,
      buyerId: Buyer,
      sellerId: Seller,
    });
    const again = await chat.openDirectPostRoom({
      postId: ClassifiedA,
      buyerId: Buyer,
      sellerId: Seller,
    });
    check(
      'mở lại cùng bài, cùng hai người: trả ĐÚNG phòng cũ',
      first.room.globalId === again.room.globalId && !again.created,
    );
    check('lần đầu báo created', first.created);
    const otherPost = await chat.openDirectPostRoom({
      postId: ClassifiedB,
      buyerId: Buyer,
      sellerId: Seller,
    });
    check(
      'cùng hai người, bài khác: phòng khác',
      otherPost.room.globalId !== first.room.globalId,
    );
    const [counts] = await sql(
      `SELECT count(*)::int AS rooms FROM chat_rooms WHERE room_type = 'DIRECT_POST'`,
    );
    check('đúng hai phòng trực tiếp', counts.rooms === 2, String(counts.rooms));
    const raced = await Promise.all(
      [0, 1].map(() =>
        chat.openDirectPostRoom({
          postId: OfferPost,
          buyerId: Outsider,
          sellerId: Seller,
        }),
      ),
    );
    check(
      'hai lượt mở song song không tạo phòng trùng',
      raced[0].room.globalId === raced[1].room.globalId &&
        raced.filter((result) => result.created).length === 1,
    );

    console.log('\n2. Ràng buộc schema');
    let rejected = '';
    try {
      await sql(
        `INSERT INTO chat_rooms (global_id, post_id, giver_id, receiver_id, room_type)
         VALUES (gen_random_uuid(), $1, $2, $3, 'TRANSACTION')`,
        [ClassifiedA, Seller, Outsider],
      );
    } catch (error) {
      rejected = String(
        (error as { driverError?: { constraint?: string } }).driverError
          ?.constraint,
      );
    }
    check(
      'phòng TRANSACTION thiếu transaction_id bị chặn',
      rejected === 'CHK_chat_rooms_type_transaction',
      rejected,
    );

    console.log('\n3. Quyền và tóm tắt');
    check(
      'người ngoài không thấy phòng',
      (await chat.findRoomForParticipant(first.room.globalId, Outsider)) ===
        null,
    );
    const asBuyer = await chat.describeRoom(first.room.globalId, Buyer);
    check(
      'tóm tắt: loại phòng, không giao dịch, ảnh đầu, giá, avatar người kia',
      asBuyer?.room.roomType === 'DIRECT_POST' &&
        asBuyer?.room.transactionId === null &&
        asBuyer?.postThumbnailKey === 'posts/a/first.webp' &&
        asBuyer?.postPrice === 150000 &&
        asBuyer?.counterpartAvatarUrl === 'https://cdn/dp_seller.png',
      JSON.stringify({
        type: asBuyer?.room.roomType,
        tx: asBuyer?.room.transactionId,
        thumb: asBuyer?.postThumbnailKey,
        price: asBuyer?.postPrice,
        avatar: asBuyer?.counterpartAvatarUrl,
      }),
    );
    const sellerList = await chat.listRoomsForUser({
      userId: Seller,
      skip: 0,
      take: 10,
    });
    check(
      'người bán thấy cả ba phòng trong danh sách',
      sellerList.total === 3,
      String(sellerList.total),
    );
    const sent = await chat.appendMessage({
      globalId: '7a7a7a7a-0000-4000-8000-000000000001',
      roomId: first.room.globalId,
      senderId: Buyer,
      body: 'Món này còn không ạ?',
    } as never);
    check(
      'gửi tin trong phòng trực tiếp được',
      (sent as { status: string }).status === 'APPENDED',
      (sent as { status: string }).status,
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
        ? 'Chat trực tiếp: một phòng mỗi (bài, người mua, người bán), không trùng khi mở song song, ràng buộc loại phòng, tóm tắt đủ trường'
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
