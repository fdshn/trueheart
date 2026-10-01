import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
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
export interface IRedemptionContext {
  readonly requestGlobalId: string;
  readonly giverId: string;
  readonly postStatus: string;
  /** `null` khi chưa ai xin — tức đồng hồ chưa mở. */
  readonly selectionDeadline: Date | null;
  /** Giá trị tham khảo người tặng khai, `null` khi bỏ trống. */
  readonly estimatedValueVnd: number | null;
}

export interface ICandidateMetricsWithId extends ICandidateMetrics {
  readonly requestGlobalId: string;
}

/** Một dòng trong màn "Yêu cầu của tôi" — xem `listByRequester`. */
export interface IMyGiftRequestRow {
  readonly request: IGiftRequestEntity;
  readonly postTitle: string;
  readonly postStatus: GiftPostStatuses;
  /** Key ảnh đầu tiên của bài; nơi gọi ghép tên miền. */
  readonly postThumbnailKey: string | null;
}

/** Đủ để báo cho người xin biết yêu cầu của họ vừa bị đóng, và vì bài nào. */
export interface IClosedRequestRow {
  readonly requestId: string;
  readonly requesterId: string;
  readonly postId: string;
  readonly postTitle: string;
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
  /**
   * Số yêu cầu ĐANG MỞ của một người, gồm cả `STANDBY`.
   *
   * `STANDBY` vẫn là yêu cầu đang mở — người đó còn trong hàng đợi và được xét
   * tiếp nếu lượt trao hiện tại đổ (F33). Bỏ nó ra khỏi phép đếm là mở đúng cái
   * cửa mà giới hạn này sinh ra để đóng.
   */
  countOpenByRequester(requesterId: string): Promise<number>;

  /**
   * Yêu cầu của MỘT người, xem từ phía người xin.
   *
   * Không có danh sách này thì người dùng không có cách nào biết mình đang xin
   * những gì — và khi một yêu cầu treo ăn mất suất trong `OPEN_REQUEST_QUOTA`,
   * họ cũng không tìm ra nó để rút. Kèm tiêu đề và trạng thái BÀI ngay trên
   * dòng: bài đã đóng thì mở ra cũng không còn gì để xem.
   */
  listByRequester(params: {
    requesterId: string;
    /** Bỏ trống thì trả mọi trạng thái. */
    status?: GiftRequestStatuses;
    skip: number;
    take: number;
  }): Promise<{ items: IMyGiftRequestRow[]; total: number }>;

  /**
   * Đóng mọi yêu cầu còn treo của những bài vừa đóng lại.
   *
   * Trước 28/09 KHÔNG đường nào làm việc này — kể cả đường tác giả tự gỡ bài,
   * vốn chỉ đóng `gift_transactions` chứ không đụng `gift_requests`. Hậu quả
   * nặng hơn vẻ ngoài: yêu cầu treo vẫn tính vào `countOpenByRequester`, nên
   * một người xin 5 món mà cả 5 bài hết hạn sẽ đứng ở trần VĨNH VIỄN, không
   * xin được gì nữa, và không có màn hình nào để nhìn thấy vì sao.
   *
   * Trả về đủ dữ liệu để báo cho từng người xin — họ đang chờ một câu trả lời.
   */
  closeOpenForPosts(params: {
    postIds: string[];
    status: GiftRequestStatuses;
  }): Promise<IClosedRequestRow[]>;

  /**
   * Chủ bài chủ động từ chối một yêu cầu.
   *
   * `REJECTED` từng là trạng thái CHẾT: khai báo trong enum, lọc ra khỏi bộ
   * đếm, nhưng không đường nào ghi. Nghĩa là chủ bài thấy một yêu cầu rõ ràng
   * không ổn cũng không gạt ra được — và nếu hết đồng hồ mà chưa kịp chọn ai
   * khác thì auto-select có thể trao đúng cho người đó.
   *
   * Chỉ đụng `PENDING` và `STANDBY`. Từ chối một yêu cầu đã `ACCEPTED` là huỷ
   * một lượt trao đang sống — việc đó thuộc luồng `/transactions`, nơi có tồn
   * kho và phòng chat phải dọn theo.
   */
  rejectIfOpen(params: {
    postId: string;
    requestId: string;
  }): Promise<IGiftRequestEntity | null>;

  /**
   * Bối cảnh đủ để quyết một người có đổi vật phẩm bằng điểm được không (F75).
   *
   * Lấy trong MỘT truy vấn vì ba điều kiện đan vào nhau — bài còn mở, đồng hồ
   * đang chạy, và người này đã xin. Ba lượt đi database cho ra ba ảnh chụp ở ba
   * thời điểm, và giữa chúng đồng hồ có thể đã hết.
   *
   * `null` khi bài không tồn tại hoặc người này chưa xin.
   */
  findRedemptionContext(params: {
    postId: string;
    requesterId: string;
  }): Promise<IRedemptionContext | null>;

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
   * Duyệt NHIỀU yêu cầu trên cùng một bài trong MỘT transaction (F65, UC-TRANS-05).
   *
   * **Vì sao không phải một vòng lặp gọi `acceptRequest`.** Vì tính nguyên tử, và
   * điều đó chỉ thành khác biệt thấy được khi lô ĐÔNG HƠN số suất còn lại —
   * `test/srs-endpoint-gaps.check.ts` đo cả hai đường trên cùng một tình huống:
   *
   * - Vòng lặp trên bài 2 suất với 3 yêu cầu: duyệt xong 2 người và **đã
   *   commit**, rồi chết ở người thứ 3 bằng `GiftRequestNotFoundException` —
   *   vì khi suất cạn ở lượt thứ 2, `acceptRequest` đã quét mọi `PENDING` còn
   *   lại thành `STANDBY` (F33), kể cả người thứ 3 trong lô. Bài nay `RESERVED`,
   *   cạn suất, không bấm lại được. Chủ bài thấy "đã duyệt 2 trong 3 người bạn
   *   chọn" — một kết quả không ai yêu cầu và không có đường lùi.
   * - Lô trên đúng tình huống đó: từ chối trọn vẹn bằng
   *   `GiftTransactionOutOfStockException`, và để bài y nguyên để chủ bài chọn lại.
   *
   * Và điều KHÔNG đúng, ghi lại để không ai dựng lại giả định sai: khi số yêu cầu
   * BẰNG số suất, vòng lặp chạy hết bình thường. Phép quét `STANDBY` chỉ chạy lúc
   * suất về 0, và lúc đó mọi yêu cầu trong lô đã `ACCEPTED` nên không còn gì để nó
   * cướp. Giá trị của lô nằm ở tính nguyên tử, không ở chỗ đó.
   *
   * Ở đây tồn kho bị trừ MỘT lần theo đúng số lượng của lô, và phép quét
   * `STANDBY` chạy đúng một lần ở cuối.
   */
  acceptRequestsBatch(params: {
    postId: string;
    giverId: string;
    /** Không trùng nhau, và đã kiểm số lượng ở tầng ứng dụng. */
    requestIds: readonly string[];
  }): Promise<{
    accepted: {
      requestId: string;
      requesterId: string;
      transactionId: string;
    }[];
    /** Số suất còn lại sau lô. */
    remainingQuantity: number;
    /** Số yêu cầu bị đẩy sang `STANDBY` vì bài đã hết suất. */
    standbyCount: number;
  }>;

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
