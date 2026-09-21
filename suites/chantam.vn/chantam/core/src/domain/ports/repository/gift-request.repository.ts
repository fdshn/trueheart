import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IPostRequestItemDto } from '@chantam.vn/chantam.core-lib/dto';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IGiftRequestRepository extends Repository<IGiftRequestEntity> {
  findByPostAndRequester(
    postId: string,
    requesterId: string,
  ): Promise<IGiftRequestEntity | null>;

  countActiveByPostIds(postIds: string[]): Promise<Map<string, number>>;

  findStatusesByPostIdsAndRequester(
    postIds: string[],
    requesterId: string,
  ): Promise<Map<string, GiftRequestStatuses>>;

  /**
   * Danh sách người xin của một bài, CÓ phân trang.
   *
   * Bài lan truyền có thể nhận hàng nghìn lượt xin; trả hết về một response là
   * kéo sập cả client lẫn connection pool.
   */
  listByPostId(
    postId: string,
    skip: number,
    take: number,
  ): Promise<{ items: IPostRequestItemDto[]; total: number }>;

  acceptRequest(params: {
    requestId: string;
    postId: string;
    giverId: string;
    transactionId: string;
  }): Promise<{ transactionId: string }>;

  /**
   * Rút yêu cầu bằng MỘT câu lệnh có điều kiện.
   *
   * Đọc rồi ghi sẽ đè mất một lượt duyệt vừa commit xen vào giữa: người dùng
   * rút, người tặng duyệt, rồi câu ghi của bên rút đáp xuống và biến yêu cầu
   * đã ACCEPTED thành WITHDRAWN — trong khi tồn kho đã trừ và giao dịch đã
   * tạo. Trả về bản ghi sau khi rút, hoặc `null` nếu nó không còn PENDING.
   */
  withdrawIfPending(
    postId: string,
    requesterId: string,
  ): Promise<IGiftRequestEntity | null>;
}

export const IGiftRequestRepository = Symbol('IGiftRequestRepository');
