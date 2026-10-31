/**
 * Vòng đời phòng chat, gắn 1-1 với một giao dịch (F37, F38).
 *
 * ```
 * OPEN ──giao dịch COMPLETED / CANCELLED / REJECTED──▶ READ_ONLY
 * ```
 *
 * `READ_ONLY` **không xoá gì**: hai bên vẫn đọc lại được địa chỉ và giờ hẹn đã
 * trao đổi, và lịch sử là bằng chứng khi có tranh chấp hoặc report.
 *
 * Phòng không tự đổi trạng thái — nó phản ánh vòng đời giao dịch, và chat
 * tuyệt đối không được tự tạo hay tự sửa trạng thái giao dịch.
 */
export enum ChatRoomStatuses {
  OPEN = 'OPEN',
  READ_ONLY = 'READ_ONLY',
}

/**
 * Thu hồi được tin trong bao lâu.
 *
 * Năm phút đủ cho trường hợp thật sự cần: dán nhầm số điện thoại hay địa chỉ
 * vào phòng khác, nhận ra ngay. Dài hơn thì thu hồi thành công cụ viết lại cuộc
 * trao đổi sau khi bên kia đã đọc và đã hành động theo nó — mà chính lịch sử đó
 * là bằng chứng khi có tranh chấp.
 */
export const ChatRecallWindowMinutes = 5;

/**
 * Ba loại phòng chat độc lập (PR #46 §7, chat trực tiếp 30/10).
 *
 * - `TRANSACTION`: mở khi một lượt trao được duyệt; có `transactionId`.
 * - `DIRECT_POST`: người mua liên hệ người bán về một bài Rao vặt; KHÔNG có giao dịch.
 * - `DIRECT_USER`: hai người nhắn thẳng cho nhau, mở từ danh sách online hoặc hồ sơ; KHÔNG
 *   có giao dịch, KHÔNG có bài. Mỗi cặp người đúng một phòng, bất kể ai mở trước.
 */
export enum ChatRoomTypes {
  TRANSACTION = 'TRANSACTION',
  DIRECT_POST = 'DIRECT_POST',
  DIRECT_USER = 'DIRECT_USER',
}
