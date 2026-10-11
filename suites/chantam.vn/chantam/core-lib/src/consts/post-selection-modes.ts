/**
 * Chế độ tìm người nhận.
 *
 * CHỐT-10 nói chế độ này áp cho **cả** `OFFER` và `WANTED`. Tới 11/10 mã vẫn chỉ
 * áp cho `OFFER`, và lý do là một chốt an toàn có đo: xem
 * `usesSelectionLifecycle`.
 *
 * - `INSTANT` — phản hồi hợp lệ đầu tiên được chốt ngay, không chờ hết hạn xét.
 * - `OPTIMAL` — tiếp nhận ứng viên tới hết hạn xét rồi mới chọn.
 *
 * ## `EXTENDED` đã bị BỎ, không phải đổi tên
 *
 * Tới 06/10 có chế độ thứ ba `EXTENDED` nghĩa "chờ 30 ngày", và người đăng tự
 * chọn nó trên form. CHỐT-10 bỏ hẳn: **giai đoạn 30 ngày vẫn còn nhưng là bước
 * TỰ ĐỘNG**, áp cho mọi bài chưa ghép được ai sau hạn xét — không còn là một ô
 * trên form.
 *
 * Nên một bài `OPTIMAL` ngày nay sống lâu hơn một bài `EXTENDED` ngày trước:
 * 7 ngày xét cộng 30 ngày mở rộng. Lựa chọn của người đăng giờ chỉ còn là
 * "chốt ngay hay chờ xét", không còn là "chờ bao lâu".
 *
 * Khác biệt quan trọng thứ hai: cả hai mốc tính từ **lúc đăng**, không từ phản
 * hồi đầu tiên. Bài không có phản hồi nào vì thế cũng có hạn — xem
 * `selectionDeadlineFrom`.
 */
export enum PostSelectionModes {
  INSTANT = 'INSTANT',
  OPTIMAL = 'OPTIMAL',
}
