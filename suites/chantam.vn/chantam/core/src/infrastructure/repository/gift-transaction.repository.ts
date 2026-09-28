import {
  GiftTransactionInvalidStateException,
  GiftTransactionNotFoundException,
  GiftTransactionNotParticipantException,
  GiftTransactionOutOfStockException,
  PointDailyCapReachedException,
  PointRuleUnavailableException,
} from '@/domain/exceptions';
import {
  GiftTransactionStatuses,
  IAttachGiftEvidenceParams,
  IChatRepository,
  ICloseGiftTransactionParams,
  ICloseGiftTransactionResult,
  IGiftEvidenceRef,
  IGiftTransactionRepository,
  IGiftTransactionSummary,
  IPointLedgerRepository,
  IReopenedQueue,
  StockHoldingGiftTransactionStatuses,
} from '@/domain/ports/repository';
import {
  GiftCompletedReceiverRuleCode,
  GiftEvidenceKinds,
  MaxEvidencePerKind,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { ICandidateMetrics } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface ITransactionRow {
  global_id: string;
  post_id: string;
  giver_id: string;
  receiver_id: string;
  quantity: number | string;
  status: GiftTransactionStatuses;
  requested_at: Date;
  accepted_at: Date | null;
  handed_over_at: Date | null;
  completed_at: Date | null;
}

const SelectColumns = `
  global_id, post_id, giver_id, receiver_id, quantity, status,
  requested_at, accepted_at, handed_over_at, completed_at
`;

function toSummary(row: ITransactionRow): IGiftTransactionSummary {
  return {
    globalId: row.global_id,
    postId: row.post_id,
    giverId: row.giver_id,
    receiverId: row.receiver_id,
    quantity: Number(row.quantity),
    status: row.status,
    requestedAt: row.requested_at,
    acceptedAt: row.accepted_at,
    handedOverAt: row.handed_over_at,
    completedAt: row.completed_at,
  };
}

@Injectable()
export class GiftTransactionRepository implements IGiftTransactionRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    // Repository gọi repository trong cùng tầng hạ tầng: đây là cách duy nhất
    // giữ "mở/khoá chat" nằm trong transaction của "duyệt/kết thúc" —
    // transaction đó được mở ở đây, không ở use case.
    @Inject(IChatRepository)
    private readonly chat: IChatRepository,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  /**
   * Cộng điểm cho cả hai bên khi một lượt trao hoàn tất (H4).
   *
   * **Điểm không được làm hỏng việc xác nhận.** Việc món đồ đã đến tay người nhận
   * là một SỰ THẬT; thưởng bao nhiêu là một CHÍNH SÁCH. Để chính sách đánh đổ sự thật
   * thì người dùng sẽ không bấm xác nhận được chỉ vì họ đạt trần điểm trong ngày,
   * hoặc vì Admin lỡ tắt một rule.
   *
   * Nên hai ngoại lệ CHÍNH SÁCH bị nuốt: đạt trần theo ngày, và rule không còn bật.
   * Cả hai đều do tầng JS ném ra sau một câu SELECT thành công, nên transaction vẫn
   * còn dùng được. Mọi lỗi khác — tức lỗi database thật — vẫn nổi lên và cuốn cả
   * transaction, đúng như mong muốn.
   *
   * Khoá chống trùng theo lượt trao và theo vai, nên xác nhận tay và cron tự hoàn
   * tất có chạy chồng lên nhau cũng chỉ thưởng một lần.
   */
  private async awardCompletionPoints(
    manager: EntityManager,
    transaction: { global_id: string; giver_id: string; receiver_id: string },
  ): Promise<void> {
    // CHỈ người nhận được thưởng ở đây.
    //
    // Phần thưởng của người TẶNG không còn cộng lúc hoàn tất, vì số điểm của họ
    // phụ thuộc mức chính xác mà người nhận chấm (F40) — và lúc này chưa ai
    // chấm. Nó đi qua `AwardGiftCompletionUseCase`: hoặc khi người nhận đánh
    // giá, hoặc khi hết hạn chờ thì áp mức mặc định.
    //
    // Cộng phẳng ở đây rồi cộng theo % ở đó là trả thưởng HAI LẦN cho một lượt
    // trao, và sổ append-only không sửa lại được.
    const awards: [string, string][] = [
      [transaction.receiver_id, GiftCompletedReceiverRuleCode],
    ];

    for (const [userId, ruleCode] of awards) {
      try {
        await this.ledger.appendByRuleWithinTransaction(manager, {
          userId,
          ruleCode,
          referenceType: 'GIFT_TRANSACTION',
          referenceId: transaction.global_id,
          idempotencyKey: `${ruleCode}:${transaction.global_id}`,
          actor: 'SYSTEM',
          source: 'GIFT_TRANSACTION',
        });
      } catch (error) {
        const isPolicy =
          error instanceof PointDailyCapReachedException ||
          error instanceof PointRuleUnavailableException;
        if (!isPolicy) throw error;
      }
    }
  }

  public async findByGlobalId(
    globalId: string,
  ): Promise<IGiftTransactionSummary | null> {
    const [row] = await this.manager.query<ITransactionRow[]>(
      `SELECT ${SelectColumns} FROM gift_transactions WHERE global_id = $1`,
      [globalId],
    );

    return row ? toSummary(row) : null;
  }

  public async listForUser(userId: string): Promise<IGiftTransactionSummary[]> {
    const rows = await this.manager.query<ITransactionRow[]>(
      `
        SELECT ${SelectColumns}
        FROM gift_transactions
        WHERE giver_id = $1 OR receiver_id = $1
        ORDER BY requested_at DESC
      `,
      [userId],
    );

    return rows.map(toSummary);
  }

  /**
   * Đồng bộ trạng thái bài đăng theo tồn kho và các lượt trao đang mở (F34).
   *
   * **Vì sao tính lại thay vì đặt thẳng.** Mỗi nơi gọi đặt một giá trị riêng thì sớm
   * muộn có đường quên đặt — và đó đúng là chuyện đã xảy ra: `accept()` trừ kho
   * nhưng không đổi trạng thái, nên bài đứng mãi ở `PUBLISHED` và **ăn một suất quota
   * của tác giả vĩnh viễn**. Một câu suy ra từ dữ liệu thì không có đường nào quên.
   *
   * ```
   * còn hàng                          → PUBLISHED
   * hết hàng, còn lượt trao đang mở → RESERVED
   * hết hàng, không còn lượt nào   → COMPLETED
   * ```
   *
   * Chỉ đụng ba trạng thái do lượt trao điều khiển. Bài `PENDING_REVIEW`, `EXPIRED`,
   * `ARCHIVED`, `CANCELLED` không được một lượt huỷ kéo ngược về `PUBLISHED` — làm vậy
   * là hồi sinh một bài đã hết hạn hoặc đã chuyển kho từ thiện.
   */
  private async syncPostStatus(
    manager: EntityManager,
    postId: string,
  ): Promise<void> {
    await manager.query(
      `
        UPDATE posts p
        SET status = CASE
              WHEN p.remaining_quantity > 0 THEN 'PUBLISHED'
              WHEN EXISTS (
                SELECT 1 FROM gift_transactions t
                WHERE t.post_id = p.global_id
                  AND t.status::text = ANY($2::text[])
              ) THEN 'RESERVED'
              ELSE 'COMPLETED'
            -- Ep kieu la bat buoc: CASE voi cac nhanh la chuoi tra ve text, ma
            -- cot status la enum. Postgres tu choi gan thang, loi 42804.
            END::gift_posts_status_enum,
            updated_at = now()
        WHERE p.global_id = $1
          AND p.deleted_at IS NULL
          AND p.status::text IN ('PUBLISHED', 'RESERVED', 'COMPLETED')
      `,
      [postId, StockHoldingGiftTransactionStatuses],
    );
  }

  public async reopen(params: {
    transactionId: string;
    actorUserId: string;
    reason: string;
  }): Promise<IGiftTransactionSummary> {
    return this.manager.transaction(async (manager) => {
      const current = await this.lockTransaction(manager, params.transactionId);

      if (current.status !== 'COMPLETED' && current.status !== 'CANCELLED')
        throw new GiftTransactionInvalidStateException(current.status);

      // Về đúng chặng đang dở, không phải về đầu: người tặng đã bàn giao thì
      // bắt họ bàn giao lại là yêu cầu làm lại một việc đã làm.
      const target = current.handed_over_at ? 'DELIVERING' : 'ACCEPTED';

      // Huỷ đã TRẢ kho, nên mở lại phải trừ lần nữa — và có điều kiện, vì món
      // đồ có thể đã sang tay người khác trong lúc lượt này đang đóng.
      if (current.status === 'CANCELLED') {
        const taken = await updateReturning<{ global_id: string }>(
          manager,
          `
            UPDATE posts
            SET remaining_quantity = remaining_quantity - $2,
                updated_at = now()
            WHERE global_id = $1 AND remaining_quantity >= $2
            RETURNING global_id
          `,
          [current.post_id, current.quantity],
        );
        if (taken.length === 0) throw new GiftTransactionOutOfStockException();
      }

      const [reopened] = await updateReturning<ITransactionRow>(
        manager,
        `
          UPDATE gift_transactions
          SET status = $2,
              completed_at = NULL,
              closed_at = NULL,
              closed_by = NULL,
              close_reason = NULL
          WHERE global_id = $1
          RETURNING ${SelectColumns}
        `,
        [params.transactionId, target],
      );

      await this.syncPostStatus(manager, current.post_id);
      await this.chat.reopenRoomWithinTransaction(
        manager,
        params.transactionId,
      );

      await manager.query(
        `
          INSERT INTO admin_audit_logs
            (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
          VALUES ($1, 'REOPEN_TRANSACTION', 'GIFT_TRANSACTION', $2, $3::jsonb, $4::jsonb, $5)
        `,
        [
          params.actorUserId,
          params.transactionId,
          JSON.stringify({ status: current.status }),
          JSON.stringify({ status: target }),
          params.reason,
        ],
      );

      return toSummary(reopened);
    });
  }

  public async markHandedOver(params: {
    transactionId: string;
    giverId: string;
    evidenceKeys: readonly string[];
  }): Promise<IGiftTransactionSummary> {
    return this.manager.transaction(async (manager) => {
      const current = await this.lockTransaction(manager, params.transactionId);

      // Chi nguoi tang bao duoc: chi ho biet mon do da roi tay minh chua.
      if (current.giver_id !== params.giverId)
        throw new GiftTransactionNotParticipantException();
      if (current.status !== 'ACCEPTED')
        throw new GiftTransactionInvalidStateException(current.status);

      const [updated] = await updateReturning<ITransactionRow>(
        manager,
        `
          UPDATE gift_transactions
          SET status = 'DELIVERING', handed_over_at = now()
          WHERE global_id = $1 AND status = 'ACCEPTED'
          RETURNING ${SelectColumns}
        `,
        [params.transactionId],
      );
      if (!updated)
        throw new GiftTransactionInvalidStateException(current.status);

      // Anh la TUY CHON. Thieu anh thi luot trao van di tiep, chi mat quyen
      // report ve sau. Chan o day la phat nguoi tang vi mot viec ho khong bat
      // buoc phai lam, va day luot trao vao tu-hoan-tat sau 5 ngay.
      if (params.evidenceKeys.length > 0)
        await this.attachEvidenceWithinTransaction(manager, {
          transactionId: params.transactionId,
          kind: GiftEvidenceKinds.HANDOVER,
          uploadedBy: params.giverId,
          storageKeys: params.evidenceKeys,
        });

      return toSummary(updated);
    });
  }

  public async attachEvidenceWithinTransaction(
    manager: EntityManager,
    params: IAttachGiftEvidenceParams,
  ): Promise<number> {
    const [taken] = await manager.query<{ used: string }[]>(
      `
        SELECT COUNT(*) AS used
        FROM gift_transaction_evidence
        WHERE transaction_id = $1 AND kind = $2
      `,
      [params.transactionId, params.kind],
    );

    let slot = Number(taken.used);
    let attached = 0;

    for (const storageKey of params.storageKeys) {
      // Qua tran thi BO phan thua, khong nem loi: nguoi dung chup bon tam khong
      // phai mot loi can chan ca thao tac trao do.
      if (slot >= MaxEvidencePerKind) break;
      slot += 1;

      await manager.query(
        `
          INSERT INTO gift_transaction_evidence
            (global_id, transaction_id, kind, slot, uploaded_by, storage_key)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
        `,
        [
          randomUUID(),
          params.transactionId,
          params.kind,
          slot,
          params.uploadedBy,
          storageKey,
        ],
      );
      attached += 1;
    }

    return attached;
  }

  public async listEvidence(
    transactionId: string,
  ): Promise<IGiftEvidenceRef[]> {
    const rows = await this.manager.query<
      {
        kind: GiftEvidenceKinds;
        slot: number | string;
        storage_key: string;
        uploaded_by: string;
        created_at: Date;
      }[]
    >(
      `
        SELECT kind, slot, storage_key, uploaded_by, created_at
        FROM gift_transaction_evidence
        WHERE transaction_id = $1
        ORDER BY kind, slot
      `,
      [transactionId],
    );

    return rows.map((row) => ({
      kind: row.kind,
      slot: Number(row.slot),
      storageKey: row.storage_key,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    }));
  }

  public async hasEvidence(
    transactionId: string,
    kind: GiftEvidenceKinds,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ count: string }[]>(
      `
        SELECT COUNT(*) AS count
        FROM gift_transaction_evidence
        WHERE transaction_id = $1 AND kind = $2
      `,
      [transactionId, kind],
    );
    return Number(row.count) > 0;
  }

  public async confirmReceipt(
    transactionId: string,
    receiverId: string,
    evidenceKeys: readonly string[] = [],
  ): Promise<IGiftTransactionSummary> {
    return this.manager.transaction(async (manager) => {
      const current = await this.lockTransaction(manager, transactionId);

      if (current.receiver_id !== receiverId)
        throw new GiftTransactionNotParticipantException();
      if (current.status !== 'ACCEPTED' && current.status !== 'DELIVERING')
        throw new GiftTransactionInvalidStateException(current.status);

      // `completed_at` là mốc mà bộ đếm hoạt động của rank đọc. Thiếu nó thì
      // lượt tặng này vô hình với rank.
      const [updated] = await updateReturning<ITransactionRow>(
        manager,
        `
          UPDATE gift_transactions
          SET status = 'COMPLETED', completed_at = now()
          WHERE global_id = $1
            AND status IN ('ACCEPTED', 'DELIVERING')
          RETURNING ${SelectColumns}
        `,
        [transactionId],
      );

      if (!updated) {
        throw new GiftTransactionInvalidStateException(current.status);
      }

      if (evidenceKeys.length > 0)
        await this.attachEvidenceWithinTransaction(manager, {
          transactionId,
          kind: GiftEvidenceKinds.RECEIPT,
          uploadedBy: receiverId,
          storageKeys: evidenceKeys,
        });

      await this.awardCompletionPoints(manager, current);

      // Lượt cuối cùng xong thì bài mới thực sự xong, và quota của tác giả được
      // trả lại. Thiếu dòng này thì bài đã tặng hết vẫn chiếm chỗ đăng bài mãi mãi.
      await this.syncPostStatus(manager, current.post_id);

      // Giao dịch xong thì phòng chuyển sang chỉ đọc (F38). KHÔNG xoá gì: hai
      // bên vẫn xem lại được địa chỉ và giờ hẹn, và lịch sử là bằng chứng khi
      // có tranh chấp hoặc report.
      await this.chat.lockRoomWithinTransaction(manager, transactionId);

      return toSummary(updated);
    });
  }

  public async close(
    params: ICloseGiftTransactionParams,
  ): Promise<ICloseGiftTransactionResult> {
    return this.manager.transaction(async (manager) => {
      const current = await this.lockTransaction(manager, params.transactionId);

      const isParticipant =
        current.giver_id === params.actorUserId ||
        current.receiver_id === params.actorUserId;
      if (!isParticipant) throw new GiftTransactionNotParticipantException();
      if (current.status === 'COMPLETED' || current.completed_at !== null)
        throw new GiftTransactionInvalidStateException(current.status);

      // Đã duyệt thì đã trừ tồn kho, nên huỷ phải TRẢ LẠI. Không trả là hàng
      // bốc hơi khỏi bài đăng mà không ai nhận được.
      if (current.status === 'ACCEPTED' || current.status === 'DELIVERING')
        await manager.query(
          `
            UPDATE posts
            SET remaining_quantity = remaining_quantity + $2
            WHERE global_id = $1 AND deleted_at IS NULL
          `,
          [current.post_id, Number(current.quantity)],
        );

      const [updated] = await updateReturning<ITransactionRow>(
        manager,
        `
          UPDATE gift_transactions
          SET status = $2, closed_at = now(), close_reason = $3, closed_by = $4
          WHERE global_id = $1
          RETURNING ${SelectColumns}
        `,
        [
          params.transactionId,
          params.status,
          params.reason,
          params.closedByUserId ?? params.actorUserId,
        ],
      );

      if (!updated) {
        throw new GiftTransactionInvalidStateException(current.status);
      }

      if (params.evidence && params.evidence.storageKeys.length > 0)
        await this.attachEvidenceWithinTransaction(manager, {
          transactionId: params.transactionId,
          kind: params.evidence.kind,
          uploadedBy: params.evidence.uploadedBy,
          storageKeys: params.evidence.storageKeys,
        });

      // Trả kho xong thì bài phải hiện lại để người khác xin được. Để nguyên
      // `RESERVED` là món đồ còn đó nhưng không ai chạm tới được.
      await this.syncPostStatus(manager, current.post_id);

      await this.chat.lockRoomWithinTransaction(manager, params.transactionId);

      const queue = await this.reopenStandbyQueue(manager, {
        postId: current.post_id,
        cancelledReceiverId: current.receiver_id,
      });

      return { transaction: toSummary(updated), queue };
    });
  }

  /**
   * Đưa ứng viên `STANDBY` trở lại `PENDING` sau khi một lượt trao bị đóng
   * (F33, F35).
   *
   * Yêu cầu của người vừa bị huỷ sang `CANCELLED` và KHÔNG quay lại hàng đợi:
   * họ đã được chọn một lần và lượt đó đổ. Để họ về `PENDING` là đẩy họ lên đầu
   * hàng lần nữa, vì thứ tự tính theo `queue_joined_at` cũ.
   *
   * Hàm này KHÔNG gửi thông báo và KHÔNG tự trao cho ai. Nó chỉ trả về đề xuất
   * để use case quyết định sau khi transaction commit.
   */
  private async reopenStandbyQueue(
    manager: EntityManager,
    params: { postId: string; cancelledReceiverId: string },
  ): Promise<IReopenedQueue> {
    await manager.query(
      `
        UPDATE gift_requests
        SET status = 'CANCELLED', updated_at = now()
        WHERE post_id = $1 AND requester_id = $2 AND status = 'ACCEPTED'
      `,
      [params.postId, params.cancelledReceiverId],
    );

    const reopened = await updateReturning<{ requester_id: string }>(
      manager,
      `
        UPDATE gift_requests
        SET status = 'PENDING', updated_at = now()
        WHERE post_id = $1 AND status = 'STANDBY' AND deleted_at IS NULL
        RETURNING requester_id
      `,
      [params.postId],
    );

    return {
      reopenedCount: reopened.length,
      candidates: await this.findCandidateMetrics(manager, params.postId),
    };
  }

  /**
   * Số đo của mọi ứng viên còn chờ xét trên một bài, trong MỘT truy vấn.
   *
   * Không xếp thứ tự ở đây: thứ tự ưu tiên do Admin cấu hình (CH-1), nên xếp
   * hạng là chính sách nghiệp vụ và nằm ở tầng application. Repository chỉ cấp
   * số liệu.
   *
   * `ORDER BY` chỉ để kết quả tất định giữa hai lần chạy giống nhau, không mang
   * ý nghĩa ưu tiên.
   */
  private async findCandidateMetrics(
    manager: EntityManager,
    postId: string,
  ): Promise<ICandidateMetrics[]> {
    const rows = await manager.query<
      {
        requester_id: string;
        queue_joined_at: Date;
        request_id: string;
        rank: string;
        distance_meters: string | null;
        received_count: string;
        cancellation_count: string;
      }[]
    >(
      `
        SELECT
          request.requester_id,
          request.queue_joined_at,
          request.id AS request_id,
          requester.rank,
          -- Khoảng cách từ Vị trí mặc định của người xin tới vị trí bài.
          -- NULL khi họ chưa đặt vị trí; tầng application xếp họ xuống cuối chứ
          -- KHÔNG coi như 0 mét.
          CASE
            WHEN requester.default_location IS NULL THEN NULL
            ELSE ST_Distance(requester.default_location, post.location)
          END AS distance_meters,
          (SELECT COUNT(*) FROM gift_transactions completed
            WHERE completed.receiver_id = request.requester_id
              AND completed.status = 'COMPLETED') AS received_count,
          (SELECT COUNT(*) FROM gift_transactions cancelled
            WHERE cancelled.closed_by = request.requester_id
              AND cancelled.status = 'CANCELLED') AS cancellation_count
        FROM gift_requests request
        -- Alias requester chứ không phải user: user là từ khoá reserved của
        -- Postgres, kể cả dạng AS user cũng là lỗi cú pháp.
        JOIN users requester ON requester.global_id = request.requester_id
        JOIN posts post ON post.global_id = request.post_id
        WHERE request.post_id = $1
          AND request.status = 'PENDING'
          AND request.deleted_at IS NULL
        ORDER BY request.queue_joined_at ASC, request.id ASC
      `,
      [postId],
    );

    return rows.map((row) => ({
      requesterId: row.requester_id,
      queueJoinedAt: row.queue_joined_at,
      requestId: Number(row.request_id),
      rank: row.rank as UserRanks,
      distanceMeters:
        row.distance_meters === null ? null : Number(row.distance_meters),
      receivedCount: Number(row.received_count),
      cancellationCount: Number(row.cancellation_count),
    }));
  }

  public async countClosedBy(
    userId: string,
    status: Extract<GiftTransactionStatuses, 'CANCELLED'>,
  ): Promise<number> {
    const [row] = await this.manager.query<{ total: string }[]>(
      `
        SELECT COUNT(*) AS total
        FROM gift_transactions
        WHERE closed_by = $1 AND status = $2
      `,
      [userId, status],
    );
    return Number(row.total);
  }

  public async completeDueDeliveries(olderThanDays: number): Promise<{
    completed: number;
    heldForDispute: number;
    completedTransactions: IGiftTransactionSummary[];
  }> {
    return this.manager.transaction(async (manager) => {
      // SKIP LOCKED để hai lần chạy song song không tranh cùng một lượt.
      const due = await manager.query<
        {
          global_id: string;
          post_id: string;
          giver_id: string;
          receiver_id: string;
        }[]
      >(
        `
          SELECT global_id, post_id, giver_id, receiver_id
          FROM gift_transactions
          WHERE status IN ('ACCEPTED', 'DELIVERING')
            -- Dem tu lan cuoi CO CHUYEN XAY RA, khong phai tu luc duyet: ship
            -- lien tinh 4-5 ngay thi dem tu accepted_at se dong luot trao
            -- truoc khi hang toi noi.
            AND COALESCE(handed_over_at, accepted_at)
                  <= now() - ($1 || ' days')::interval
          ORDER BY accepted_at ASC
          FOR UPDATE SKIP LOCKED
        `,
        [olderThanDays],
      );

      if (due.length === 0)
        return { completed: 0, heldForDispute: 0, completedTransactions: [] };

      // Giữ lại lượt đang có tranh chấp. Hai kênh, và cố ý CHỈ hai kênh này:
      //
      // - Báo xấu vào chính BÀI của lượt trao — nội dung bài là thứ đang bị
      //   nghi, nên không thể coi lượt trao là thành công.
      // - Báo xấu vào NGƯỜI TẶNG, do chính NGƯỜI NHẬN của lượt này gửi. Giới hạn
      //   ở người nhận là có chủ ý: một báo xấu bất kỳ nhắm vào người tặng sẽ
      //   khoá mọi lượt trao của họ, và đó là một đường phá hoại rẻ tiền.
      const disputed = await manager.query<{ global_id: string }[]>(
        `
          SELECT deal.global_id
          FROM gift_transactions deal
          WHERE deal.global_id = ANY($1::uuid[])
            AND EXISTS (
              SELECT 1 FROM reports open_report
              WHERE open_report.status IN ('PENDING', 'IN_REVIEW')
                AND (
                  (open_report.target_type = 'POST'
                   AND open_report.target_id = deal.post_id)
                  OR (open_report.target_type = 'USER'
                      AND open_report.target_id = deal.giver_id
                      AND open_report.reporter_user_id = deal.receiver_id)
                )
            )
        `,
        [due.map((row) => row.global_id)],
      );
      const heldIds = new Set(disputed.map((row) => row.global_id));
      const closable = due.filter((row) => !heldIds.has(row.global_id));

      if (closable.length === 0)
        return {
          completed: 0,
          heldForDispute: heldIds.size,
          completedTransactions: [],
        };

      await manager.query(
        `
          UPDATE gift_transactions
          SET status = 'COMPLETED', completed_at = now()
          WHERE global_id = ANY($1::uuid[])
            AND status IN ('ACCEPTED', 'DELIVERING')
        `,
        [closable.map((row) => row.global_id)],
      );

      // Tự hoàn tất cũng là hoàn tất, nên phòng chat cũng phải chuyển sang chỉ
      // đọc (F38). Thiếu chỗ này thì những lượt trao do cron đóng sẽ để lại
      // phòng vẫn gửi được tin — một cửa hậu chỉ lộ ra sau 5 ngày.
      for (const row of closable) {
        await this.chat.lockRoomWithinTransaction(manager, row.global_id);
        await this.syncPostStatus(manager, row.post_id);
        // Tự hoàn tất cũng là hoàn tất: không thưởng ở đây thì ai chờ cron đóng hộ
        // sẽ mất điểm so với người bấm xác nhận, dù hai lượt trao giống hệt nhau.
        await this.awardCompletionPoints(manager, row);
      }

      // Đọc lại SAU khi ghi: nơi gọi cần bản ghi đầy đủ để báo cho hai bên, và
      // `completed_at` chỉ có giá trị sau câu UPDATE ở trên. Đọc trước là gửi
      // thông báo mô tả một trạng thái chưa xảy ra.
      const closedRows = await manager.query<ITransactionRow[]>(
        `SELECT ${SelectColumns} FROM gift_transactions WHERE global_id = ANY($1::uuid[])`,
        [closable.map((row) => row.global_id)],
      );

      return {
        completed: closable.length,
        heldForDispute: heldIds.size,
        completedTransactions: closedRows.map(toSummary),
      };
    });
  }

  public async countCompletedByGiver(
    giverId: string,
    window?: { from: Date; to: Date },
  ): Promise<number> {
    const [row] = await this.manager.query<{ total: string }[]>(
      `
        SELECT COUNT(*) AS total
        FROM gift_transactions
        WHERE giver_id = $1
          AND status = 'COMPLETED'
          ${window ? 'AND completed_at >= $2 AND completed_at < $3' : ''}
      `,
      window ? [giverId, window.from, window.to] : [giverId],
    );

    return Number(row?.total ?? 0);
  }

  public async countOpenForUser(userId: string): Promise<number> {
    // Bắt cả hai vai: người đang chờ nhận hàng cũng đang dở dang như người
    // đang phải trao.
    const [row] = await this.manager.query<{ total: string }[]>(
      `
        SELECT COUNT(*) AS total
        FROM gift_transactions
        WHERE (giver_id = $1 OR receiver_id = $1)
          AND status IN ('REQUESTED', 'ACCEPTED', 'DELIVERING')
      `,
      [userId],
    );

    return Number(row?.total ?? 0);
  }

  public async closeOpenRequestsForPost(params: {
    postId: string;
    closedBy: string;
    reason: string;
  }): Promise<{ transactionId: string; receiverId: string }[]> {
    const rows = await updateReturning<{
      global_id: string;
      receiver_id: string;
    }>(
      this.manager,
      `
        UPDATE gift_transactions
        SET status = 'CANCELLED',
            closed_at = now(),
            -- closed_by bắt buộc đi kèm closed_at: ràng buộc
            -- CHK_gift_transactions_closed_pairing ở database, và nó đúng —
            -- một lượt đóng mà không biết ai đóng thì tra lại được gì.
            closed_by = $2,
            close_reason = $3
        WHERE post_id = $1 AND status = 'REQUESTED'
        RETURNING global_id, receiver_id
      `,
      [params.postId, params.closedBy, params.reason],
    );

    return rows.map((row) => ({
      transactionId: row.global_id,
      receiverId: row.receiver_id,
    }));
  }

  public async isReceiverOfPost(
    postId: string,
    receiverId: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ count: string }[]>(
      `
        SELECT COUNT(*) AS count
        FROM gift_transactions
        WHERE post_id = $1
          AND receiver_id = $2
          AND status IN ('ACCEPTED', 'DELIVERING', 'COMPLETED')
      `,
      [postId, receiverId],
    );

    return Number(row?.count ?? 0) > 0;
  }

  private async lockTransaction(
    manager: EntityManager,
    transactionId: string,
  ): Promise<ITransactionRow> {
    const [row] = await manager.query<ITransactionRow[]>(
      `
        SELECT ${SelectColumns}
        FROM gift_transactions
        WHERE global_id = $1
        FOR UPDATE
      `,
      [transactionId],
    );

    if (!row) throw new GiftTransactionNotFoundException();
    return row;
  }
}
