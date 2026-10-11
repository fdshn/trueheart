import { GiftRequestStatuses, PostTypes } from '../consts';

export interface IGiftRequest {
  postId: string;
  requesterId: string;
  message: string;
  status: GiftRequestStatuses;
  queueJoinedAt: Date;
  withdrawnAt: Date | null;
  /**
   * Bài Muốn Tặng mà người gửi mang ra, khi lời tặng đi qua
   * `POST /posts/{id}/offer-gift`.
   *
   * `null` ở mọi yêu cầu xin nhận bình thường, và cũng `null` sau khi người tặng
   * xoá bài đó — xem `ON DELETE SET NULL` ở migration `1797000000000`.
   */
  offeringPostId: string | null;
}

/**
 * Trần số yêu cầu duyệt được trong MỘT lô (`POST /posts/{postId}/batch-accept`).
 *
 * Mỗi yêu cầu trong lô mở một phòng chat, nên lô càng dài thì transaction càng
 * giữ khoá trên `posts` và `gift_requests` của bài đó càng lâu. 50 là trần có
 * thật chứ không phải con số tròn: `total_quantity` lớn nhất quan sát được ở
 * nghiệp vụ là những bài phát quà số lượng lớn, và chia thành vài lô 50 thì mỗi
 * lô vẫn nguyên tử — còn một lô 500 thì chặn mọi người xin nhận khác trên bài đó
 * suốt thời gian chạy.
 */
export const MaxBatchAcceptRequests = 50;

/**
 * Ai CHO và ai NHẬN trong một lượt trao, suy từ LOẠI bài.
 *
 * ## Vì sao phải có một hàm cho ba dòng điều kiện
 *
 * Tới 11/10 hai vai này được đóng cứng ở **bốn** chỗ, mỗi chỗ một bản sao của
 * cùng một giả định "tác giả bài là người cho":
 *
 * - `acceptRequest` chèn `giver_id` từ tham số và `receiver_id` từ `requester_id`;
 * - `acceptRequestsBatch` làm y hệt;
 * - truy vấn bài tới hạn của auto-select lấy `SELECT post.author_id AS giver_id`;
 * - `AcceptedRequestNotifier` được gọi với `giverId` do nơi gọi tự đoán.
 *
 * Với bài Muốn Tặng (`OFFER`) giả định đó đúng. Với bài **Muốn Nhận** (`WANTED`) nó
 * **ngược hẳn**: tác giả là người muốn nhận, còn người phản hồi mới là người cho —
 * một lời tặng cho bài `WANTED` chính là một hàng `gift_requests` mà `requester_id`
 * là người sẽ đưa món đồ.
 *
 * Nên bật chế độ chọn cho `WANTED` mà không sửa bốn chỗ đó là để hệ thống dựng giao
 * dịch với hai vai lộn nhau. Hậu quả không nằm ở một bảng: `gift_transactions` sai
 * thì điểm hoàn tất trả cho người nhận đồ, bộ đếm hoạt động của rank tính cho sai
 * người, `GET /transactions` hiện sai vai, và phòng chat mở với nhãn sai.
 *
 * Một hàm thuần ở đây là chỗ duy nhất biết luật này, và nó có phép kiểm riêng.
 */
export function giftTransactionRoles(input: {
  postType: PostTypes;
  postAuthorId: string;
  requesterId: string;
}): { giverId: string; receiverId: string } {
  return input.postType === PostTypes.WANTED
    ? { giverId: input.requesterId, receiverId: input.postAuthorId }
    : { giverId: input.postAuthorId, receiverId: input.requesterId };
}
