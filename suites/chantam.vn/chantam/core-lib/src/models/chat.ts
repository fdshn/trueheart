import { ChatRoomStatuses } from '../consts';

/**
 * Phòng chat của một giao dịch (F37).
 *
 * Mốc đã đọc là **hai cột** chứ không phải bảng phụ: chat là 1-1 theo đặc tả,
 * đúng hai người, nên một bảng participants chỉ thêm join.
 */
export interface IChatRoom {
  globalId: string;
  transactionId: string;
  postId: string;
  giverId: string;
  receiverId: string;
  status: ChatRoomStatuses;
  /** Mốc tin nhắn gần nhất, để xếp danh sách hội thoại. `null` khi chưa ai nói. */
  lastMessageAt: Date | null;
  giverReadAt: Date | null;
  receiverReadAt: Date | null;
  lockedAt: Date | null;
}

/**
 * Một tin nhắn. **Chỉ ghi thêm** — không có mốc sửa, không có xoá mềm; trigger
 * ở database chặn UPDATE và DELETE.
 */
export interface IChatMessage {
  globalId: string;
  roomId: string;
  senderId: string;
  body: string;
}

/** Vai của người đang gọi trong một phòng. */
export type ChatParticipantRole = 'GIVER' | 'RECEIVER';

/**
 * Hai bên của một phòng chat, luôn theo cặp.
 *
 * Trả về cặp thay vì chỉ "người kia" vì nơi gọi thường cần cả hai: một để
 * kiểm quyền, một để gửi thông báo.
 */
export function chatCounterpartOf(
  room: Pick<IChatRoom, 'giverId' | 'receiverId'>,
  userId: string,
): { role: ChatParticipantRole; counterpartId: string } | null {
  if (userId === room.giverId)
    return { role: 'GIVER', counterpartId: room.receiverId };
  if (userId === room.receiverId)
    return { role: 'RECEIVER', counterpartId: room.giverId };
  return null;
}

/**
 * Số tin chưa đọc của một người trong phòng.
 *
 * Tính từ mốc đã đọc của CHÍNH người đó, và không đếm tin do họ gửi — tin mình
 * vừa gửi hiện thành "chưa đọc" là một con số vô nghĩa trên giao diện.
 */
export function chatReadMarkOf(
  room: Pick<IChatRoom, 'giverId' | 'giverReadAt' | 'receiverReadAt'>,
  userId: string,
): Date | null {
  return userId === room.giverId ? room.giverReadAt : room.receiverReadAt;
}
