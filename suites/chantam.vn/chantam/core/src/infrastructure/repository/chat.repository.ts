import {
  AppendChatMessageOutcome,
  IAdminConfigRepository,
  IAppendChatMessageParams,
  IChatMessageFlagItem,
  IChatMessageListItem,
  IChatRepository,
  IChatRoomListItem,
  IOpenChatRoomParams,
} from '@/domain/ports/repository';
import { ChatMessageEntity, ChatRoomEntity } from '@/infrastructure/entity';
import {
  ChatRoomStatuses,
  MaxContentMediaPerItem,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IChatMessageEntity,
  IChatRoomEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import {
  ChatRetentionConfigKey,
  chatRetentionDays,
  IChatCursor,
  normalizeChatRetention,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

/**
 * Số tin chưa đọc của một người trong một phòng, dưới dạng SQL con.
 *
 * Không đếm tin do chính họ gửi, và `read_at IS NULL` nghĩa là chưa đọc gì nên
 * đếm hết. Gom vào một chỗ để danh sách hội thoại và màn chi tiết không lệch
 * nhau — hai định nghĩa "chưa đọc" khác nhau là badge nói một đằng, mở ra một
 * nẻo.
 */
const UnreadCountSql = `
  (SELECT COUNT(*) FROM chat_messages m
    WHERE m.room_id = room.global_id
      AND m.sender_id <> $2
      AND (
        CASE WHEN room.giver_id = $2 THEN room.giver_read_at
             ELSE room.receiver_read_at END IS NULL
        OR m.created_at > CASE WHEN room.giver_id = $2 THEN room.giver_read_at
                               ELSE room.receiver_read_at END
      ))
`;

@Injectable()
export class ChatRepository implements IChatRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    // Đọc hạn lưu trữ lúc khoá phòng. Repository gọi repository trong cùng tầng hạ
    // tầng — cùng lý do với việc giao dịch gọi chat: việc này phải nằm trong
    // transaction được mở ở tầng dưới, không phải ở use case.
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async openRoomWithinTransaction(
    manager: EntityManager,
    params: IOpenChatRoomParams,
  ): Promise<IChatRoomEntity> {
    // `ON CONFLICT DO NOTHING` trên `transaction_id` UNIQUE: gọi lại trên một
    // lượt đã có phòng là chuyện bình thường (retry, job chạy lại), không phải
    // sự cố. INSERT không bị bọc kết quả nên đọc thẳng được.
    await manager.query(
      `
        INSERT INTO chat_rooms
          (global_id, transaction_id, post_id, giver_id, receiver_id, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("transaction_id") DO NOTHING
      `,
      [
        params.globalId,
        params.transactionId,
        params.postId,
        params.giverId,
        params.receiverId,
        ChatRoomStatuses.OPEN,
      ],
    );

    // Đọc lại theo `transaction_id` chứ không theo `global_id` đã sinh: nếu
    // phòng đã tồn tại thì nó mang id cũ, và trả về id vừa sinh sẽ là một
    // tham chiếu tới hàng không tồn tại.
    const room = await manager.findOne(ChatRoomEntity, {
      where: { transactionId: params.transactionId },
    });
    if (!room)
      throw new Error(
        `Không mở được phòng chat cho giao dịch ${params.transactionId}`,
      );
    return room;
  }

  public async lockRoomWithinTransaction(
    manager: EntityManager,
    transactionId: string,
  ): Promise<void> {
    // Hạn lưu trữ được CHỐT ngay tại đây, không tính lại mỗi lần đọc. Tiếp tục
    // tính từ config thì báo với người dùng "xoá sau 1 tuần" rồi Admin đổi thành 3
    // tuần là lời hứa và thực tế lệch nhau — và người dùng là bên chịu.
    //
    // Config hỏng thì `normalizeChatRetention` rơi về mặc định. Khoá phòng là hệ quả
    // của một lượt trao vừa xong; hạn lưu trữ chỉ là chính sách dọn dẹp, không được
    // đánh đổ nó.
    const retention = normalizeChatRetention(
      await this.adminConfig.getConfigValue(ChatRetentionConfigKey),
    );

    // Điều kiện `status = 'OPEN'`: khoá hai lần không được dịch `locked_at` về mốc
    // muộn hơn, vì đó là mốc giao dịch kết thúc — và giờ nó cũng là mốc đếm ngược.
    await manager.query(
      `
        UPDATE chat_rooms
        SET status = $2,
            locked_at = now(),
            purge_after = now() + ($4 || ' days')::interval,
            updated_at = now()
        WHERE transaction_id = $1 AND status = $3
      `,
      [
        transactionId,
        ChatRoomStatuses.READ_ONLY,
        ChatRoomStatuses.OPEN,
        String(chatRetentionDays(retention)),
      ],
    );
  }

  public async setRoomMuted(params: {
    roomId: string;
    userId: string;
    muted: boolean;
  }): Promise<boolean> {
    // Đặt đúng cột của NGƯỜI GỌI. Tắt thông báo là lựa chọn riêng của từng
    // người; một cột chung sẽ biến nó thành thao tác áp cho cả hai.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `
        UPDATE chat_rooms
        SET giver_muted_at = CASE
              WHEN giver_id = $2 THEN $3::timestamptz ELSE giver_muted_at
            END,
            receiver_muted_at = CASE
              WHEN receiver_id = $2 THEN $3::timestamptz ELSE receiver_muted_at
            END,
            updated_at = now()
        WHERE global_id = $1 AND $2 IN (giver_id, receiver_id)
        RETURNING global_id
      `,
      [params.roomId, params.userId, params.muted ? new Date() : null],
    );

    return rows.length > 0;
  }

  public async reopenRoomWithinTransaction(
    manager: EntityManager,
    transactionId: string,
  ): Promise<void> {
    // Xoá cả `locked_at` lẫn `purge_after`: hai mốc đó nói "cuộc này đã kết
    // thúc vào lúc X và sẽ bị xoá vào ngày Y". Mở lại mà giữ chúng là hẹn xoá
    // một cuộc đang sống.
    await manager.query(
      `
        UPDATE chat_rooms
        SET status = $2,
            locked_at = NULL,
            purge_after = NULL,
            updated_at = now()
        WHERE transaction_id = $1 AND status = $3
      `,
      [transactionId, ChatRoomStatuses.OPEN, ChatRoomStatuses.READ_ONLY],
    );
  }

  public async findRoomForParticipant(
    roomId: string,
    userId: string,
  ): Promise<IChatRoomEntity | null> {
    return this.manager
      .createQueryBuilder(ChatRoomEntity, 'room')
      .where('room.globalId = :roomId', { roomId })
      .andWhere('(room.giverId = :userId OR room.receiverId = :userId)', {
        userId,
      })
      .getOne();
  }

  /**
   * Phần SELECT dùng chung cho danh sách và chi tiết phòng.
   *
   * Quy ước tham số: **`$2` luôn là người đang xem** — `UnreadCountSql` tham
   * chiếu nó. Nơi gọi phải truyền id người xem ở vị trí đó, và cũng phải bảo đảm
   * mọi tham số mình truyền đều được tham chiếu ở đâu đó trong câu lệnh.
   */
  private roomListQuery(where: string): string {
    return `
      SELECT room.id, room.global_id, room.transaction_id, room.post_id,
             room.giver_id, room.receiver_id, room.status,
             room.last_message_at, room.giver_read_at, room.receiver_read_at,
             room.locked_at, room.created_at, room.updated_at,
             post.title AS post_title,
             counterpart.username AS counterpart_username,
             counterpart.full_name AS counterpart_full_name,
             (SELECT m.body FROM chat_messages m
               WHERE m.room_id = room.global_id
               ORDER BY m.created_at DESC, m.id DESC
               LIMIT 1) AS last_message_body,
             ${UnreadCountSql} AS unread_count
      FROM chat_rooms room
      JOIN posts post ON post.global_id = room.post_id
      -- Alias counterpart chứ không phải user: user là từ khoá reserved của
      -- Postgres, kể cả dạng AS user cũng là lỗi cú pháp.
      JOIN users counterpart
        ON counterpart.global_id = CASE WHEN room.giver_id = $2
                                        THEN room.receiver_id
                                        ELSE room.giver_id END
      WHERE ${where}
    `;
  }

  private toListItem(row: Record<string, unknown>): IChatRoomListItem {
    return {
      room: {
        id: Number(row.id),
        globalId: String(row.global_id),
        transactionId: String(row.transaction_id),
        postId: String(row.post_id),
        giverId: String(row.giver_id),
        receiverId: String(row.receiver_id),
        status: row.status as ChatRoomStatuses,
        lastMessageAt: (row.last_message_at as Date | null) ?? null,
        giverReadAt: (row.giver_read_at as Date | null) ?? null,
        receiverReadAt: (row.receiver_read_at as Date | null) ?? null,
        lockedAt: (row.locked_at as Date | null) ?? null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
      } as IChatRoomEntity,
      postTitle: String(row.post_title),
      counterpartUsername: String(row.counterpart_username),
      counterpartFullName: (row.counterpart_full_name as string | null) ?? null,
      lastMessageBody: (row.last_message_body as string | null) ?? null,
      unreadCount: Number(row.unread_count),
    };
  }

  public async listRoomsForUser(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ items: IChatRoomListItem[]; total: number }> {
    const rows = await this.manager.query<Record<string, unknown>[]>(
      // Lọc theo `$1`, KHÔNG phải `$2`, dù hai tham số mang cùng một giá trị.
      // `UnreadCountSql` dùng `$2`, còn Postgres từ chối câu lệnh có tham số
      // được truyền mà không chỗ nào tham chiếu: "could not determine data type
      // of parameter $1". Nên `$1` phải xuất hiện thật ở đây.
      `${this.roomListQuery('room.giver_id = $1 OR room.receiver_id = $1')}
       -- Phòng chưa ai nói nằm sau phòng có tin, nhưng KHÔNG bị mất: người
       -- dùng phải thấy phòng vừa mở để bắt đầu trao đổi.
       ORDER BY room.last_message_at DESC NULLS LAST, room.id DESC
       LIMIT $3 OFFSET $4`,
      [params.userId, params.userId, params.take, params.skip],
    );

    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM chat_rooms room
        WHERE room.giver_id = $1 OR room.receiver_id = $1`,
      [params.userId],
    );

    return {
      items: rows.map((row) => this.toListItem(row)),
      total: Number(total),
    };
  }

  public async findPurgeSchedule(
    transactionId: string,
  ): Promise<{ roomId: string; purgeAfter: Date } | null> {
    const [row] = await this.manager.query<
      { global_id: string; purge_after: Date | null }[]
    >(
      `
        SELECT global_id, purge_after
        FROM chat_rooms
        WHERE transaction_id = $1
      `,
      [transactionId],
    );
    if (!row?.purge_after) return null;
    return { roomId: row.global_id, purgeAfter: row.purge_after };
  }

  public async purgeExpiredRooms(limit: number): Promise<{
    purgedRooms: number;
    purgedMessages: number;
    mediaKeys: string[];
  }> {
    return this.manager.transaction(async (manager) => {
      // SKIP LOCKED de hai lan chay song song khong tranh cung mot phong.
      const due = await manager.query<{ global_id: string }[]>(
        `
          SELECT global_id
          FROM chat_rooms
          WHERE purge_after IS NOT NULL
            AND purged_at IS NULL
            AND purge_after <= now()
          ORDER BY purge_after ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [limit],
      );
      if (due.length === 0)
        return { purgedRooms: 0, purgedMessages: 0, mediaKeys: [] };

      const roomIds = due.map((row) => row.global_id);

      // Thu key ảnh TRƯỚC khi xoá: `ON DELETE CASCADE` sẽ cuốn mất dòng ảnh
      // cùng tin nhắn, và lúc đó không còn gì để biết object nào cần dọn.
      const media = await manager.query<{ storage_key: string }[]>(
        `
          SELECT storage_key FROM chat_message_media
          WHERE room_id = ANY($1::uuid[])
        `,
        [roomIds],
      );

      // Cua ra cho trigger chi-ghi-them. SET LOCAL nen co chet theo transaction,
      // khong ro sang ket noi khac trong pool. Trigger chi nhan DELETE khi thay
      // co nay; UPDATE van bi chan tuyet doi.
      await manager.query(`SET LOCAL "chantam.chat_purge" = 'on'`);

      // Qua updateReturning: TypeORM boc DELETE ... RETURNING thanh
      // [rows, affected], khong phai rows. Tu go bang tay o day la lap lai dung
      // cai bay ma helper sinh ra de bit.
      const deleted = await updateReturning<{ room_id: string }>(
        manager,
        `
          DELETE FROM chat_messages
          WHERE room_id = ANY($1::uuid[])
          RETURNING room_id
        `,
        [roomIds],
      );

      const perRoom = new Map<string, number>();
      for (const row of deleted)
        perRoom.set(row.room_id, (perRoom.get(row.room_id) ?? 0) + 1);

      // Ghi lai da xoa bao nhieu: khong co con so nay thi khong ai tra loi duoc
      // "phong do mat bao nhieu tin" khi co nguoi hoi.
      for (const roomId of roomIds)
        await manager.query(
          `
            UPDATE chat_rooms
            SET purged_at = now(),
                purged_message_count = $2,
                last_message_at = NULL,
                updated_at = now()
            WHERE global_id = $1
          `,
          [roomId, perRoom.get(roomId) ?? 0],
        );

      return {
        purgedRooms: roomIds.length,
        purgedMessages: [...perRoom.values()].reduce(
          (total, count) => total + count,
          0,
        ),
        // Trả ra ngoài để xoá object SAU khi commit: xoá object không nằm trong
        // transaction database được. Làm ngược lại — xoá object trước — thì
        // tiến trình chết giữa chừng sẽ để lại dòng trỏ vào ảnh không còn.
        mediaKeys: media.map((row) => row.storage_key),
      };
    });
  }

  public async describeRoom(
    roomId: string,
    userId: string,
  ): Promise<IChatRoomListItem | null> {
    const [row] = await this.manager.query<Record<string, unknown>[]>(
      this.roomListQuery(
        'room.global_id = $1 AND (room.giver_id = $2 OR room.receiver_id = $2)',
      ),
      [roomId, userId],
    );
    return row ? this.toListItem(row) : null;
  }

  public async listPendingFlags(params: {
    skip: number;
    take: number;
  }): Promise<{ items: IChatMessageFlagItem[]; total: number }> {
    const rows = await this.manager.query<
      {
        flag_id: string;
        message_id: string;
        room_id: string;
        sender_id: string;
        sender_username: string;
        severity: string;
        matched_terms: string[];
        body: string;
        recalled_at: Date | null;
        created_at: Date;
        total: string;
      }[]
    >(
      `
        SELECT flag.global_id AS flag_id,
               flag.message_id,
               flag.room_id,
               flag.sender_id,
               person.username AS sender_username,
               flag.severity,
               flag.matched_terms,
               message.body,
               message.recalled_at,
               flag.created_at,
               COUNT(*) OVER () AS total
        FROM chat_message_flags flag
        INNER JOIN chat_messages message
          ON message.global_id = flag.message_id
        INNER JOIN users person ON person.global_id = flag.sender_id
        WHERE flag.reviewed_at IS NULL
        -- BLOCK trước REVIEW rồi cũ trước mới: mức nặng chỉ để XẾP hàng đợi, chat
        -- không chặn ai. Sắp theo chuỗi được vì 'BLOCK' < 'REVIEW' theo thứ tự chữ.
        ORDER BY flag.severity ASC, flag.created_at ASC
        LIMIT $1 OFFSET $2
      `,
      [params.take, params.skip],
    );

    return {
      items: rows.map((row) => ({
        flagId: row.flag_id,
        messageId: row.message_id,
        roomId: row.room_id,
        senderId: row.sender_id,
        senderUsername: row.sender_username,
        severity: row.severity,
        matchedTerms: row.matched_terms,
        // Tin đã bị thu hồi thì nội dung không còn nghĩa gì để Admin đọc, nhưng
        // dòng cờ vẫn phải hiện: nó là bằng chứng người đó từng gửi câu ấy.
        body: row.recalled_at === null ? row.body : null,
        recalled: row.recalled_at !== null,
        createdAt: row.created_at,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  public async countPendingFlags(): Promise<number> {
    const [row] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total FROM chat_message_flags WHERE reviewed_at IS NULL`,
    );

    return Number(row?.total ?? 0);
  }

  public async reviewFlag(params: {
    flagId: string;
    reviewerId: string;
    action: string;
    note: string | null;
  }): Promise<boolean> {
    const result = await this.manager.query<unknown>(
      `
        UPDATE chat_message_flags
        SET reviewed_at = now(),
            reviewed_by = $2,
            action = $3::chat_flag_actions_enum,
            review_note = $4
        WHERE global_id = $1
          -- CHỈ dòng chưa xem. Cho ghi lại lên dòng đã xử là xoá mất quyết định
          -- của người trước, và audit sẽ nói hai chuyện khác nhau.
          AND reviewed_at IS NULL
      `,
      [params.flagId, params.reviewerId, params.action, params.note],
    );

    return Number((result as [unknown[], number])[1] ?? 0) > 0;
  }

  public async appendMessage(
    params: IAppendChatMessageParams,
  ): Promise<AppendChatMessageOutcome> {
    return this.manager.transaction(async (manager) => {
      // Khoá hàng phòng rồi mới kiểm: đọc trạng thái trước rồi ghi sau sẽ cho
      // một tin lọt vào phòng vừa bị khoá ở giữa hai bước.
      const [room] = await manager.query<
        {
          status: string;
          giver_id: string;
          receiver_id: string;
          giver_muted_at: Date | null;
          receiver_muted_at: Date | null;
        }[]
      >(
        `
          SELECT status, giver_id, receiver_id,
                 giver_muted_at, receiver_muted_at
          FROM chat_rooms
          WHERE global_id = $1
          FOR UPDATE
        `,
        [params.roomId],
      );

      if (!room) return { status: 'ROOM_NOT_FOUND' };

      const isParticipant =
        room.giver_id === params.senderId ||
        room.receiver_id === params.senderId;
      // Người ngoài phòng nhận cùng câu trả lời với phòng không tồn tại: phân
      // biệt hai cái là để lộ ai đang trao đổi với ai.
      if (!isParticipant) return { status: 'ROOM_NOT_FOUND' };

      if (room.status !== ChatRoomStatuses.OPEN) return { status: 'READ_ONLY' };

      // Chat chỉ ghi thêm — trigger chặn mọi UPDATE — nên ảnh phải đính trong
      // CÙNG lần ghi này, và `media_count` phải đúng ngay lúc INSERT vì ràng
      // buộc "có chữ HOẶC có ảnh" đọc chính cột đó.
      const mediaKeys = (params.mediaKeys ?? []).slice(
        0,
        MaxContentMediaPerItem,
      );

      await manager.query(
        `
          INSERT INTO chat_messages
            (global_id, room_id, sender_id, body, media_count)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          params.globalId,
          params.roomId,
          params.senderId,
          params.body,
          mediaKeys.length,
        ],
      );

      for (const [index, storageKey] of mediaKeys.entries())
        await manager.query(
          `
            INSERT INTO chat_message_media
              (message_id, room_id, slot, storage_key)
            VALUES ($1, $2, $3, $4)
          `,
          [params.globalId, params.roomId, index + 1, storageKey],
        );

      // Cờ kiểm duyệt trong CÙNG transaction với tin nhắn. Ghi ở lượt riêng sau
      // đó là mở một cửa: lượt thứ hai thất bại thì tin nhắn đã vào nhưng cờ mất,
      // và không ai biết mình vừa mất một tín hiệu.
      //
      // Chat GẮN CỜ, không chặn (chốt Bên A): tin vẫn tới nơi, Admin xem sau. Một
      // dương tính giả ở đây làm đứng cả cuộc bàn giao — "đặt cọc" trong câu "mình
      // không cần đặt cọc gì đâu" là ví dụ.
      if (params.flag)
        await manager.query(
          `
            INSERT INTO chat_message_flags
              (global_id, message_id, room_id, sender_id, severity, matched_terms)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            randomUUID(),
            params.globalId,
            params.roomId,
            params.senderId,
            params.flag.severity,
            params.flag.matchedTerms,
          ],
        );

      // `last_message_at` lấy đúng mốc của tin vừa ghi, không phải `now()` gọi
      // lần hai — hai giá trị lệch nhau vài micro giây là đủ để phép lọc "tin
      // sau mốc đã đọc" chạy sai ở biên.
      const [inserted] = await manager.query<{ created_at: Date }[]>(
        `SELECT created_at FROM chat_messages WHERE global_id = $1`,
        [params.globalId],
      );

      await manager.query(
        `
          UPDATE chat_rooms
          SET last_message_at = $2, updated_at = now()
          WHERE global_id = $1
        `,
        [params.roomId, inserted.created_at],
      );

      const message = await manager.findOne(ChatMessageEntity, {
        where: { globalId: params.globalId },
      });
      const updatedRoom = await manager.findOne(ChatRoomEntity, {
        where: { globalId: params.roomId },
      });

      if (!message || !updatedRoom) return { status: 'ROOM_NOT_FOUND' };

      return {
        status: 'APPENDED',
        message,
        room: updatedRoom,
        counterpartId:
          room.giver_id === params.senderId ? room.receiver_id : room.giver_id,
        // Bên NHẬN tin đã tắt thông báo phòng này chưa. Trả về đây thay vì bắt
        // use case hỏi thêm một vòng: dòng phòng vừa được khoá và đọc xong rồi.
        counterpartMuted:
          room.giver_id === params.senderId
            ? room.receiver_muted_at !== null
            : room.giver_muted_at !== null,
      };
    });
  }

  public async removeMessageByAdmin(params: { messageId: string }): Promise<{
    status: 'REMOVED' | 'NOT_FOUND';
    roomId: string;
    senderId: string;
    mediaKeys: string[];
  }> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<
        { room_id: string; sender_id: string; recalled_at: Date | null }[]
      >(
        `SELECT room_id, sender_id, recalled_at
         FROM chat_messages WHERE global_id = $1`,
        [params.messageId],
      );

      // Đã gỡ rồi cũng trả NOT_FOUND: với Admin thì "không còn gì để gỡ" và
      // "không tồn tại" dẫn tới cùng một việc phải làm, tức không việc gì.
      if (!current || current.recalled_at)
        return {
          status: 'NOT_FOUND' as const,
          roomId: '',
          senderId: '',
          mediaKeys: [],
        };

      const media = await manager.query<{ storage_key: string }[]>(
        `SELECT storage_key FROM chat_message_media WHERE message_id = $1`,
        [params.messageId],
      );

      // Cùng cờ phiên mà `recallMessage` khai. Trigger append-only từ chối mọi
      // UPDATE khác, kể cả từ đường này — nên hình dạng bản ghi phải khớp đúng
      // những gì trigger cho phép.
      await manager.query(`SET LOCAL chantam.chat_recall = 'on'`);

      await updateReturning(
        manager,
        `UPDATE chat_messages
         SET body = '', media_count = 0, recalled_at = now()
         WHERE global_id = $1 AND recalled_at IS NULL
         RETURNING recalled_at`,
        [params.messageId],
      );

      await manager.query(
        `DELETE FROM chat_message_media WHERE message_id = $1`,
        [params.messageId],
      );

      return {
        status: 'REMOVED' as const,
        roomId: current.room_id,
        senderId: current.sender_id,
        mediaKeys: media.map((row) => row.storage_key),
      };
    });
  }

  public async recallMessage(params: {
    roomId: string;
    messageId: string;
    senderId: string;
    windowMinutes: number;
  }): Promise<{
    status: 'RECALLED' | 'NOT_FOUND' | 'WINDOW_CLOSED';
    mediaKeys: string[];
    sentAt: Date;
    recalledAt: Date;
  }> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<
        { created_at: Date; recalled_at: Date | null }[]
      >(
        `SELECT created_at, recalled_at
         FROM chat_messages
         WHERE global_id = $1 AND room_id = $2 AND sender_id = $3`,
        [params.messageId, params.roomId, params.senderId],
      );

      // Không phải tin của mình, không có trong phòng này, hoặc đã thu hồi rồi
      // — cả ba trả về cùng một câu. Phân biệt là cho người ta dò được ai đã
      // nhắn gì trong phòng nào.
      if (!current || current.recalled_at)
        return {
          status: 'NOT_FOUND' as const,
          mediaKeys: [],
          sentAt: new Date(),
          recalledAt: new Date(),
        };

      const ageMinutes =
        (Date.now() - new Date(current.created_at).getTime()) / 60_000;
      if (ageMinutes > params.windowMinutes)
        return {
          status: 'WINDOW_CLOSED' as const,
          mediaKeys: [],
          sentAt: current.created_at,
          recalledAt: new Date(),
        };

      const media = await manager.query<{ storage_key: string }[]>(
        `SELECT storage_key FROM chat_message_media WHERE message_id = $1`,
        [params.messageId],
      );

      // Cờ phiên, y như cách job dọn phải khai `chantam.chat_purge`. Trigger
      // append-only từ chối mọi UPDATE khác, kể cả từ chính đường này.
      await manager.query(`SET LOCAL chantam.chat_recall = 'on'`);

      const [updated] = await updateReturning<{ recalled_at: Date }>(
        manager,
        `UPDATE chat_messages
         SET body = '', media_count = 0, recalled_at = now()
         WHERE global_id = $1 AND recalled_at IS NULL
         RETURNING recalled_at`,
        [params.messageId],
      );

      // Xoá bản ghi ảnh; object trên storage do nơi gọi dọn sau khi commit.
      await manager.query(
        `DELETE FROM chat_message_media WHERE message_id = $1`,
        [params.messageId],
      );

      return {
        status: 'RECALLED' as const,
        mediaKeys: media.map((row) => row.storage_key),
        sentAt: current.created_at,
        recalledAt: updated?.recalled_at ?? new Date(),
      };
    });
  }

  public async findRoomForModeration(roomId: string): Promise<{
    roomId: string;
    postId: string;
    giverId: string;
    receiverId: string;
  } | null> {
    const [row] = await this.manager.query<
      {
        global_id: string;
        post_id: string;
        giver_id: string;
        receiver_id: string;
      }[]
    >(
      `
        SELECT room.global_id, room.post_id, room.giver_id, room.receiver_id
        FROM chat_rooms room
        WHERE room.global_id = $1
          -- Điều kiện MỞ CỬA: phải có một báo xấu đang mở trỏ vào phòng này.
          -- Không có nó thì không có lý do nào để đọc chỗ riêng tư của hai người.
          AND EXISTS (
            SELECT 1 FROM reports open_report
            WHERE open_report.status IN ('PENDING', 'IN_REVIEW')
              AND (
                -- Báo xấu một NGƯỜI chỉ mở phòng mà CẢ HAI cùng có mặt: người
                -- bị báo và chính người báo. Chỉ cần người bị báo có mặt là
                -- một báo xấu duy nhất mở toang mọi cuộc trò chuyện của họ với
                -- người khác — cùng lối nghĩ với điều kiện giữ lượt trao đang
                -- tranh chấp ở completeDueDeliveries.
                (open_report.target_type = 'USER'
                 AND open_report.target_id IN (room.giver_id, room.receiver_id)
                 AND open_report.reporter_user_id
                       IN (room.giver_id, room.receiver_id))
                OR (open_report.target_type = 'POST'
                    AND open_report.target_id = room.post_id)
                OR (open_report.target_type = 'CHAT_MESSAGE'
                    AND open_report.target_id IN (
                      SELECT message.global_id FROM chat_messages message
                      WHERE message.room_id = room.global_id
                    ))
              )
          )
      `,
      [roomId],
    );

    if (!row) return null;

    return {
      roomId: row.global_id,
      postId: row.post_id,
      giverId: row.giver_id,
      receiverId: row.receiver_id,
    };
  }

  public async listMessagesForModeration(
    roomId: string,
    limit: number,
  ): Promise<
    {
      messageId: string;
      senderId: string;
      senderUsername: string;
      body: string;
      mediaKeys: string[];
      recalledAt: Date | null;
      sentAt: Date;
    }[]
  > {
    const rows = await this.manager.query<
      {
        global_id: string;
        sender_id: string;
        username: string;
        body: string;
        media_keys: string[] | null;
        recalled_at: Date | null;
        created_at: Date;
      }[]
    >(
      `
        SELECT m.global_id, m.sender_id, sender.username, m.body,
               (SELECT array_agg(media.storage_key ORDER BY media.slot)
                FROM chat_message_media media
                WHERE media.message_id = m.global_id) AS media_keys,
               m.recalled_at, m.created_at
        FROM chat_messages m
        INNER JOIN users sender ON sender.global_id = m.sender_id
        WHERE m.room_id = $1
        -- Cũ nhất trước: Admin đọc để hiểu chuyện đã diễn ra thế nào, và một
        -- cuộc trao đổi phải đọc từ trên xuống.
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT $2
      `,
      [roomId, limit],
    );

    return rows.map((row) => ({
      messageId: row.global_id,
      senderId: row.sender_id,
      senderUsername: row.username,
      body: row.body,
      mediaKeys: row.media_keys ?? [],
      recalledAt: row.recalled_at,
      sentAt: row.created_at,
    }));
  }

  public async listMessages(params: {
    roomId: string;
    limit: number;
    before?: IChatCursor | null;
    after?: IChatCursor | null;
  }): Promise<{
    items: IChatMessageListItem[];
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
  }> {
    // Hỏi thừa MỘT dòng để biết còn tin nữa hay không. Cách này rẻ hơn hẳn một
    // câu `COUNT(*)` riêng, vốn quét cả bảng mỗi lần cuộn.
    const probe = params.limit + 1;

    // `after` đọc XUÔI chiều thời gian rồi đảo lại sau: lấy 30 tin mới hơn một
    // mốc mà sắp DESC sẽ ra 30 tin MỚI NHẤT của phòng, bỏ qua đúng khoảng giữa
    // mà người gọi đang cần.
    const forward = !!params.after && !params.before;
    const anchor = forward ? params.after : params.before;

    // Row-value comparison: Postgres so sánh cả cặp theo thứ tự từ điển, nên
    // `(created_at, id) < ($2, $3)` vẫn đi được index (room_id, created_at DESC,
    // id DESC). Tách thành `created_at < $2 OR (created_at = $2 AND id < $3)` cho
    // cùng kết quả nhưng planner hay bỏ index.
    const predicate = anchor
      ? `AND (m.created_at, m.id) ${forward ? '>' : '<'} ($2::timestamptz, $3::bigint)`
      : '';
    const direction = forward ? 'ASC' : 'DESC';

    const parameters: unknown[] = anchor
      ? [params.roomId, anchor.createdAt, anchor.id, probe]
      : [params.roomId, probe];
    const limitPlaceholder = anchor ? '$4' : '$2';

    const rows = await this.manager.query<Record<string, unknown>[]>(
      `
        SELECT m.id, m.global_id, m.room_id, m.sender_id, m.body, m.created_at,
               m.media_count,
               sender.username AS sender_username,
               -- Gom ảnh ngay trong câu này: một truy vấn phụ cho mỗi tin là 30
               -- lần đi database mỗi lần cuộn. Nằm ở SELECT list nên không đụng
               -- tới kế hoạch quét index của mệnh đề WHERE.
               (SELECT array_agg(media.storage_key ORDER BY media.slot)
                FROM chat_message_media media
                WHERE media.message_id = m.global_id) AS media_keys
        FROM chat_messages m
        JOIN users sender ON sender.global_id = m.sender_id
        WHERE m.room_id = $1
        ${predicate}
        -- Cột id phá thế hoà khi hai tin cùng mốc thời gian, nếu không cửa sổ
        -- sau có thể lặp hoặc bỏ sót dòng.
        ORDER BY m.created_at ${direction}, m.id ${direction}
        LIMIT ${limitPlaceholder}
      `,
      parameters,
    );

    const hasExtra = rows.length > params.limit;
    const page = hasExtra ? rows.slice(0, params.limit) : rows;
    // Luôn trả về mới-nhất-trước, bất kể đọc theo chiều nào: giao diện chat chỉ
    // biết một thứ tự, và để nó tự đảo tuỳ tham số là mời gọi lỗi hiển thị.
    const ordered = forward ? [...page].reverse() : page;

    return {
      items: ordered.map((row) => ({
        message: {
          id: Number(row.id),
          globalId: String(row.global_id),
          roomId: String(row.room_id),
          senderId: String(row.sender_id),
          body: String(row.body),
          mediaCount: Number(row.media_count ?? 0),
          createdAt: row.created_at as Date,
        } as IChatMessageEntity,
        senderUsername: String(row.sender_username),
        // `array_agg` trả NULL khi không có dòng nào, không phải mảng rỗng.
        mediaKeys: (row.media_keys as string[] | null) ?? [],
      })),
      // Đọc xuôi thì dòng thừa nằm ở phía MỚI hơn; đọc ngược thì ở phía cũ hơn.
      hasMoreBefore: forward ? true : hasExtra,
      // Cửa sổ mới nhất (không con trỏ) theo định nghĩa là đã chạm đáy phía mới.
      hasMoreAfter: forward ? hasExtra : !!params.before,
    };
  }

  public async markRead(
    roomId: string,
    userId: string,
  ): Promise<{ readAt: Date; unreadCount: number } | null> {
    // Một câu duy nhất đặt đúng cột theo vai, và mệnh đề WHERE cũng là phép
    // kiểm quyền: không phải người trong phòng thì không khớp dòng nào.
    const rows = await updateReturning<{
      giver_read_at: Date | null;
      receiver_read_at: Date | null;
      is_giver: boolean;
    }>(
      this.manager,
      `
        UPDATE chat_rooms
        SET giver_read_at = CASE WHEN giver_id = $2 THEN now() ELSE giver_read_at END,
            receiver_read_at = CASE WHEN receiver_id = $2 THEN now() ELSE receiver_read_at END,
            updated_at = now()
        WHERE global_id = $1 AND (giver_id = $2 OR receiver_id = $2)
        RETURNING giver_read_at, receiver_read_at, (giver_id = $2) AS is_giver
      `,
      [roomId, userId],
    );

    if (rows.length === 0) return null;

    const [row] = rows;
    const readAt = row.is_giver ? row.giver_read_at : row.receiver_read_at;
    if (!readAt) return null;

    const described = await this.describeRoom(roomId, userId);
    return { readAt, unreadCount: described?.unreadCount ?? 0 };
  }
}
