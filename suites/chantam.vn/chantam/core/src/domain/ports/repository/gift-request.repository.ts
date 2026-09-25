import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IPostRequestItemDto } from '@chantam.vn/chantam.core-lib/dto';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ICandidateMetrics } from '@chantam.vn/chantam.core-lib/models';
import { Repository } from 'typeorm';

/**
 * Số đo của ứng viên, kèm khoá của chính bản ghi yêu cầu.
 *
 * `ICandidateMetrics` là hình dạng của hàm xếp thuần ở `core-lib` và cố ý không
 * biết gì về khoá database. Nhưng chỗ gọi cần `global_id` để duyệt đúng yêu cầu
 * đó — `requesterId` là id NGƯỜI, không phải id yêu cầu.
 */
export interface ICandidateMetricsWithId extends ICandidateMetrics {
  readonly requestGlobalId: string;
}

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

  /**
   * Bài đã hết đồng hồ chọn người nhận mà chưa chốt ai (F75).
   *
   * Chỉ lấy bài còn `PUBLISHED` và còn ứng viên đang chờ: bài đã có chủ thì
   * `selection_deadline` đã được xoá lúc duyệt, nhưng một bài hết hạn đăng hoặc
   * bị gỡ vẫn có thể còn mốc cũ.
   */
  findPostsDueForSelection(
    limit: number,
  ): Promise<{ postId: string; giverId: string }[]>;

  /**
   * Số đo của mọi ứng viên đang chờ trên một bài, đủ để xếp theo MỌI tiêu chí.
   *
   * Lấy hết trong MỘT truy vấn rồi giao cho hàm thuần `rankCandidates` xếp: chính
   * sách công bằng là thứ Bên A sẽ còn đổi nhiều lần, và nó phải kiểm được bằng
   * bảng đầu vào/đầu ra chứ không phải bằng cách dựng database.
   */
  listCandidateMetrics(postId: string): Promise<ICandidateMetricsWithId[]>;

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
