import {
  IAdminConfigRepository,
  IGiverAccuracyState,
  IReviewableTransaction,
  ISubmitTransactionReviewParams,
  ITransactionReviewRepository,
} from '@/domain/ports/repository';
import { ITransactionReviewEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  computeGiverAccuracy,
  GiverAccuracyConfigKey,
  normalizeGiverAccuracyConfig,
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
    const config = normalizeGiverAccuracyConfig(
      await this.adminConfig.getConfigValue(GiverAccuracyConfigKey),
    );

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

  public async submitReview(params: ISubmitTransactionReviewParams): Promise<{
    review: ITransactionReviewEntity;
    accuracy: IGiverAccuracyState;
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

      // Chỉ bên NHẬN chấm accuracy, nên chỉ lần đó mới phải tính lại.
      const accuracy =
        params.accuracyPercent === null
          ? await this.readAccuracy(manager, params.revieweeId)
          : await this.recomputeAccuracy(manager, params.revieweeId);

      return { review: toEntity(row), accuracy };
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
