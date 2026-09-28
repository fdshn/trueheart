/**
 * Kiểm quyền đọc chat và khả năng xoá lịch sử, trên Postgres THẬT.
 *
 * Vì sao cần script riêng: tài nguyên chat **không có unit test nào**, và thứ
 * cần chứng minh ở đây là "người ngoài phòng KHÔNG đọc được" — một mệnh đề phủ
 * định. Mock `query` thì nó trả về đúng cái người viết test tưởng tượng, nên
 * mệnh đề phủ định không chứng minh được gì. Chỉ database thật mới trả lời.
 *
 * Phần cuối kiểm một chuyện khác: trigger chỉ-ghi-thêm chặn UPDATE và DELETE
 * trên `chat_messages`. Đó là điều cần biết TRƯỚC khi lên lịch xoá chat định
 * kỳ, vì job xoá sẽ vỡ chứ không im lặng bỏ qua.
 *
 *   npm run test:chat-access
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_chat_access_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const GiverId = '99999999-9999-4999-8999-99999999b001';
const ReceiverId = '99999999-9999-4999-8999-99999999b002';
/** Người dùng hợp lệ nhưng KHÔNG thuộc phòng — vai chính của bài kiểm này. */
const OutsiderId = '99999999-9999-4999-8999-99999999b003';

const PostId = '88888888-8888-4888-8888-88888888b001';
const TransactionId = '55555555-5555-4555-8555-55555555b001';
const RoomId = '66666666-6666-4666-8666-66666666b001';

const OtherPostId = '88888888-8888-4888-8888-88888888b002';
const OtherTransactionId = '55555555-5555-4555-8555-55555555b002';
const OtherRoomId = '66666666-6666-4666-8666-66666666b002';

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
      [GiverId, 'nguoitang_quyen'],
      [ReceiverId, 'nguoinhan_quyen'],
      [OutsiderId, 'nguoingoai_quyen'],
    ];
    for (const [id, username] of users)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    async function seedRoom(
      postId: string,
      transactionId: string,
      roomId: string,
      giverId: string,
      receiverId: string,
      title: string,
    ): Promise<void> {
      await dataSource.query(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count)
         VALUES ($1, 'OFFER', $2, $3, $4, 'Mô tả đủ dài cho bài kiểm tra',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
        [postId, giverId, CategoryId, title],
      );
      await dataSource.query(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, quantity, status)
         VALUES ($1, $2, $3, $4, 1, 'ACCEPTED')`,
        [transactionId, postId, giverId, receiverId],
      );
      await dataSource.query(
        `INSERT INTO chat_rooms
           (global_id, transaction_id, post_id, giver_id, receiver_id, status)
         VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
        [roomId, transactionId, postId, giverId, receiverId],
      );
    }

    await seedRoom(
      PostId,
      TransactionId,
      RoomId,
      GiverId,
      ReceiverId,
      'Bài của phòng riêng',
    );
    // Phòng thứ hai để người ngoài CÓ một phòng của riêng họ: nếu danh sách hội
    // thoại lọc sai, họ sẽ thấy cả hai và phép kiểm dưới bắt được ngay.
    await seedRoom(
      OtherPostId,
      OtherTransactionId,
      OtherRoomId,
      OutsiderId,
      GiverId,
      'Bài của người ngoài',
    );

    const chat = new ChatRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    );

    await chat.appendMessage({
      globalId: '77777777-7777-4777-8777-77777777b001',
      roomId: RoomId,
      senderId: GiverId,
      body: 'Số điện thoại của mình là 0900000000, hẹn 5h chiều nhé',
    });

    // ── 1. Người ngoài không đọc được gì ────────────────────────────────────
    console.log('Người ngoài phòng:\n');

    check(
      'không lấy được phòng qua findRoomForParticipant',
      (await chat.findRoomForParticipant(RoomId, OutsiderId)) === null,
    );
    check(
      'không lấy được phòng qua describeRoom — đây là cửa mà API lịch sử đi qua',
      (await chat.describeRoom(RoomId, OutsiderId)) === null,
    );

    const outsiderRooms = await chat.listRoomsForUser({
      userId: OutsiderId,
      skip: 0,
      take: 20,
    });
    check(
      'danh sách hội thoại chỉ có phòng của chính họ',
      outsiderRooms.items.length === 1 &&
        outsiderRooms.items[0].room.globalId === OtherRoomId,
      `${outsiderRooms.items.length} phòng`,
    );
    check(
      'nội dung tin nhắn phòng khác KHÔNG lọt vào danh sách',
      outsiderRooms.items.every(
        (item) => !String(item.lastMessageBody ?? '').includes('0900000000'),
      ),
    );

    const outsiderWrite = await chat.appendMessage({
      globalId: '77777777-7777-4777-8777-77777777b002',
      roomId: RoomId,
      senderId: OutsiderId,
      body: 'Chen vào phòng người khác',
    });
    check(
      'không ghi được tin vào phòng người khác',
      outsiderWrite.status === 'ROOM_NOT_FOUND',
      outsiderWrite.status,
    );
    check(
      'và không có tin nào của họ lọt vào bảng',
      Number(
        (
          await dataSource.query<{ count: string }[]>(
            `SELECT COUNT(*) AS count FROM chat_messages
             WHERE room_id = $1 AND sender_id = $2`,
            [RoomId, OutsiderId],
          )
        )[0].count,
      ) === 0,
    );

    check(
      'không đánh dấu đã đọc hộ phòng người khác',
      (await chat.markRead(RoomId, OutsiderId)) === null,
    );
    check(
      'và mốc đã đọc của hai người trong phòng không bị đụng',
      Number(
        (
          await dataSource.query<{ count: string }[]>(
            `SELECT COUNT(*) AS count FROM chat_rooms
             WHERE global_id = $1
               AND giver_read_at IS NULL AND receiver_read_at IS NULL`,
            [RoomId],
          )
        )[0].count,
      ) === 1,
    );

    // ── 2. Hai người trong phòng thì đọc được ───────────────────────────────
    console.log('\nHai bên trong phòng:\n');

    for (const [label, userId] of [
      ['người tặng', GiverId],
      ['người nhận', ReceiverId],
    ] as [string, string][])
      check(
        `${label} đọc được phòng của mình`,
        (await chat.describeRoom(RoomId, userId)) !== null,
      );

    const history = await chat.listMessages({ roomId: RoomId, limit: 10 });
    check(
      'lịch sử có đúng tin đã gửi',
      history.items.length === 1 &&
        history.items[0].message.body.includes('0900000000'),
      `${history.items.length} tin`,
    );

    // ── 3. Xoá chat định kỳ — có chạy được không ────────────────────────────
    console.log('\nXoá lịch sử chat:\n');

    let deleteBlocked = false;
    let deleteMessage = '';
    try {
      await dataSource.query(`DELETE FROM chat_messages WHERE room_id = $1`, [
        RoomId,
      ]);
    } catch (error) {
      deleteBlocked = true;
      deleteMessage = (error as Error).message;
    }
    check(
      'DELETE bị trigger chỉ-ghi-thêm CHẶN — job xoá định kỳ sẽ vỡ, không im lặng',
      deleteBlocked,
      deleteMessage.slice(0, 60),
    );

    let updateBlocked = false;
    try {
      await dataSource.query(
        `UPDATE chat_messages SET body = 'sửa trộm' WHERE room_id = $1`,
        [RoomId],
      );
    } catch {
      updateBlocked = true;
    }
    check('UPDATE cũng bị chặn — lịch sử không sửa được', updateBlocked);

    check(
      'tin nhắn vẫn còn nguyên sau hai lần thử',
      Number(
        (
          await dataSource.query<{ count: string }[]>(
            `SELECT COUNT(*) AS count FROM chat_messages WHERE room_id = $1`,
            [RoomId],
          )
        )[0].count,
      ) === 1,
    );
    // ── Thu hồi tin nhắn ────────────────────────────────────────────────────
    //
    // Đây là chỗ đục một lỗ vào trigger append-only, nên phải chứng minh cái lỗ
    // đó HẸP: cho đúng hình dạng thu hồi, và vẫn chặn mọi thứ khác.
    console.log('\nThu hồi tin nhắn:\n');

    const recallId = '77777777-7777-4777-8777-77777777b010';
    await chat.appendMessage({
      globalId: recallId,
      roomId: RoomId,
      senderId: GiverId,
      body: 'Nhà mình ở 12 Nguyễn Trãi, gửi nhầm phòng rồi',
    });

    const notMine = await chat.recallMessage({
      roomId: RoomId,
      messageId: recallId,
      senderId: ReceiverId,
      windowMinutes: 5,
    });
    check(
      'người KHÔNG gửi thì không thu hồi được',
      notMine.status === 'NOT_FOUND',
      notMine.status,
    );

    const recalled = await chat.recallMessage({
      roomId: RoomId,
      messageId: recallId,
      senderId: GiverId,
      windowMinutes: 5,
    });
    check(
      'người gửi thu hồi được trong cửa sổ',
      recalled.status === 'RECALLED',
      recalled.status,
    );

    const [recalledRow] = await dataSource.query<
      { body: string; recalled_at: Date | null; media_count: number }[]
    >(
      `SELECT body, recalled_at, media_count FROM chat_messages WHERE global_id = $1`,
      [recallId],
    );
    check(
      'nội dung bị làm RỖNG, không phải xoá dòng',
      recalledRow !== undefined &&
        recalledRow.body === '' &&
        recalledRow.recalled_at !== null,
      `body='${recalledRow?.body}' recalled_at=${recalledRow?.recalled_at}`,
    );
    check(
      'dòng vẫn giữ chỗ trong cuộc trò chuyện',
      recalledRow !== undefined,
    );

    const twice = await chat.recallMessage({
      roomId: RoomId,
      messageId: recallId,
      senderId: GiverId,
      windowMinutes: 5,
    });
    check(
      'thu hồi lần nữa không làm gì thêm',
      twice.status === 'NOT_FOUND',
      twice.status,
    );

    // Hết cửa sổ: dựng một tin có `created_at` lùi về quá khứ.
    const oldId = '77777777-7777-4777-8777-77777777b011';
    await chat.appendMessage({
      globalId: oldId,
      roomId: RoomId,
      senderId: GiverId,
      body: 'Tin cũ',
    });
    await dataSource.query(
      `SET LOCAL chantam.chat_purge = 'on'`,
    ).catch(() => undefined);
    await dataSource.query(
      `UPDATE chat_messages SET created_at = now() - interval '30 minutes'
       WHERE global_id = $1`,
      [oldId],
    ).catch(() => undefined);

    const [oldRow] = await dataSource.query<{ created_at: Date }[]>(
      `SELECT created_at FROM chat_messages WHERE global_id = $1`,
      [oldId],
    );
    // Trigger chặn cả câu UPDATE lùi giờ ở trên — đó chính là điều cần chứng
    // minh: lỗ chỉ mở cho đúng hình dạng thu hồi, không mở cho sửa giờ gửi.
    check(
      'trigger CHẶN cả việc sửa created_at, dù có bật cờ dọn',
      new Date(oldRow.created_at).getTime() > Date.now() - 60_000,
      String(oldRow.created_at),
    );

    let plainUpdateBlocked = false;
    try {
      await dataSource.query(
        `UPDATE chat_messages SET body = 'sửa trộm sau thu hồi' WHERE global_id = $1`,
        [oldId],
      );
    } catch {
      plainUpdateBlocked = true;
    }
    check('và vẫn chặn UPDATE thường như trước', plainUpdateBlocked);

    // ── Admin đọc phòng: phải có báo xấu đang mở ────────────────────────────
    console.log('\nAdmin đọc phòng chat:\n');

    check(
      'KHÔNG có báo xấu nào thì không mở được',
      (await chat.findRoomForModeration(RoomId)) === null,
    );

    await dataSource.query(
      `INSERT INTO reports
         (global_id, reporter_user_id, target_type, target_id, reason, description, status)
       VALUES ($1, $2, 'USER', $3, 'HARASSMENT', 'Quấy rối trong chat', 'PENDING')`,
      [
        '99999999-1111-4999-8999-99999999b100',
        ReceiverId,
        GiverId,
      ],
    );

    const room = await chat.findRoomForModeration(RoomId);
    check(
      'có báo xấu ĐANG MỞ nhắm vào một bên thì mở được',
      room?.roomId === RoomId,
      String(room?.roomId),
    );
    check(
      'phòng KHÁC vẫn không mở được — báo xấu chỉ mở đúng phòng liên quan',
      (await chat.findRoomForModeration(OtherRoomId)) === null,
    );

    const moderationMessages = await chat.listMessagesForModeration(RoomId, 200);
    check(
      'đọc được tin trong phòng',
      moderationMessages.length > 0,
      `${moderationMessages.length} tin`,
    );
    check(
      'và tin đã thu hồi vẫn hiện ra, kèm mốc thu hồi',
      moderationMessages.some(
        (message) =>
          message.messageId === recallId && message.recalledAt !== null,
      ),
    );

    await dataSource.query(
      `UPDATE reports SET status = 'RESOLVED' WHERE global_id = $1`,
      ['99999999-1111-4999-8999-99999999b100'],
    );
    check(
      'báo xấu đóng lại thì cửa đóng theo',
      (await chat.findRoomForModeration(RoomId)) === null,
    );

    // ── Tắt thông báo một phòng ─────────────────────────────────────────────
    //
    // Cửa nhẹ hơn huỷ lượt trao: im lặng mà không mất món đồ đang chờ.
    console.log('\nTắt thông báo phòng:\n');

    check(
      'người NGOÀI phòng không tắt được',
      (await chat.setRoomMuted({
        roomId: RoomId,
        userId: OutsiderId,
        muted: true,
      })) === false,
    );

    check(
      'người trong phòng tắt được',
      (await chat.setRoomMuted({
        roomId: RoomId,
        userId: ReceiverId,
        muted: true,
      })) === true,
    );

    const [muteRow] = await dataSource.query<
      { giver_muted_at: Date | null; receiver_muted_at: Date | null }[]
    >(
      `SELECT giver_muted_at, receiver_muted_at FROM chat_rooms WHERE global_id = $1`,
      [RoomId],
    );
    check(
      'chỉ đặt cột của CHÍNH người gọi — bên kia không bị kéo theo',
      muteRow.receiver_muted_at !== null && muteRow.giver_muted_at === null,
      `giver=${muteRow.giver_muted_at} receiver=${muteRow.receiver_muted_at}`,
    );

    // Người tặng gửi tin: `appendMessage` phải báo rằng bên nhận đã tắt.
    const afterMute = await chat.appendMessage({
      globalId: '77777777-7777-4777-8777-77777777b020',
      roomId: RoomId,
      senderId: GiverId,
      body: 'Tin gửi khi bên kia đã tắt thông báo',
    });
    check(
      'gửi tin vẫn THÀNH CÔNG — tắt chuông không phải chặn tin',
      afterMute.status === 'APPENDED',
      afterMute.status,
    );
    check(
      'nhưng báo rõ bên nhận đã tắt, để use case bỏ qua thông báo',
      afterMute.status === 'APPENDED' && afterMute.counterpartMuted === true,
      String(
        afterMute.status === 'APPENDED' ? afterMute.counterpartMuted : 'n/a',
      ),
    );

    // Chiều ngược lại: người nhận gửi cho người tặng, người tặng CHƯA tắt.
    const toGiver = await chat.appendMessage({
      globalId: '77777777-7777-4777-8777-77777777b021',
      roomId: RoomId,
      senderId: ReceiverId,
      body: 'Tin gửi cho người chưa tắt',
    });
    check(
      'bên chưa tắt thì vẫn nhận thông báo như thường',
      toGiver.status === 'APPENDED' && toGiver.counterpartMuted === false,
      String(toGiver.status === 'APPENDED' ? toGiver.counterpartMuted : 'n/a'),
    );

    check(
      'bật lại được',
      (await chat.setRoomMuted({
        roomId: RoomId,
        userId: ReceiverId,
        muted: false,
      })) === true,
    );
    const [unmuted] = await dataSource.query<
      { receiver_muted_at: Date | null }[]
    >(
      `SELECT receiver_muted_at FROM chat_rooms WHERE global_id = $1`,
      [RoomId],
    );
    check('mốc tắt được xoá', unmuted.receiver_muted_at === null);

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
  console.log('\nChat riêng tư giữa hai bên, và lịch sử không sửa/xoá được.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
