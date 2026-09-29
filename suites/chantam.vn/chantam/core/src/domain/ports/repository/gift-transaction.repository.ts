import { GiftEvidenceKinds } from '@chantam.vn/chantam.core-lib/consts';
import { ICandidateMetrics } from '@chantam.vn/chantam.core-lib/models';
import { EntityManager } from 'typeorm';

/**
 * Bốn trạng thái còn sống.
 *
 * Lượt trao bắt đầu ở `ACCEPTED`: duyệt một yêu cầu chèn thẳng trạng thái đó.
 * `REQUESTED` và `REJECTED` đã dọn 28/09 — xem migration
 * `DropDeadTransactionStatuses`.
 */
export type GiftTransactionStatuses =
  'ACCEPTED' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';

/**
 * Những trạng thái ĐANG GIỮ TỒN KHO của bài đăng.
 *
 * Cùng một tập với điều kiện trả kho trong `close()`, và phải luôn như vậy.
 */
export const StockHoldingGiftTransactionStatuses: GiftTransactionStatuses[] = [
  'ACCEPTED',
  'DELIVERING',
];

export interface IGiftTransactionSummary {
  readonly globalId: string;
  readonly postId: string;
  readonly giverId: string;
  readonly receiverId: string;
  readonly quantity: number;
  readonly status: GiftTransactionStatuses;
  readonly requestedAt: Date;
  readonly acceptedAt: Date | null;
  /** Mốc người tặng báo đã trao đồ — gửi đi, hoặc trao tận tay. */
  readonly handedOverAt: Date | null;
  readonly completedAt: Date | null;
}

export interface IGiftEvidenceRef {
  readonly kind: GiftEvidenceKinds;
  readonly slot: number;
  readonly storageKey: string;
  readonly uploadedBy: string;
  readonly createdAt: Date;
}

export interface IAttachGiftEvidenceParams {
  readonly transactionId: string;
  readonly kind: GiftEvidenceKinds;
  readonly uploadedBy: string;
  readonly storageKeys: readonly string[];
}

export interface IRequestGiftParams {
  readonly globalId: string;
  readonly postId: string;
  readonly receiverId: string;
  readonly quantity: number;
}

export interface ICloseGiftTransactionParams {
  readonly transactionId: string;
  readonly actorUserId: string;
  readonly status: Extract<GiftTransactionStatuses, 'CANCELLED'>;
  readonly reason: string;
  /**
   * Ai bị tính lượt huỷ này. Mặc định là chính người bấm.
   *
   * Tách ra vì có một trường hợp hai thứ này khác nhau: người tặng báo hàng bị
   * hoàn vì người nhận không trả ship (CH-2). Người bấm là người tặng, nhưng
   * người làm đổ lượt trao là người nhận — và `closed_by` là thứ chảy vào tiêu chí
   * `FEWEST_CANCELLATIONS` của CH-1.
   */
  readonly closedByUserId?: string;
  /**
   * Ảnh đính kèm ngay trong transaction đóng lượt trao.
   *
   * Ghi ảnh ở một lần gọi khác thì có một khoảnh khắc lượt trao đã đóng mà bằng
   * chứng chưa tới — tiến trình chết giữa hai lần gọi là mất bằng chứng vĩnh viễn.
   */
  readonly evidence?: {
    readonly kind: GiftEvidenceKinds;
    readonly uploadedBy: string;
    readonly storageKeys: readonly string[];
  };
}

/**
 * Hàng đợi dự phòng sau khi một lượt trao bị đóng (F33, F35).
 *
 * Trả **số đo thô** của từng ứng viên, KHÔNG tự chọn ai. Thứ tự ưu tiên do Admin
 * cấu hình (CH-1), nên việc xếp hạng là chính sách nghiệp vụ và thuộc tầng
 * application — repository chỉ cấp dữ liệu.
 *
 * Trả về để **use case** xếp hạng rồi gửi thông báo, không phải repository:
 * thông báo phải đi SAU khi transaction commit, nếu không sẽ báo cho người dùng
 * về một lượt huỷ có thể còn bị rollback.
 */
export interface IReopenedQueue {
  /** Số ứng viên vừa được đưa trở lại hàng chờ xét. */
  readonly reopenedCount: number;
  /**
   * Số đo của mọi ứng viên còn đang chờ xét, chưa xếp thứ tự.
   *
   * Người được đề xuất tính bằng `pickNextCandidate()` với thứ tự Admin đã cấu
   * hình. Đây là **đề xuất**, không phải quyết định: hệ thống tuyệt đối không tự
   * trao (F33) — người cho vẫn phải bấm duyệt.
   */
  readonly candidates: readonly ICandidateMetrics[];
}

export interface ICloseGiftTransactionResult {
  readonly transaction: IGiftTransactionSummary;
  readonly queue: IReopenedQueue;
}

export interface IGiftTransactionRepository {
  hasLiveForPost(postId: string): Promise<boolean>;
  findByGlobalId(globalId: string): Promise<IGiftTransactionSummary | null>;
  listForUser(userId: string): Promise<IGiftTransactionSummary[]>;
  /**
   * Mở lại một lượt trao đã đóng nhầm.
   *
   * Chỉ Admin gọi. `COMPLETED` và `CANCELLED` đều mở lại được, và về đúng chặng
   * mà nó đang dở: có `handed_over_at` thì về `DELIVERING`, không thì về
   * `ACCEPTED`.
   *
   * **Tồn kho đối xử khác nhau theo trạng thái đang đóng**, và đây là chỗ dễ
   * sai nhất. Duyệt yêu cầu đã trừ kho; huỷ TRẢ LẠI kho còn hoàn tất thì
   * KHÔNG. Nên mở lại một lượt `CANCELLED` phải trừ kho lần nữa — và từ chối
   * nếu bài đã hết hàng, vì lúc đó món đồ thật sự đã sang tay người khác. Mở
   * lại một lượt `COMPLETED` thì không đụng kho: nó chưa bao giờ được trả.
   *
   * **Điểm đã cộng thì GIỮ NGUYÊN.** Sổ điểm là append-only, và khoá chống
   * trùng của phần thưởng hoàn tất theo chính lượt trao — nên hoàn tất lần nữa
   * sau khi mở lại cũng không cộng thêm lần hai.
   */
  reopen(params: {
    transactionId: string;
    actorUserId: string;
    reason: string;
  }): Promise<IGiftTransactionSummary>;

  /**
   * Người tặng báo đã trao đồ — `ACCEPTED` → `DELIVERING` (H1).
   *
   * Mốc `handed_over_at` đẩy lùi đồng hồ tự hoàn tất: đếm từ lúc duyệt thì ship
   * liên tỉnh 4–5 ngày sẽ bị cron đóng trước khi hàng tới nơi.
   */
  markHandedOver(params: {
    transactionId: string;
    giverId: string;
    evidenceKeys: readonly string[];
  }): Promise<IGiftTransactionSummary>;
  /**
   * Đính ảnh bằng chứng. Tối đa ba tấm mỗi loại, do **database** chặn.
   *
   * Trả về số tấm thực sự đính được: gửi quá trần thì phần thừa bị bỏ, không
   * ném lỗi — người dùng chụp bốn tấm không phải là một lỗi cần chặn cả thao tác.
   */
  attachEvidenceWithinTransaction(
    manager: EntityManager,
    params: IAttachGiftEvidenceParams,
  ): Promise<number>;
  /** Ảnh bằng chứng của một lượt trao, xếp theo mốc rồi theo thứ tự tải lên. */
  listEvidence(transactionId: string): Promise<IGiftEvidenceRef[]>;
  /** Người này đã để lại ảnh lúc trao đồ chưa — điều kiện để được report. */
  hasEvidence(transactionId: string, kind: GiftEvidenceKinds): Promise<boolean>;
  /** Người nhận xác nhận đã nhận. Đây là mốc tính hoạt động cho rank. */
  confirmReceipt(
    transactionId: string,
    receiverId: string,
    evidenceKeys?: readonly string[],
  ): Promise<IGiftTransactionSummary>;
  /**
   * Đóng một lượt trao, trả tồn kho, và **mở lại hàng đợi** (F35).
   *
   * Ứng viên đang `STANDBY` quay về `PENDING` để người cho thấy họ là việc cần
   * làm; yêu cầu của người vừa bị huỷ chuyển sang `CANCELLED` và KHÔNG quay lại
   * hàng đợi — họ đã được chọn một lần và lượt đó đổ.
   */
  close(
    params: ICloseGiftTransactionParams,
  ): Promise<ICloseGiftTransactionResult>;
  /**
   * Số lần một người đóng lượt trao với trạng thái đã cho (F35).
   *
   * Đếm từ `closed_by` chứ không từ một bộ đếm trên `users`: hai con số nói về
   * cùng một sự thật thì sớm muộn lệch nhau.
   */
  countClosedBy(
    userId: string,
    status: Extract<GiftTransactionStatuses, 'CANCELLED'>,
  ): Promise<number>;
  /**
   * Tự hoàn tất những lượt đã duyệt quá hạn. Gọi từ scheduler NGOÀI tiến trình,
   * giống rank maintenance; repo cấm `@nestjs/schedule`.
   *
   * **Lượt đang có tranh chấp bị giữ lại, không đóng.** Đánh một lượt trao đang
   * bị báo xấu là "thành công" vừa cộng điểm cho người có thể đang gian lận, vừa
   * ghi công người nhận đã nhận món đồ mà họ chưa nhận — và sổ điểm append-only
   * nên khoản cộng đó chỉ đảo được bằng một bút toán ngược thủ công.
   *
   * Lượt bị giữ tự được xử lý ở lần chạy sau khi Admin đóng báo xấu, nên không
   * cần hàng đợi riêng. Nhưng con số `heldForDispute` PHẢI lộ ra: một lượt trao
   * treo vô thời hạn vì báo xấu không ai xử là chuyện người vận hành cần thấy.
   */
  completeDueDeliveries(olderThanDays: number): Promise<{
    completed: number;
    heldForDispute: number;
    /**
     * Chính những lượt vừa được đóng.
     *
     * Con số không đủ cho nơi gọi: hai bên phải được BÁO. Ở đường này họ không
     * bấm gì cả, nên thông báo là cách duy nhất họ biết lượt trao đã khép và
     * lịch sử trò chuyện sắp bị xoá.
     */
    completedTransactions: IGiftTransactionSummary[];
  }>;
  /** Số lượt tặng đã hoàn tất của một người tặng, dùng cho rank. */
  countCompletedByGiver(
    giverId: string,
    window?: { from: Date; to: Date },
  ): Promise<number>;
  /**
   * Số lượt còn dở dang mà người này đang tham gia, ở CẢ hai vai.
   *
   * Dùng để chặn xoá tài khoản (F06): xoá giữa chừng là bỏ phía bên kia treo
   * với một lượt trao không bao giờ kết thúc.
   */
  countOpenForUser(userId: string): Promise<number>;
  /**
   * Đóng mọi yêu cầu còn ở `REQUESTED` của một bài, trả về ai bị đóng.
   *
   * Gọi khi tác giả gỡ bài. Không đóng thì những yêu cầu đó treo vĩnh viễn:
   * người xin không bao giờ nhận được câu trả lời, và mỗi yêu cầu treo vẫn ăn
   * một suất trong trần "yêu cầu đang mở" của họ — tức gỡ một bài là khoá bớt
   * chỗ của người khác.
   *
   * KHÔNG đụng `ACCEPTED`/`DELIVERING`: đường gỡ bài đã chặn sẵn hai trạng thái
   * đó, và nếu lọt tới đây thì đóng ngang là cắt một lượt trao đang diễn ra.
   */
  closeOpenRequestsForPost(params: {
    postId: string;
    /** Người gỡ bài — `closed_by` bắt buộc đi kèm `closed_at` ở database. */
    closedBy: string;
    reason: string;
  }): Promise<{ transactionId: string; receiverId: string }[]>;
  /**
   * Kiểm tra xem một người dùng có phải là người nhận đã được chọn cho bài đăng này
   * trong một giao dịch đang giao hoặc hoàn tất (ACCEPTED, DELIVERING, COMPLETED) hay không.
   * Dùng cho kiểm soát quyền riêng tư (Privacy): chỉ người nhận mới thấy thông tin liên lạc.
   */
  isReceiverOfPost(postId: string, receiverId: string): Promise<boolean>;
}

export const IGiftTransactionRepository = Symbol('IGiftTransactionRepository');
