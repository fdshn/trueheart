/**
 * Kiểm hạn lưu trữ và vòng xoá chat trên Postgres THẬT.
 *
 * Ba thứ chỉ database thật trả lời được:
 *
 *   1. **Trigger chỉ-ghi-thêm có cửa ra đúng một chiều.** Job xoá `DELETE` được,
 *      `DELETE` lẻ tẻ từ chỗ khác thì không, và `UPDATE` bị chặn tuyệt đối. Cờ
 *      là biến phiên, nên phải chạy thật mới biết nó có rò sang kết nối khác
 *      trong pool hay không.
 *   2. **`purge_after` là ảnh chụp, không phải phép tính.** Đổi config sau khi
 *      khoá phòng KHÔNG được dịch hạn của phòng đã khoá.
 *   3. **Mốc là `locked_at`, không phải `completed_at`.** Phòng của lượt HUỶ
 *      cũng phải có hạn — mà lượt huỷ thì không có `completed_at`.
 *
 *   npm run test:chat-purge
 */
import {
  ChatRetentionConfigKey,
  ChatRetentionUnits,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { publishConfigVersion } from './publish-config-version';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_chat_purge_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const GiverId = '99999999-9999-4999-8999-99999999f001';
const ReceiverId = '99999999-9999-4999-8999-99999999f002';

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

  const chat = new ChatRepository(
    dataSource.manager,
    new AdminConfigRepository(dataSource.manager),
  );
  const transactions = new GiftTransactionRepository(
    dataSource.manager,
    chat,
    new PointLedgerRepository(dataSource.manager),
  );

  let sequence = 0;

  /** Dựng một lượt trao đã duyệt, kèm hai tin nhắn trong phòng. */
  async function chattingTransaction(): Promise<{
    transactionId: string;
    roomId: string;
  }> {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const postId = `88888888-8888-4888-8888-88888888f${suffix}`;
    const transactionId = `55555555-5555-4555-8555-55555555f${suffix}`;

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, $4, 'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [postId, GiverId, CategoryId, `Bài kiểm xoá chat ${sequence}`],
    );
    // Dựng thẳng ở ACCEPTED, đúng hình dạng mà `acceptRequest` của luồng xin
    // nhận ghi ra. Cửa phụ `request()`/`accept()` đã gỡ 28/09 vì nó tạo lượt
    // trao mà bỏ qua mọi cổng — đây là FIXTURE, còn thứ script này kiểm là việc
    // dọn tin theo hạn lưu trữ.
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at)
       VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())`,
      [transactionId, postId, GiverId, ReceiverId],
    );
    await dataSource.query(
      `UPDATE posts SET remaining_quantity = GREATEST(0, remaining_quantity - 1)
       WHERE global_id = $1`,
      [postId],
    );
    // `acceptRequest` mở phòng chat trong cùng transaction; fixture phải mở hộ.
    await dataSource.query(
      `INSERT INTO chat_rooms
         (global_id, transaction_id, post_id, giver_id, receiver_id, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
      [randomUUID(), transactionId, postId, GiverId, ReceiverId],
    );

    const [room] = await dataSource.query<{ global_id: string }[]>(
      `SELECT global_id FROM chat_rooms WHERE transaction_id = $1`,
      [transactionId],
    );
    for (const [sender, body] of [
      [GiverId, 'Địa chỉ của bạn là gì ạ?'],
      [ReceiverId, 'Số 1 Nguyễn Huệ, mình ở nhà cả chiều nhé'],
    ] as [string, string][])
      await chat.appendMessage({
        globalId: randomUUID(),
        roomId: room.global_id,
        senderId: sender,
        body,
        // Tin thứ hai kèm ảnh: vòng xoá phải cuốn cả dòng ảnh lẫn key gửi ra
        // ngoài, không thì chữ biến mất mà ảnh vẫn mở được.
        mediaKeys:
          sender === ReceiverId
            ? [`users/${sender}/chat/${room.global_id}/anh-dia-chi.webp`]
            : [],
      });

    return { transactionId, roomId: room.global_id };
  }

  async function roomRow(roomId: string) {
    const [row] = await dataSource.query<
      {
        purge_after: Date | null;
        purged_at: Date | null;
        purged_message_count: number | null;
        status: string;
      }[]
    >(
      `SELECT purge_after, purged_at, purged_message_count, status
       FROM chat_rooms WHERE global_id = $1`,
      [roomId],
    );
    return row;
  }

  /**
   * Xuất bản một phiên bản cấu hình hạn lưu trữ.
   *
   * KHÔNG nhận số phiên bản nữa: bản cũ ghi cứng `1`, và khi migration
   * `1795700000000` seed sẵn version 1 cho `chat.retention` thì script nổ
   * `UQ_system_configs_key_version`. Số phiên bản là chuyện của database, không
   * phải của phép kiểm — xem `publish-config-version.ts`.
   */
  async function publishRetention(value: {
    value: number;
    unit: ChatRetentionUnits;
  }): Promise<void> {
    await publishConfigVersion(dataSource, ChatRetentionConfigKey, value);
  }

  async function messageCount(roomId: string): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM chat_messages WHERE room_id = $1`,
      [roomId],
    );
    return Number(row.count);
  }

  try {
    const users: [string, string][] = [
      [GiverId, 'nguoitang_xoachat'],
      [ReceiverId, 'nguoinhan_xoachat'],
    ];
    for (const [id, username] of users)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    // ── 1. Hạn được chốt lúc khoá, theo mặc định ────────────────────────────
    console.log('Chốt hạn lúc khoá phòng:\n');

    const open = await chattingTransaction();
    check(
      'phòng còn mở thì CHƯA có hạn xoá',
      (await roomRow(open.roomId)).purge_after === null,
    );

    await transactions.confirmReceipt(open.transactionId, ReceiverId);
    const locked = await roomRow(open.roomId);
    check('xác nhận xong thì phòng khoá', locked.status === 'READ_ONLY');
    check(
      'và hạn xoá được ghi ngay',
      locked.purge_after !== null,
      String(locked.purge_after),
    );

    const daysAway = Math.round(
      (new Date(locked.purge_after as Date).getTime() - Date.now()) /
        86_400_000,
    );
    check(
      'mặc định là 1 tuần khi chưa cấu hình gì',
      daysAway === 7,
      `${daysAway} ngày`,
    );

    // ── 2. Đổi config KHÔNG dịch hạn của phòng đã khoá ──────────────────────
    console.log('\nAdmin đổi cấu hình:\n');

    await publishRetention({ value: 3, unit: ChatRetentionUnits.WEEK });

    check(
      'phòng đã khoá GIỮ NGUYÊN hạn cũ — lời hứa đã nói với người dùng',
      new Date((await roomRow(open.roomId)).purge_after as Date).getTime() ===
        new Date(locked.purge_after as Date).getTime(),
    );

    const afterConfig = await chattingTransaction();
    await transactions.confirmReceipt(afterConfig.transactionId, ReceiverId);
    const newDays = Math.round(
      (new Date(
        (await roomRow(afterConfig.roomId)).purge_after as Date,
      ).getTime() -
        Date.now()) /
        86_400_000,
    );
    check(
      'phòng khoá SAU khi đổi thì theo cấu hình mới',
      newDays === 21,
      `${newDays} ngày`,
    );

    // Đơn vị ngày cũng phải chạy. Phiên bản cao hơn thắng — copy-on-write như
    // mọi system config khác, không sửa đè bản cũ.
    await publishRetention({ value: 10, unit: ChatRetentionUnits.DAY });
    const byDay = await chattingTransaction();
    await transactions.confirmReceipt(byDay.transactionId, ReceiverId);
    const dayUnitDays = Math.round(
      (new Date((await roomRow(byDay.roomId)).purge_after as Date).getTime() -
        Date.now()) /
        86_400_000,
    );
    check(
      'đơn vị NGÀY cũng chạy, không chỉ tuần',
      dayUnitDays === 10,
      `${dayUnitDays} ngày`,
    );

    // ── 3. Lượt HUỶ cũng có hạn ─────────────────────────────────────────────
    console.log('\nLượt trao bị huỷ:\n');

    const cancelled = await chattingTransaction();
    await transactions.close({
      transactionId: cancelled.transactionId,
      actorUserId: ReceiverId,
      status: 'CANCELLED',
      reason: 'Không nhận được nữa',
    });
    check(
      'phòng của lượt HUỶ cũng có hạn xoá — mốc là locked_at, không phải completed_at',
      (await roomRow(cancelled.roomId)).purge_after !== null,
    );

    // ── 4. Vòng xoá ─────────────────────────────────────────────────────────
    console.log('\nVòng xoá:\n');

    const notDue = await chat.purgeExpiredRooms(100);
    check(
      'chưa tới hạn thì không xoá gì',
      notDue.purgedRooms === 0 && notDue.purgedMessages === 0,
      JSON.stringify(notDue),
    );

    await dataSource.query(
      `UPDATE chat_rooms SET purge_after = now() - interval '1 day'
       WHERE global_id = $1`,
      [open.roomId],
    );
    const purged = await chat.purgeExpiredRooms(100);
    check(
      'quá hạn thì xoá đúng một phòng',
      purged.purgedRooms === 1,
      `${purged.purgedRooms} phòng`,
    );
    check(
      'và đếm đúng số tin đã xoá',
      purged.purgedMessages === 2,
      `${purged.purgedMessages} tin`,
    );
    check('tin nhắn thật sự biến mất', (await messageCount(open.roomId)) === 0);
    check(
      'key ảnh được trả ra ngoài để xoá object — xoá object không nằm trong transaction được',
      purged.mediaKeys.length === 1 &&
        purged.mediaKeys[0].includes('anh-dia-chi.webp'),
      purged.mediaKeys.join(','),
    );

    const [mediaLeft] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM chat_message_media WHERE room_id = $1`,
      [open.roomId],
    );
    check(
      'dòng ảnh cũng đi theo tin nhắn qua ON DELETE CASCADE',
      mediaLeft.count === '0',
      mediaLeft.count,
    );

    const purgedRoom = await roomRow(open.roomId);
    check(
      'PHÒNG vẫn còn — mở lại lượt trao cũ không ra 404',
      purgedRoom.status === 'READ_ONLY',
    );
    check('ghi lại đã xoá lúc nào', purgedRoom.purged_at !== null);
    check(
      'ghi lại đã xoá bao nhiêu tin',
      Number(purgedRoom.purged_message_count) === 2,
      String(purgedRoom.purged_message_count),
    );

    const again = await chat.purgeExpiredRooms(100);
    check(
      'chạy lại không xử lý phòng đã xoá',
      again.purgedRooms === 0,
      `${again.purgedRooms} phòng`,
    );

    check(
      'phòng chưa tới hạn vẫn còn nguyên tin nhắn',
      (await messageCount(afterConfig.roomId)) === 2,
    );

    // ── 5. Giữ lại bằng cách gỡ hạn ─────────────────────────────────────────
    console.log('\nGiữ chứng cứ:\n');

    await dataSource.query(
      `UPDATE chat_rooms SET purge_after = NULL WHERE global_id = $1`,
      [cancelled.roomId],
    );
    await chat.purgeExpiredRooms(100);
    check(
      'gỡ hạn thì KHÔNG bao giờ bị xoá, dù quá hạn bao lâu',
      (await messageCount(cancelled.roomId)) === 2,
    );

    // ── 6. Cửa ra của trigger chỉ đi một chiều ──────────────────────────────
    console.log('\nCửa ra của trigger chỉ-ghi-thêm:\n');

    let strayDelete = false;
    try {
      await dataSource.query(`DELETE FROM chat_messages WHERE room_id = $1`, [
        afterConfig.roomId,
      ]);
    } catch {
      strayDelete = true;
    }
    check(
      'DELETE lẻ tẻ ngoài job xoá VẪN bị chặn — cờ không rò sang kết nối khác',
      strayDelete,
    );
    check(
      'và tin nhắn còn nguyên',
      (await messageCount(afterConfig.roomId)) === 2,
    );

    let updateBlocked = false;
    try {
      await dataSource.manager.transaction(async (manager) => {
        await manager.query(`SET LOCAL "chantam.chat_purge" = 'on'`);
        await manager.query(
          `UPDATE chat_messages SET body = 'sửa trộm' WHERE room_id = $1`,
          [afterConfig.roomId],
        );
      });
    } catch {
      updateBlocked = true;
    }
    check('UPDATE bị chặn TUYỆT ĐỐI, kể cả khi bật cờ xoá', updateBlocked);
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
  console.log(
    '\nHạn lưu trữ được chốt đúng lúc, và vòng xoá chỉ đụng thứ nên đụng.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
