import {
  GiftTransactionDuplicateRequestException,
  GiftTransactionInvalidStateException,
  GiftTransactionNotFoundException,
  GiftTransactionNotParticipantException,
  GiftTransactionOutOfStockException,
} from '@/domain/exceptions';
import {
  GiftTransactionStatuses,
  IChatRepository,
  ICloseGiftTransactionParams,
  IGiftTransactionRepository,
  IGiftTransactionSummary,
  IRequestGiftParams,
} from '@/domain/ports/repository';
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
  completed_at: Date | null;
}

const SelectColumns = `
  global_id, post_id, giver_id, receiver_id, quantity, status,
  requested_at, accepted_at, completed_at
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
  ) {}

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

  public async request(
    params: IRequestGiftParams,
  ): Promise<IGiftTransactionSummary> {
    return this.manager.transaction(async (manager) => {
      // Tác giả bài là người tặng; lấy từ bài chứ không nhận từ client.
      const [post] = await manager.query<
        { author_id: string; status: string; remaining_quantity: number }[]
      >(
        `
          SELECT author_id, status, remaining_quantity
          FROM posts
          WHERE global_id = $1 AND deleted_at IS NULL
        `,
        [params.postId],
      );

      if (!post) throw new GiftTransactionNotFoundException();
      if (post.status !== 'PUBLISHED')
        throw new GiftTransactionInvalidStateException(post.status);
      if (Number(post.remaining_quantity) < params.quantity)
        throw new GiftTransactionOutOfStockException();
      // Xin đồ của chính mình là đường farm hoạt động rẻ nhất.
      if (post.author_id === params.receiverId)
        throw new GiftTransactionNotParticipantException();

      const inserted = await manager.query<ITransactionRow[]>(
        `
          INSERT INTO gift_transactions
            (global_id, post_id, giver_id, receiver_id, quantity)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
          RETURNING ${SelectColumns}
        `,
        [
          params.globalId,
          params.postId,
          post.author_id,
          params.receiverId,
          params.quantity,
        ],
      );

      // Trùng với index một-yêu-cầu-đang-mở, không phải lỗi hệ thống.
      if (inserted.length === 0)
        throw new GiftTransactionDuplicateRequestException();

      return toSummary(inserted[0]);
    });
  }

  public async accept(
    transactionId: string,
    giverId: string,
  ): Promise<IGiftTransactionSummary> {
    return this.manager.transaction(async (manager) => {
      const current = await this.lockTransaction(manager, transactionId);

      if (current.giver_id !== giverId)
        throw new GiftTransactionNotParticipantException();
      if (current.status !== 'REQUESTED')
        throw new GiftTransactionInvalidStateException(current.status);

      // Trừ tồn kho NGUYÊN TỬ. Đọc remaining rồi mới ghi thì hai người duyệt
      // cùng lúc sẽ phát vượt số lượng thật — README của repo cảnh báo đúng chỗ
      // này.
      const decremented = await updateReturning<{ global_id: string }>(
        manager,
        `
          UPDATE posts
          SET remaining_quantity = remaining_quantity - $2
          WHERE global_id = $1
            AND deleted_at IS NULL
            AND remaining_quantity >= $2
          RETURNING global_id
        `,
        [current.post_id, Number(current.quantity)],
      );

      // Mệnh đề `remaining_quantity >= $2` là thứ duy nhất chặn phát vượt kho,
      // nên đọc đúng số dòng nó khớp mới biết được là hết hàng.
      if (decremented.length === 0)
        throw new GiftTransactionOutOfStockException();

      const [updated] = await updateReturning<ITransactionRow>(
        manager,
        `
          UPDATE gift_transactions
          SET status = 'ACCEPTED', accepted_at = now()
          WHERE global_id = $1 AND status = 'REQUESTED'
          RETURNING ${SelectColumns}
        `,
        [transactionId],
      );

      if (!updated) {
        throw new GiftTransactionInvalidStateException(current.status);
      }

      // Mở phòng chat trong CÙNG transaction (F34): duyệt xong mà chat chưa mở
      // thì hai bên không có đường liên lạc để hẹn trao đồ.
      await this.chat.openRoomWithinTransaction(manager, {
        globalId: randomUUID(),
        transactionId,
        postId: current.post_id,
        giverId: current.giver_id,
        receiverId: current.receiver_id,
      });

      return toSummary(updated);
    });
  }

  public async confirmReceipt(
    transactionId: string,
    receiverId: string,
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

      // Giao dịch xong thì phòng chuyển sang chỉ đọc (F38). KHÔNG xoá gì: hai
      // bên vẫn xem lại được địa chỉ và giờ hẹn, và lịch sử là bằng chứng khi
      // có tranh chấp hoặc report.
      await this.chat.lockRoomWithinTransaction(manager, transactionId);

      return toSummary(updated);
    });
  }

  public async close(
    params: ICloseGiftTransactionParams,
  ): Promise<IGiftTransactionSummary> {
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
          SET status = $2, closed_at = now(), close_reason = $3
          WHERE global_id = $1
          RETURNING ${SelectColumns}
        `,
        [params.transactionId, params.status, params.reason],
      );

      if (!updated) {
        throw new GiftTransactionInvalidStateException(current.status);
      }

      await this.chat.lockRoomWithinTransaction(manager, params.transactionId);

      return toSummary(updated);
    });
  }

  public async completeDueDeliveries(olderThanDays: number): Promise<number> {
    return this.manager.transaction(async (manager) => {
      // SKIP LOCKED để hai lần chạy song song không tranh cùng một lượt.
      const due = await manager.query<{ global_id: string }[]>(
        `
          SELECT global_id
          FROM gift_transactions
          WHERE status IN ('ACCEPTED', 'DELIVERING')
            AND accepted_at <= now() - ($1 || ' days')::interval
          ORDER BY accepted_at ASC
          FOR UPDATE SKIP LOCKED
        `,
        [olderThanDays],
      );

      if (due.length === 0) return 0;

      await manager.query(
        `
          UPDATE gift_transactions
          SET status = 'COMPLETED', completed_at = now()
          WHERE global_id = ANY($1::uuid[])
            AND status IN ('ACCEPTED', 'DELIVERING')
        `,
        [due.map((row) => row.global_id)],
      );

      // Tự hoàn tất cũng là hoàn tất, nên phòng chat cũng phải chuyển sang chỉ
      // đọc (F38). Thiếu chỗ này thì những lượt trao do cron đóng sẽ để lại
      // phòng vẫn gửi được tin — một cửa hậu chỉ lộ ra sau 5 ngày.
      for (const row of due)
        await this.chat.lockRoomWithinTransaction(manager, row.global_id);

      return due.length;
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
