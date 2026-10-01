import { GiftRequestStatuses } from '../consts';

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
