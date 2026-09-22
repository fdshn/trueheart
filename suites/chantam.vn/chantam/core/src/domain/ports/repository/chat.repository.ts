import {
  IChatMessageEntity,
  IChatRoomEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { IChatCursor } from '@chantam.vn/chantam.core-lib/models';
import { EntityManager } from 'typeorm';

export interface IOpenChatRoomParams {
  globalId: string;
  transactionId: string;
  postId: string;
  giverId: string;
  receiverId: string;
}

export interface IChatRoomListItem {
  room: IChatRoomEntity;
  postTitle: string;
  counterpartUsername: string;
  counterpartFullName: string | null;
  lastMessageBody: string | null;
  unreadCount: number;
}

export interface IChatMessageListItem {
  message: IChatMessageEntity;
  senderUsername: string;
}

export interface IAppendChatMessageParams {
  globalId: string;
  roomId: string;
  senderId: string;
  body: string;
}

export type AppendChatMessageOutcome =
  | {
      status: 'APPENDED';
      message: IChatMessageEntity;
      room: IChatRoomEntity;
      /** Người còn lại — nơi gọi cần để gửi thông báo, không phải để phân quyền. */
      counterpartId: string;
    }
  | { status: 'ROOM_NOT_FOUND' }
  | { status: 'READ_ONLY' };

export interface IChatRepository {
  /**
   * Mở phòng chat **trong cùng transaction** với lượt duyệt (F34).
   *
   * Nhận `manager` chứ không tự mở transaction: duyệt xong mà chat chưa mở thì
   * hai bên không có đường liên lạc để hẹn trao đồ, nên hai việc phải sống
   * chết cùng nhau.
   *
   * Idempotent theo `transaction_id` (UNIQUE ở database): gọi lại trên một lượt
   * đã có phòng thì trả về phòng cũ, không ném lỗi.
   */
  openRoomWithinTransaction(
    manager: EntityManager,
    params: IOpenChatRoomParams,
  ): Promise<IChatRoomEntity>;

  /**
   * Khoá phòng thành chỉ đọc khi giao dịch kết thúc (F38), trong cùng
   * transaction với việc đổi trạng thái giao dịch.
   *
   * Không xoá gì: lịch sử là bằng chứng khi có tranh chấp hoặc report.
   */
  lockRoomWithinTransaction(
    manager: EntityManager,
    transactionId: string,
  ): Promise<void>;

  /**
   * Phòng mà `userId` là một trong hai bên. Trả `null` cho cả "không tồn tại"
   * và "không phải người trong phòng" — phân biệt hai cái là để lộ ai đang trao
   * đổi với ai.
   */
  findRoomForParticipant(
    roomId: string,
    userId: string,
  ): Promise<IChatRoomEntity | null>;

  listRoomsForUser(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ items: IChatRoomListItem[]; total: number }>;

  /**
   * Ghi một tin nhắn.
   *
   * Kiểm quyền và kiểm trạng thái phòng NGAY TRONG transaction ghi: đọc trạng
   * thái trước rồi ghi sau sẽ cho một tin lọt vào phòng vừa bị khoá ở giữa hai
   * bước.
   */
  appendMessage(
    params: IAppendChatMessageParams,
  ): Promise<AppendChatMessageOutcome>;

  /**
   * Mot cua so tin nhan theo KHOA SAP XEP, khong phai theo OFFSET.
   *
   * `before`/`after` la cap `(createdAt, id)` cua mot tin co that. Postgres so
   * sanh ca cap bang row-value `(created_at, id) < ($2, $3)` nen van di duoc
   * index `IDX_chat_messages_room_created` — khong quet qua cac tin bi bo.
   *
   * Khong tra `total`: dem toan bo tin cua mot phong la mot `COUNT(*)` quet ca
   * bang moi lan cuon, va khong giao dien nao dung den con so do. Thay vao do
   * tra `hasMore*`, lay duoc bang cach hoi du MOT dong.
   */
  listMessages(params: {
    roomId: string;
    limit: number;
    before?: IChatCursor | null;
    after?: IChatCursor | null;
  }): Promise<{
    items: IChatMessageListItem[];
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
  }>;

  /** Đánh dấu đã đọc tới thời điểm hiện tại, trả về số còn lại chưa đọc. */
  markRead(
    roomId: string,
    userId: string,
  ): Promise<{ readAt: Date; unreadCount: number } | null>;

  /**
   * Xoá tin nhắn của những phòng đã quá hạn lưu trữ (F38).
   *
   * **Xoá tin nhắn, GIỮ phòng.** Xoá cả phòng thì mở lại lượt trao cũ ra `404`,
   * trông y như lỗi. Giữ phòng kèm `purged_at` và số tin đã xoá thì giao diện nói
   * được "tin nhắn đã xoá theo chính sách lưu trữ".
   *
   * Phòng có `purge_after IS NULL` **không bao giờ bị xoá** — đó là cách Admin giữ
   * lại chứng cứ một vụ tranh chấp.
   *
   * Gọi từ scheduler NGOÀI tiến trình, giống `post:expire` và `rank:evaluate`;
   * repo cấm `@nestjs/schedule` vì nhiều replica sẽ chạy trùng.
   */
  purgeExpiredRooms(limit: number): Promise<{
    purgedRooms: number;
    purgedMessages: number;
  }>;
  /**
   * Hạn xoá đã chốt cho phòng của một lượt trao.
   *
   * Đọc SAU khi transaction khoá phòng đã commit, để gửi thông báo. Gửi thông báo
   * bên trong transaction là báo cho người dùng về một việc còn có thể bị rollback.
   */
  findPurgeSchedule(transactionId: string): Promise<{
    roomId: string;
    purgeAfter: Date;
  } | null>;
  /** Chi tiết một phòng để dựng phần đầu màn hội thoại. */
  describeRoom(
    roomId: string,
    userId: string,
  ): Promise<IChatRoomListItem | null>;
}

export const IChatRepository = Symbol('IChatRepository');
