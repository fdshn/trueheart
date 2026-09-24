/**
 * Loại thông báo trong app (F44).
 *
 * Là chuỗi chứ không phải số: giá trị này đi vào payload đẩy xuống thiết bị và
 * lộ ra API, nên đọc được mà không cần tra bảng.
 */
export enum NotificationTypes {
  /** Có tin nhắn mới trong phòng chat của một giao dịch. */
  NEW_CHAT_MESSAGE = 'NEW_CHAT_MESSAGE',
  /** Yêu cầu xin nhận được duyệt — chat vừa mở. */
  GIFT_REQUEST_ACCEPTED = 'GIFT_REQUEST_ACCEPTED',
  /** Giao dịch bị huỷ hoặc từ chối. */
  GIFT_TRANSACTION_CLOSED = 'GIFT_TRANSACTION_CLOSED',
  /** Người nhận đã xác nhận nhận được vật phẩm. */
  GIFT_TRANSACTION_COMPLETED = 'GIFT_TRANSACTION_COMPLETED',
  /**
   * Phòng chat vừa khoá và sẽ bị xoá vào một ngày cụ thể.
   *
   * Báo một lần lúc khoá, kèm ngày ĐÃ CHỐT — không phải "sau 1 tuần" chung
   * chung, vì Admin đổi cấu hình sau đó cũng không đổi ngày của phòng này.
   */
  CHAT_ROOM_SCHEDULED_FOR_PURGE = 'CHAT_ROOM_SCHEDULED_FOR_PURGE',
  /** Có người bình luận vào bài của mình. Báo từng cái. */
  CONTENT_COMMENT_CREATED = 'CONTENT_COMMENT_CREATED',
  /** Có người trả lời bình luận của mình. Báo từng cái. */
  CONTENT_COMMENT_REPLIED = 'CONTENT_COMMENT_REPLIED',
  /**
   * Hôm nay có người bày tỏ cảm xúc với bài của mình.
   *
   * Chỉ báo LẦN ĐẦU trong ngày cho mỗi bài. Một bài 200 lượt mà báo 200 lần
   * thì tác giả tắt thông báo, và từ đó mất luôn thông báo về lượt xin nhận —
   * thứ thật sự quan trọng.
   */
  CONTENT_REACTION_FIRST_OF_DAY = 'CONTENT_REACTION_FIRST_OF_DAY',
}
