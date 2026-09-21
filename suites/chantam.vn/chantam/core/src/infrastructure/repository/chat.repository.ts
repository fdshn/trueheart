import {
  AppendChatMessageOutcome,
  IAppendChatMessageParams,
  IChatMessageListItem,
  IChatRepository,
  IChatRoomListItem,
  IOpenChatRoomParams,
} from '@/domain/ports/repository';
import { ChatMessageEntity, ChatRoomEntity } from '@/infrastructure/entity';
import { ChatRoomStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IChatMessageEntity,
  IChatRoomEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
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
    // Có điều kiện `status = 'OPEN'`: khoá hai lần không được dịch `locked_at`
    // về mốc muộn hơn, vì đó là mốc giao dịch kết thúc.
    await manager.query(
      `
        UPDATE chat_rooms
        SET status = $2, locked_at = now(), updated_at = now()
        WHERE transaction_id = $1 AND status = $3
      `,
      [transactionId, ChatRoomStatuses.READ_ONLY, ChatRoomStatuses.OPEN],
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
      `${this.roomListQuery('room.giver_id = $2 OR room.receiver_id = $2')}
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

  public async appendMessage(
    params: IAppendChatMessageParams,
  ): Promise<AppendChatMessageOutcome> {
    return this.manager.transaction(async (manager) => {
      // Khoá hàng phòng rồi mới kiểm: đọc trạng thái trước rồi ghi sau sẽ cho
      // một tin lọt vào phòng vừa bị khoá ở giữa hai bước.
      const [room] = await manager.query<
        { status: string; giver_id: string; receiver_id: string }[]
      >(
        `
          SELECT status, giver_id, receiver_id
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

      await manager.query(
        `
          INSERT INTO chat_messages (global_id, room_id, sender_id, body)
          VALUES ($1, $2, $3, $4)
        `,
        [params.globalId, params.roomId, params.senderId, params.body],
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
      };
    });
  }

  public async listMessages(params: {
    roomId: string;
    skip: number;
    take: number;
  }): Promise<{ items: IChatMessageListItem[]; total: number }> {
    const rows = await this.manager.query<Record<string, unknown>[]>(
      `
        SELECT m.id, m.global_id, m.room_id, m.sender_id, m.body, m.created_at,
               sender.username AS sender_username
        FROM chat_messages m
        JOIN users sender ON sender.global_id = m.sender_id
        WHERE m.room_id = $1
        -- Cột id phá thế hoà khi hai tin cùng mốc thời gian, nếu không trang 2
        -- có thể lặp hoặc bỏ sót dòng.
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $2 OFFSET $3
      `,
      [params.roomId, params.take, params.skip],
    );

    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM chat_messages WHERE room_id = $1`,
      [params.roomId],
    );

    return {
      items: rows.map((row) => ({
        message: {
          id: Number(row.id),
          globalId: String(row.global_id),
          roomId: String(row.room_id),
          senderId: String(row.sender_id),
          body: String(row.body),
          createdAt: row.created_at as Date,
        } as IChatMessageEntity,
        senderUsername: String(row.sender_username),
      })),
      total: Number(total),
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
