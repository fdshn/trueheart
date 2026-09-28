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
