import { ITransactionReviewEntity } from '@chantam.vn/chantam.core-lib/entities';
import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';

export interface ISubmitTransactionReviewParams {
  readonly globalId: string;
  readonly transactionId: string;
  readonly reviewerId: string;
  readonly revieweeId: string;
  readonly reviewerRole: TransactionReviewRoles;
  readonly rating: number;
  /** Chỉ bên NHẬN mới có; bên TẶNG phải là `null`. */
  readonly accuracyPercent: number | null;
  readonly comment: string | null;
}

export interface IReviewableTransaction {
  readonly transactionId: string;
  readonly giverId: string;
  readonly receiverId: string;
  /** Vai của người đang hỏi. `null` khi họ không thuộc lượt trao này. */
  readonly role: TransactionReviewRoles | null;
  /** Đánh giá chỉ mở sau khi lượt trao đã hoàn tất. */
  readonly completed: boolean;
}

export interface IGiverAccuracyState {
  readonly percent: number | null;
  readonly samples: number;
  readonly reviewRequired: boolean;
}

export interface IAccuracyDrift {
  readonly userId: string;
  readonly storedPercent: number | null;
  readonly actualPercent: number | null;
  readonly storedSamples: number;
  readonly actualSamples: number;
  readonly storedReviewRequired: boolean;
  readonly actualReviewRequired: boolean;
}

export interface IAccuracyReconcileResult {
  /** Số người có mẫu, hoặc đang mang chỉ số đã lưu. */
  readonly scanned: number;
  readonly drifts: IAccuracyDrift[];
  /** Số người đã sửa. Luôn `0` khi `dryRun`. */
  readonly repaired: number;
}

/**
 * Điểm sao trung bình của một người, theo TỪNG VAI.
 *
 * Hai con số vì vai của người được đánh giá là vai đối lập với người đánh giá:
 * người NHẬN chấm thì đang chấm đối phương với vai người tặng, và ngược lại. Gộp
 * lại là trộn "có đáng xin nhận từ người này không" với "có nên duyệt cho người
 * này không".
 */
export interface IReviewRatingState {
  /** Điểm khi người này TẶNG. `null` khi chưa đủ mẫu. */
  readonly asGiver: { average: number | null; samples: number };
  /** Điểm khi người này NHẬN. `null` khi chưa đủ mẫu. */
  readonly asReceiver: { average: number | null; samples: number };
}

export interface IUnsettledReceiverReward {
  readonly transactionId: string;
  readonly receiverId: string;
  readonly completedAt: Date;
}

export interface IUnsettledGiverReward {
  readonly transactionId: string;
  readonly giverId: string;
  readonly completedAt: Date;
  /**
   * Mức chính xác người NHẬN đã chấm, hoặc `null` khi họ chưa đánh giá.
   *
   * `null` là tín hiệu "áp mức mặc định trong `review.grace`". Chấm 0% KHÁC
   * không chấm: 0 là một ý kiến thật và vẫn ghi một bút toán delta = 0, nên hai
   * giá trị này không được gộp bằng `||` ở bất cứ đâu.
   */
  readonly accuracyPercent: number | null;
}

export interface IPendingReviewReminder {
  /**
   * Vai của người CẦN đánh giá.
   *
   * Câu nhắc khác nhau theo vai, và hạn cũng khác: bên NHẬN có một mốc thật — hết
   * `graceDays` là hệ thống áp mức mặc định và chốt thưởng của người tặng. Bên
   * TẶNG thì không có mốc nào, đánh giá của họ chỉ nuôi điểm sao của người nhận.
   */
  readonly role: 'GIVER' | 'RECEIVER';
  readonly transactionId: string;
  /** Người cần được nhắc — chính là người phải gửi đánh giá. */
  readonly userId: string;
  /**
   * Số ngày còn lại trước khi hệ thống áp mức mặc định.
   *
   * Chỉ có nghĩa với vai NHẬN; với vai TẶNG luôn là `null` vì không có hạn nào.
   */
  readonly daysLeft: number | null;
}

export interface ITransactionReviewRepository {
  /**
   * Lượt trao đã hoàn tất, NGƯỜI NHẬN chưa đánh giá, và còn trong thời hạn chờ.
   *
   * Cố ý loại lượt đã quá hạn: nhắc một người đánh giá khi hệ thống đã áp mức
   * mặc định là nhắc một việc không còn tác dụng gì.
   */
  findPendingReviewReminders(params: {
    graceDays: number;
    remindAfterDays: number;
    limit: number;
  }): Promise<IPendingReviewReminder[]>;

  /**
   * Lượt trao đã hoàn tất mà NGƯỜI TẶNG chưa được trả thưởng — cả hai dạng.
   *
   * Hai dạng, một danh sách, vì cả hai đều kết thúc bằng đúng một hành động là
   * gọi `AwardGiftCompletionUseCase`:
   *
   * 1. Người nhận **chưa** đánh giá và đã quá `graceDays` → `accuracyPercent`
   *    trả về `null`, tức tín hiệu "áp mức mặc định".
   * 2. Người nhận **đã** đánh giá nhưng bút toán vẫn chưa có → trả về đúng mức
   *    họ chấm. Dạng này sinh ra khi lần cộng điểm lúc đánh giá bị trần ngày
   *    chặn. Trước đây điều kiện lọc là "chưa ai đánh giá", nên những lượt này
   *    bị loại khỏi danh sách VĨNH VIỄN và người tặng mất thưởng — nghĩa là
   *    người nhận đánh giá sớm lại làm người tặng thiệt, đúng cái động cơ lệch
   *    mà cả cơ chế này được dựng ra để tránh.
   *
   * Lọc luôn theo `point_ledger` chứ không để tầng trên tự kiểm: danh sách này
   * chạy mỗi ngày, và trả về cả nghìn lượt đã trả thưởng rồi để tầng trên bỏ đi
   * là nghìn lượt đi database vô ích.
   */
  findUnsettledGiverRewards(params: {
    graceDays: number;
    limit: number;
  }): Promise<IUnsettledGiverReward[]>;

  /**
   * Lượt trao đã hoàn tất mà NGƯỜI NHẬN chưa được trả thưởng.
   *
   * Phần thưởng người nhận cộng phẳng ngay lúc hoàn tất và nuốt ngoại lệ chính
   * sách, nên chạm trần ngày là mất — và trước đây KHÔNG có đường nào quét lại
   * phía người nhận cả. Không cần chờ hết hạn: chẳng có gì phải chờ, món quà đã
   * trao xong rồi.
   */
  findUnsettledReceiverRewards(params: {
    limit: number;
  }): Promise<IUnsettledReceiverReward[]>;

  /**
   * Tính lại chỉ số accuracy của MỌI người theo ngưỡng đang cấu hình.
   *
   * Cần vì cờ chỉ được cập nhật khi người đó nhận đánh giá mới: Admin hạ ngưỡng
   * từ 75 xuống 60 thì những người đang bị gắn cờ ở 65 vẫn mang cờ cho tới lần
   * đánh giá kế tiếp, có khi không bao giờ tới.
   */
  reconcileAccuracy(params: {
    dryRun: boolean;
  }): Promise<IAccuracyReconcileResult>;
  /**
   * Bối cảnh để quyết người này được đánh giá lượt trao đó hay không.
   *
   * Trả `null` khi lượt trao không tồn tại. Người ngoài cuộc nhận `role: null`
   * chứ không phải một lỗi riêng — phân biệt hai cái là để lộ ai trao đổi với ai.
   */
  findReviewable(
    transactionId: string,
    userId: string,
  ): Promise<IReviewableTransaction | null>;

  /**
   * Ghi đánh giá và tính lại chỉ số accuracy của người được đánh giá trong
   * CÙNG transaction.
   *
   * Tính lại từ toàn bộ mẫu chứ không cộng dồn: cộng dồn thì một lần ghi hỏng
   * là chỉ số lệch vĩnh viễn, và không ai phát hiện ra vì không còn gì để đối
   * chiếu.
   */
  submitReview(params: ISubmitTransactionReviewParams): Promise<{
    review: ITransactionReviewEntity;
    /** Trạng thái accuracy của người ĐƯỢC đánh giá sau lần ghi này. */
    accuracy: IGiverAccuracyState;
    /** Điểm sao của người ĐƯỢC đánh giá sau lần ghi này, tách theo vai. */
    rating: IReviewRatingState;
  }>;

  /** Đánh giá của một người cho một lượt trao. `null` khi chưa gửi. */
  findByReviewer(
    transactionId: string,
    reviewerId: string,
  ): Promise<ITransactionReviewEntity | null>;

  /** Đánh giá của bên còn lại trong lượt trao. */
  findCounterpart(
    transactionId: string,
    reviewerId: string,
  ): Promise<ITransactionReviewEntity | null>;

  /** Chỉ số accuracy đang công bố của một người. */
  getAccuracy(userId: string): Promise<IGiverAccuracyState>;

  /** Điểm sao đã lưu của một người, tách theo vai. */
  getRating(userId: string): Promise<IReviewRatingState>;

  /**
   * CHỈ mức chính xác trong đánh giá của bên kia, không kèm bình luận hay điểm sao.
   *
   * Tách khỏi `findCounterpart` vì hai thứ được che vì hai lý do khác nhau: bình
   * luận và điểm sao che để tránh trả đũa, còn mức chính xác là hệ số tính thưởng
   * của người tặng nên họ phải xem được — xem `GetTransactionReviewsUseCase`.
   */
  findCounterpartAccuracy(
    transactionId: string,
    userId: string,
  ): Promise<number | null>;
}

export const ITransactionReviewRepository = Symbol(
  'ITransactionReviewRepository',
);
