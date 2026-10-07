import {
  IAccuracyDrift,
  IAccuracyReconcileResult,
  IAdminConfigRepository,
  IGiverAccuracyState,
  IPendingReviewReminder,
  IReviewableTransaction,
  IReviewRatingState,
  ISubmitTransactionReviewParams,
  ITransactionReviewRepository,
  IUnsettledGiverReward,
  IUnsettledReceiverReward,
  IUnsettledValueBonus,
} from '@/domain/ports/repository';
import { ITransactionReviewEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  computeGiverAccuracy,
  computeReviewRating,
  GiverAccuracyConfigKey,
  normalizeGiverAccuracyConfig,
  normalizeReviewRatingConfig,
  ReviewRatingConfigKey,
  TransactionReviewRoles,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IReviewRow {
  global_id: string;
  transaction_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: TransactionReviewRoles;
  rating: number;
  accuracy_percent: number | null;
  comment: string | null;
  created_at: Date;
  id: string;
}

function toEntity(row: IReviewRow): ITransactionReviewEntity {
  return {
    id: Number(row.id),
    globalId: row.global_id,
    transactionId: row.transaction_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    reviewerRole: row.reviewer_role,
    rating: Number(row.rating),
    accuracyPercent:
      row.accuracy_percent === null ? null : Number(row.accuracy_percent),
    comment: row.comment,
    createdAt: row.created_at,
  } as ITransactionReviewEntity;
}

const SelectColumns = `
  id, global_id, transaction_id, reviewer_id, reviewee_id,
  reviewer_role, rating, accuracy_percent, comment, created_at
`;

@Injectable()
export class TransactionReviewRepository implements ITransactionReviewRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  /**
   * Đọc ngưỡng đang cấu hình. Gom một chỗ vì cả đường ghi lẫn đường đối soát
   * đều phải dùng CÙNG một bộ ngưỡng, nếu không đối soát sẽ báo lệch giả.
   */
  private async readConfig() {
    return normalizeGiverAccuracyConfig(
      await this.adminConfig.getConfigValue(GiverAccuracyConfigKey),
    );
  }

  private async readRatingConfig() {
    return normalizeReviewRatingConfig(
      await this.adminConfig.getConfigValue(ReviewRatingConfigKey),
    );
  }

  /**
   * Tính lại điểm sao của một người từ TOÀN BỘ mẫu, tách theo vai.
   *
   * Cùng lý lẽ với `recomputeAccuracy`: cộng dồn thì một lần ghi hỏng là chỉ số
   * lệch vĩnh viễn và không còn gì để đối chiếu.
   *
   * Vai của người ĐƯỢC đánh giá là vai ĐỐI LẬP với người đánh giá — nên mẫu cho
   * "điểm khi tặng" là những đánh giá có `reviewer_role = 'RECEIVER'`.
   */
  private async recomputeRating(
    manager: EntityManager,
    userId: string,
  ): Promise<IReviewRatingState> {
    const rows = await manager.query<
      { reviewer_role: string; rating: number }[]
    >(
      `
        SELECT reviewer_role, rating FROM transaction_reviews
        WHERE reviewee_id = $1
      `,
      [userId],
    );

    const config = await this.readRatingConfig();
    const asGiver = computeReviewRating(
      rows
        .filter((row) => row.reviewer_role === TransactionReviewRoles.RECEIVER)
        .map((row) => Number(row.rating)),
      config,
    );
    const asReceiver = computeReviewRating(
      rows
        .filter((row) => row.reviewer_role === TransactionReviewRoles.GIVER)
        .map((row) => Number(row.rating)),
      config,
    );

    // Ghi SỐ LIỆU THÔ, kể cả khi `average` là `null` vì chưa đủ mẫu: số mẫu vẫn
    // là sự thật và vẫn phải đếm, còn việc công bố hay không do ngưỡng quyết lúc
    // đọc. Ghi `samples = 0` cho một người đã có hai đánh giá là làm đối soát về
    // sau không còn gì để so.
    await manager.query(
      `
        UPDATE users
        SET giver_rating_average = $2,
            giver_rating_samples = $3,
            receiver_rating_average = $4,
            receiver_rating_samples = $5,
            updated_at = now()
        WHERE global_id = $1
      `,
      [
        userId,
        asGiver.average,
        asGiver.samples,
        asReceiver.average,
        asReceiver.samples,
      ],
    );

    return { asGiver, asReceiver };
  }

  public async reconcileAccuracy(params: {
    dryRun: boolean;
  }): Promise<IAccuracyReconcileResult> {
    const config = await this.readConfig();

    // Lấy cả người ĐANG mang chỉ số đã lưu nhưng nay không còn mẫu nào: nâng
    // `minSamples` có thể khiến một chỉ số từng công bố phải rút lại.
    //
    // `deleted_at IS NULL`: tài khoản đã xoá mềm không còn hồ sơ để hiện chỉ số,
    // và tính lại cờ cho họ chỉ làm báo cáo đối soát dài ra bằng những dòng không
    // ai đọc.
    const rows = await this.manager.query<
      {
        user_id: string;
        stored_percent: number | null;
        stored_samples: number;
        stored_flag: boolean;
        percents: number[] | null;
      }[]
    >(`
      SELECT person.global_id AS user_id,
             person.giver_accuracy_percent AS stored_percent,
             person.giver_accuracy_samples AS stored_samples,
             person.accuracy_review_required AS stored_flag,
             sample.percents
      FROM users person
      LEFT JOIN (
        SELECT reviewee_id,
               array_agg(accuracy_percent) AS percents
        FROM transaction_reviews
        WHERE accuracy_percent IS NOT NULL
        GROUP BY reviewee_id
      ) sample ON sample.reviewee_id = person.global_id
      WHERE person.deleted_at IS NULL
        AND (
          sample.reviewee_id IS NOT NULL
          OR person.giver_accuracy_samples > 0
          OR person.accuracy_review_required = true
        )
    `);

    const drifts: IAccuracyDrift[] = [];
    for (const row of rows) {
      const snapshot = computeGiverAccuracy(
        (row.percents ?? []).map(Number),
        config,
      );
      const storedPercent =
        row.stored_percent === null ? null : Number(row.stored_percent);

      const same =
        storedPercent === snapshot.percent &&
        Number(row.stored_samples) === snapshot.samples &&
        row.stored_flag === snapshot.reviewRequired;
      if (same) continue;

      drifts.push({
        userId: row.user_id,
        storedPercent,
        actualPercent: snapshot.percent,
        storedSamples: Number(row.stored_samples),
        actualSamples: snapshot.samples,
        storedReviewRequired: row.stored_flag,
        actualReviewRequired: snapshot.reviewRequired,
      });
    }

    if (params.dryRun || drifts.length === 0)
      return { scanned: rows.length, drifts, repaired: 0 };

    // Sửa trong MỘT transaction: nửa chừng mà chết thì một nửa theo ngưỡng mới
    // còn một nửa theo ngưỡng cũ, và không ai biết nửa nào.
    await this.manager.transaction(async (manager) => {
      for (const drift of drifts)
        await manager.query(
          `
            UPDATE users
            SET giver_accuracy_percent = $2,
                giver_accuracy_samples = $3,
                accuracy_review_required = $4,
                updated_at = now()
            WHERE global_id = $1
          `,
          [
            drift.userId,
            drift.actualPercent,
            drift.actualSamples,
            drift.actualReviewRequired,
          ],
        );
    });

    return { scanned: rows.length, drifts, repaired: drifts.length };
  }

  public async findPendingReviewReminders(params: {
    graceDays: number;
    remindAfterDays: number;
    limit: number;
  }): Promise<IPendingReviewReminder[]> {
    // Cửa sổ HAI đầu: đã qua `remindAfterDays` (nhắc ngay hôm hoàn tất là làm
    // phiền người còn chưa mở hộp), nhưng chưa quá `graceDays` (quá rồi thì hệ
    // thống đã áp mức mặc định, nhắc là nhắc một việc vô ích).
    // Hai vai, hai nhánh, một danh sách.
    //
    // Bên NHẬN bị chặn hai đầu: nhắc sau `remindAfterDays` và THÔI nhắc khi quá
    // `graceDays`, vì lúc đó hệ thống đã áp mức mặc định và nhắc là nhắc một việc
    // vô ích.
    //
    // Bên TẶNG không có mốc nào cả — đánh giá của họ chỉ nuôi điểm sao của người
    // nhận, không chốt thưởng của ai. Nên chỉ chặn đầu dưới, và dùng chính
    // `graceDays` làm giới hạn trên để không đi nhắc những lượt trao từ năm ngoái.
    const rows = await this.manager.query<
      {
        role: string;
        transaction_id: string;
        user_id: string;
        days_left: string | null;
      }[]
    >(
      `
        SELECT 'RECEIVER' AS role,
               deal.global_id AS transaction_id,
               deal.receiver_id AS user_id,
               GREATEST(
                 0,
                 CEIL(
                   EXTRACT(EPOCH FROM (
                     deal.completed_at + ($1 || ' days')::interval - now()
                   )) / 86400
                 )
               )::text AS days_left,
               deal.completed_at
        FROM gift_transactions deal
        WHERE deal.status = 'COMPLETED'
          AND deal.completed_at <= now() - ($2 || ' days')::interval
          AND deal.completed_at > now() - ($1 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM transaction_reviews rated
            WHERE rated.transaction_id = deal.global_id
              AND rated.reviewer_role = 'RECEIVER'
          )

        UNION ALL

        SELECT 'GIVER' AS role,
               deal.global_id AS transaction_id,
               deal.giver_id AS user_id,
               NULL AS days_left,
               deal.completed_at
        FROM gift_transactions deal
        WHERE deal.status = 'COMPLETED'
          AND deal.completed_at <= now() - ($2 || ' days')::interval
          AND deal.completed_at > now() - ($1 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM transaction_reviews rated
            WHERE rated.transaction_id = deal.global_id
              AND rated.reviewer_role = 'GIVER'
          )

        ORDER BY completed_at
        LIMIT $3
      `,
      [String(params.graceDays), String(params.remindAfterDays), params.limit],
    );

    return rows.map((row) => ({
      role: row.role === 'GIVER' ? ('GIVER' as const) : ('RECEIVER' as const),
      transactionId: row.transaction_id,
      userId: row.user_id,
      daysLeft: row.days_left === null ? null : Number(row.days_left),
    }));
  }

  public async findUnsettledGiverRewards(params: {
    graceDays: number;
    limit: number;
  }): Promise<IUnsettledGiverReward[]> {
    // `LEFT JOIN` đánh giá của NGƯỜI NHẬN, không phải `NOT EXISTS`: chính mức
    // họ chấm là thứ quyết định số điểm, nên phải lấy ra chứ không chỉ kiểm tra
    // có hay không. Đánh giá của người tặng dành cho người nhận không nói gì về
    // chất lượng món quà nên không tính ở đây.
    //
    // `NOT EXISTS` trên ledger theo đúng khoá chống trùng mà đường đánh giá
    // dùng. Nhờ vậy job và đường đánh giá không bao giờ trả thưởng hai lần cho
    // cùng một lượt trao, dù chạy song song.
    //
    // Điều kiện cuối là phép hợp của hai dạng: đã có đánh giá thì lấy ngay,
    // chưa có thì chờ hết hạn. Lượt đã đánh giá không phải chờ thêm — nó đã quá
    // hạn theo định nghĩa, lẽ ra được trả từ lúc người nhận bấm gửi.
    const rows = await this.manager.query<
      {
        transaction_id: string;
        giver_id: string;
        completed_at: Date;
        accuracy_percent: number | string | null;
      }[]
    >(
      `
        SELECT deal.global_id AS transaction_id,
               deal.giver_id,
               deal.completed_at,
               rated.accuracy_percent
        FROM gift_transactions deal
        LEFT JOIN transaction_reviews rated
          ON rated.transaction_id = deal.global_id
          AND rated.reviewer_role = 'RECEIVER'
        WHERE deal.status = 'COMPLETED'
          AND NOT EXISTS (
            SELECT 1 FROM point_ledger paid
            WHERE paid.idempotency_key = 'GIFT_COMPLETED_GIVER:' || deal.global_id
          )
          AND (
            rated.transaction_id IS NOT NULL
            OR deal.completed_at <= now() - ($1 || ' days')::interval
          )
        ORDER BY deal.completed_at
        LIMIT $2
      `,
      [String(params.graceDays), params.limit],
    );

    return rows.map((row) => ({
      transactionId: row.transaction_id,
      giverId: row.giver_id,
      completedAt: row.completed_at,
      // `null` là tín hiệu "không có đánh giá" cho `AwardGiftCompletionUseCase`.
      // Chấm 0% KHÁC không chấm, nên phải phân biệt tại đây chứ không dùng `||`.
      accuracyPercent:
        row.accuracy_percent === null ? null : Number(row.accuracy_percent),
    }));
  }

  public async findUnsettledValueBonuses(params: {
    graceDays: number;
    limit: number;
  }): Promise<IUnsettledValueBonus[]> {
    // `NOT EXISTS` theo khoá chống trùng của BONUS, không phải của điểm hoàn tất.
    // Hai khoản là hai bút toán rời (CHỐT-14), nên dùng chung một khoá sẽ làm lượt
    // nào đã trả điểm hoàn tất không bao giờ nhận được bonus.
    //
    // Và KHÔNG có nhánh "đã có đánh giá thì lấy ngay" như đường điểm hoàn tất: bonus
    // chỉ chốt tại hạn, vì trước hạn người nhận còn được sửa đánh giá một lần. Trả
    // sớm là trả theo một con số còn sửa được.
    //
    // `LEFT JOIN posts` chứ không `INNER`: bài bị xoá cứng vẫn phải trả bonus cho
    // lượt trao đã hoàn tất — mất bài không phải lỗi của người tặng. Lúc đó
    // `estimated_value` về `null` và bonus thành 0, đúng như không khai giá.
    const rows = await this.manager.query<
      {
        transaction_id: string;
        giver_id: string;
        completed_at: Date;
        accuracy_percent: number | string | null;
        estimated_value: string | null;
      }[]
    >(
      `
        SELECT deal.global_id AS transaction_id,
               deal.giver_id,
               deal.completed_at,
               rated.accuracy_percent,
               item.estimated_value
        FROM gift_transactions deal
        LEFT JOIN transaction_reviews rated
          ON rated.transaction_id = deal.global_id
          AND rated.reviewer_role = 'RECEIVER'
        LEFT JOIN posts item ON item.global_id = deal.post_id
        WHERE deal.status = 'COMPLETED'
          AND NOT EXISTS (
            SELECT 1 FROM point_ledger paid
            WHERE paid.idempotency_key = 'GIFT_VALUE_BONUS_GIVER:' || deal.global_id
          )
          AND deal.completed_at <= now() - ($1 || ' days')::interval
        ORDER BY deal.completed_at
        LIMIT $2
      `,
      [String(params.graceDays), params.limit],
    );

    return rows.map((row) => ({
      transactionId: row.transaction_id,
      giverId: row.giver_id,
      completedAt: row.completed_at,
      accuracyPercent:
        row.accuracy_percent === null ? null : Number(row.accuracy_percent),
      // `estimated_value` là `bigint`, nên node-pg trả CHUỖI. Thiếu `Number()` thì
      // phép chia dưới xuôi thành nối chuỗi và số điểm ra vô nghĩa.
      estimatedValueVnd:
        row.estimated_value === null ? null : Number(row.estimated_value),
    }));
  }

  public async findUnsettledReceiverRewards(params: {
    limit: number;
  }): Promise<IUnsettledReceiverReward[]> {
    const rows = await this.manager.query<
      { transaction_id: string; receiver_id: string; completed_at: Date }[]
    >(
      `
        SELECT deal.global_id AS transaction_id,
               deal.receiver_id,
               deal.completed_at
        FROM gift_transactions deal
        WHERE deal.status = 'COMPLETED'
          AND NOT EXISTS (
            SELECT 1 FROM point_ledger paid
            WHERE paid.idempotency_key = 'GIFT_COMPLETED_RECEIVER:' || deal.global_id
          )
        ORDER BY deal.completed_at
        LIMIT $1
      `,
      [params.limit],
    );

    return rows.map((row) => ({
      transactionId: row.transaction_id,
      receiverId: row.receiver_id,
      completedAt: row.completed_at,
    }));
  }

  public async findReviewable(
    transactionId: string,
    userId: string,
  ): Promise<IReviewableTransaction | null> {
    const [row] = await this.manager.query<
      {
        giver_id: string;
        receiver_id: string;
        status: string;
      }[]
    >(
      `
        SELECT giver_id, receiver_id, status
        FROM gift_transactions
        WHERE global_id = $1
      `,
      [transactionId],
    );
    if (!row) return null;

    const role =
      row.giver_id === userId
        ? TransactionReviewRoles.GIVER
        : row.receiver_id === userId
          ? TransactionReviewRoles.RECEIVER
          : null;

    return {
      transactionId,
      giverId: row.giver_id,
      receiverId: row.receiver_id,
      role,
      completed: row.status === 'COMPLETED',
    };
  }

  /**
   * Tính lại chỉ số accuracy của một người từ TOÀN BỘ mẫu.
   *
   * Cộng dồn thì một lần ghi hỏng là chỉ số lệch vĩnh viễn và không còn gì để
   * đối chiếu. Số mẫu ở đây nhỏ (mỗi lượt trao tối đa một mẫu cho mỗi người),
   * nên quét lại rẻ hơn hẳn một chỉ số sai.
   */
  private async recomputeAccuracy(
    manager: EntityManager,
    userId: string,
  ): Promise<IGiverAccuracyState> {
    const rows = await manager.query<{ accuracy_percent: number }[]>(
      `
        SELECT accuracy_percent FROM transaction_reviews
        WHERE reviewee_id = $1 AND accuracy_percent IS NOT NULL
      `,
      [userId],
    );

    // Ngưỡng do Admin cấu hình (F61). Cấu hình hỏng thì `normalize` rơi về
    // mặc định — một dòng JSON gõ nhầm không được biến thành "gắn cờ tất cả".
    const config = await this.readConfig();

    const snapshot = computeGiverAccuracy(
      rows.map((row) => Number(row.accuracy_percent)),
      config,
    );

    await manager.query(
      `
        UPDATE users
        SET giver_accuracy_percent = $2,
            giver_accuracy_samples = $3,
            accuracy_review_required = $4,
            updated_at = now()
        WHERE global_id = $1
      `,
      [userId, snapshot.percent, snapshot.samples, snapshot.reviewRequired],
    );

    return {
      percent: snapshot.percent,
      samples: snapshot.samples,
      reviewRequired: snapshot.reviewRequired,
    };
  }

  public async findCounterpartAccuracy(
    transactionId: string,
    userId: string,
  ): Promise<number | null> {
    const [row] = await this.manager.query<{ accuracy_percent: number }[]>(
      `
        SELECT accuracy_percent FROM transaction_reviews
        WHERE transaction_id = $1
          AND reviewer_id <> $2
          AND accuracy_percent IS NOT NULL
        LIMIT 1
      `,
      [transactionId, userId],
    );

    return row === undefined ? null : Number(row.accuracy_percent);
  }

  public async getRating(userId: string): Promise<IReviewRatingState> {
    const [row] = await this.manager.query<
      {
        giver_rating_average: string | null;
        giver_rating_samples: string;
        receiver_rating_average: string | null;
        receiver_rating_samples: string;
      }[]
    >(
      `
        SELECT giver_rating_average, giver_rating_samples,
               receiver_rating_average, receiver_rating_samples
        FROM users WHERE global_id = $1
      `,
      [userId],
    );

    // Ngưỡng áp lúc ĐỌC, không lúc ghi: cột lưu số liệu thô, nên Admin hạ
    // `rating.display` là mọi hồ sơ công bố ngay, không phải chờ ai đánh giá thêm.
    // Cùng lối với `computeGiverAccuracy`.
    const config = await this.readRatingConfig();
    const shape = (
      average: string | null,
      samples: string,
    ): { average: number | null; samples: number } => {
      const count = Number(samples ?? 0);

      return {
        average:
          average === null || count < config.minSamples
            ? null
            : Number(average),
        samples: count,
      };
    };

    return {
      asGiver: shape(
        row?.giver_rating_average ?? null,
        row?.giver_rating_samples ?? '0',
      ),
      asReceiver: shape(
        row?.receiver_rating_average ?? null,
        row?.receiver_rating_samples ?? '0',
      ),
    };
  }

  public async submitReview(params: ISubmitTransactionReviewParams): Promise<{
    review: ITransactionReviewEntity;
    accuracy: IGiverAccuracyState;
    rating: IReviewRatingState;
  }> {
    return this.manager.transaction(async (manager) => {
      const [row] = await manager.query<IReviewRow[]>(
        `
          INSERT INTO transaction_reviews
            (global_id, transaction_id, reviewer_id, reviewee_id,
             reviewer_role, rating, accuracy_percent, comment)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING ${SelectColumns}
        `,
        [
          params.globalId,
          params.transactionId,
          params.reviewerId,
          params.revieweeId,
          params.reviewerRole,
          params.rating,
          params.accuracyPercent,
          params.comment,
        ],
      );

      // Chỉ bên NHẬN chấm accuracy, nên chỉ lần đó mới phải tính lại accuracy.
      const accuracy =
        params.accuracyPercent === null
          ? await this.readAccuracy(manager, params.revieweeId)
          : await this.recomputeAccuracy(manager, params.revieweeId);

      // Điểm sao thì CẢ HAI vai đều chấm, nên lần nào cũng tính lại. Trước 29/09
      // con số này chỉ được ghi vào bảng rồi không ai đọc.
      const rating = await this.recomputeRating(manager, params.revieweeId);

      return { review: toEntity(row), accuracy, rating };
    });
  }

  private async readAccuracy(
    manager: EntityManager,
    userId: string,
  ): Promise<IGiverAccuracyState> {
    const [row] = await manager.query<
      {
        giver_accuracy_percent: number | null;
        giver_accuracy_samples: number;
        accuracy_review_required: boolean;
      }[]
    >(
      `
        SELECT giver_accuracy_percent, giver_accuracy_samples,
               accuracy_review_required
        FROM users WHERE global_id = $1
      `,
      [userId],
    );

    return {
      percent:
        row?.giver_accuracy_percent === null ||
        row?.giver_accuracy_percent === undefined
          ? null
          : Number(row.giver_accuracy_percent),
      samples: Number(row?.giver_accuracy_samples ?? 0),
      reviewRequired: row?.accuracy_review_required === true,
    };
  }

  public async findByReviewer(
    transactionId: string,
    reviewerId: string,
  ): Promise<ITransactionReviewEntity | null> {
    const [row] = await this.manager.query<IReviewRow[]>(
      `
        SELECT ${SelectColumns} FROM transaction_reviews
        WHERE transaction_id = $1 AND reviewer_id = $2
      `,
      [transactionId, reviewerId],
    );
    return row ? toEntity(row) : null;
  }

  public async findCounterpart(
    transactionId: string,
    reviewerId: string,
  ): Promise<ITransactionReviewEntity | null> {
    const [row] = await this.manager.query<IReviewRow[]>(
      `
        SELECT ${SelectColumns} FROM transaction_reviews
        WHERE transaction_id = $1 AND reviewer_id <> $2
      `,
      [transactionId, reviewerId],
    );
    return row ? toEntity(row) : null;
  }

  public async getAccuracy(userId: string): Promise<IGiverAccuracyState> {
    return this.readAccuracy(this.manager, userId);
  }
}
