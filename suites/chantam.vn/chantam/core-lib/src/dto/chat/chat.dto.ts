import {
  IPaginationMetaDto,
  IPaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ChatRoomStatuses } from '../../consts';

export interface IChatRoomSummaryDto {
  roomId: string;
  transactionId: string;
  postId: string;
  postTitle: string;
  status: ChatRoomStatuses;
  /** Người còn lại trong phòng — giao diện cần tên để hiển thị hội thoại. */
  counterpartUsername: string;
  counterpartFullName: string | null;
  lastMessageAt: Date | null;
  lastMessageBody: string | null;
  /**
   * Số tin chưa đọc của CHÍNH người gọi.
   *
   * Không đếm tin do họ gửi — tin mình vừa gửi hiện thành "chưa đọc" là một con
   * số vô nghĩa trên giao diện.
   */
  unreadCount: number;
  /**
   * Ngày tin nhắn của phòng này sẽ bị xoá. `null` khi phòng còn mở, hoặc khi
   * Admin đã gỡ hạn để giữ chứng cứ.
   *
   * Giao diện đọc trường này để hiện banner. Đây là ngày ĐÃ CHỐT lúc khoá phòng
   * — Admin đổi cấu hình sau đó không dịch ngày này.
   */
  purgeAfter: Date | null;
  /** Đã xoá lúc nào. Khác `null` thì lịch sử đã trống. */
  purgedAt: Date | null;
  /** Đã xoá bao nhiêu tin — để trả lời được khi có người hỏi. */
  purgedMessageCount: number | null;
}

export interface IListChatRoomsQueryDto extends IPaginationQueryDto {}

export interface IListChatRoomsResponseDto {
  rooms: IChatRoomSummaryDto[];
  meta: IPaginationMetaDto;
}

export interface IChatMessageDto {
  messageId: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  sentAt: Date;
  /** Tin do chính người gọi gửi — giao diện xếp sang phải. */
  isMine: boolean;
}

export interface IListChatMessagesParamsDto {
  roomId: string;
}

/**
 * Cua so tin nhan can lay.
 *
 * Khong dung `page`/`pageSize` nhu cac danh sach khac: xem
 * `models/chat-cursor.ts`. Tom tat: chat duoc them vao DAU, nen OFFSET troi
 * theo moi tin moi den va trang sau se lap hoac bo sot tin.
 */
export interface IListChatMessagesQueryDto {
  /** So tin toi da. Mac dinh 30, tran 50. */
  limit?: number;
  /**
   * Lay cac tin CU HON con tro nay — huong cuon len xem lich su.
   *
   * Khong truyen gi ca thi tra ve cua so MOI NHAT, tuc man hinh mo dau.
   */
  before?: string;
  /**
   * Lay cac tin MOI HON con tro nay — huong bat kip sau khi mat ket noi.
   *
   * Dung `after` thay vi tai lai tu dau: client giu con tro cuoi cung no da
   * thay, ket noi lai thi chi keo ve phan con thieu.
   */
  after?: string;
}

/**
 * Hai dau cua cua so vua tra ve, de goi tiep ma khong phai tu doc `messages`.
 *
 * Khong co `total` va khong co `totalPages`: dem toan bo tin cua mot phong la
 * mot `COUNT(*)` quet ca bang moi lan cuon, va khong giao dien nao dung den con
 * so do.
 */
export interface IChatMessageWindowDto {
  limit: number;
  /** Con tro cua tin CU NHAT trong cua so — truyen vao `before` de cuon tiep len. */
  oldestCursor: string | null;
  /** Con tro cua tin MOI NHAT trong cua so — truyen vao `after` de bat kip. */
  newestCursor: string | null;
  /** Con tin cu hon nua khong. `false` la da cham day hoi thoai. */
  hasMoreBefore: boolean;
  /** Con tin moi hon khong. */
  hasMoreAfter: boolean;
}

export interface IListChatMessagesResponseDto {
  room: IChatRoomSummaryDto;
  /** Moi nhat truoc, giong thu tu ma giao dien chat dung. */
  messages: IChatMessageDto[];
  window: IChatMessageWindowDto;
}

export interface ISendChatMessageParamsDto {
  roomId: string;
}

export interface ISendChatMessageDto {
  body: string;
}

export interface ISendChatMessageBodyDto {
  message: ISendChatMessageDto;
}

export interface ISendChatMessageResponseDto {
  message: IChatMessageDto;
}

export interface IMarkChatRoomReadParamsDto {
  roomId: string;
}

export interface IMarkChatRoomReadResponseDto {
  roomId: string;
  readAt: Date;
  unreadCount: number;
}
