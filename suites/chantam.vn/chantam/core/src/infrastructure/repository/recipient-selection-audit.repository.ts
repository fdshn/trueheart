import {
  IRecipientSelectionAuditRecord,
  IRecipientSelectionAuditRepository,
  IRecipientSelectionCandidateRecord,
} from '@/domain/ports/repository';
import { CandidateSelectionCriteria } from '@chantam.vn/chantam.core-lib/consts';
import { CandidateSelectionReason } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IAuditRow {
  transaction_id: string;
  post_id: string;
  post_title: string | null;
  post_author_id: string | null;
  post_author_username: string | null;
  requester_id: string;
  requester_username: string | null;
  trigger: 'AUTOMATIC';
  deciding_criterion: CandidateSelectionReason;
  criteria_order: CandidateSelectionCriteria[];
  winner_metrics: Record<string, unknown>;
  runner_up_metrics: Record<string, unknown> | null;
  runner_up_username: string | null;
  candidate_count: number;
  transaction_status: string;
  giver_id: string;
  receiver_id: string;
  created_at: Date;
}

/**
 * Một câu cho cả danh sách lẫn chi tiết. JOIN chứ không câu con: mọi dòng audit đều có lượt
 * trao (FK), và bài/tài khoản LEFT JOIN vì có thể đã xoá — audit phải đọc được sau đó.
 */
const AuditSelect = `
  SELECT audit.transaction_id, audit.post_id, post.title AS post_title,
         post.author_id AS post_author_id, author.username AS post_author_username,
         audit.requester_id, requester.username AS requester_username,
         audit.trigger, audit.deciding_criterion, audit.criteria_order,
         audit.winner_metrics, audit.runner_up_metrics,
         runner_up.username AS runner_up_username,
         audit.candidate_count, deal.status AS transaction_status,
         deal.giver_id, deal.receiver_id, audit.created_at
    FROM recipient_selection_audits audit
    JOIN gift_transactions deal ON deal.global_id = audit.transaction_id
    LEFT JOIN posts post ON post.global_id = audit.post_id
    LEFT JOIN users author ON author.global_id = post.author_id
    LEFT JOIN users requester ON requester.global_id = audit.requester_id
    LEFT JOIN users runner_up
           ON runner_up.global_id::text = audit.runner_up_metrics ->> 'requesterId'`;

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

function toCandidate(
  metrics: Record<string, unknown>,
  username: string | null,
): IRecipientSelectionCandidateRecord {
  return {
    requesterId: String(metrics.requesterId),
    username,
    // `requestGlobalId` là id công khai của yêu cầu; `requestId` trong jsonb là khoá số nội
    // bộ dùng phá thế hoà — không đưa ra ngoài.
    requestId:
      typeof metrics.requestGlobalId === 'string'
        ? metrics.requestGlobalId
        : null,
    queueJoinedAt:
      typeof metrics.queueJoinedAt === 'string' ? metrics.queueJoinedAt : null,
    rank: typeof metrics.rank === 'string' ? (metrics.rank as never) : null,
    distanceMeters: numberOrNull(metrics.distanceMeters),
    receivedCount: numberOrNull(metrics.receivedCount),
    cancellationCount: numberOrNull(metrics.cancellationCount),
  };
}

function toRecord(row: IAuditRow): IRecipientSelectionAuditRecord {
  return {
    transactionId: row.transaction_id,
    postId: row.post_id,
    postTitle: row.post_title,
    postAuthorId: row.post_author_id,
    postAuthorUsername: row.post_author_username,
    requesterId: row.requester_id,
    requesterUsername: row.requester_username,
    trigger: row.trigger,
    decidingCriterion: row.deciding_criterion,
    criteriaOrder: row.criteria_order,
    winner: toCandidate(row.winner_metrics, row.requester_username),
    runnerUp: row.runner_up_metrics
      ? toCandidate(row.runner_up_metrics, row.runner_up_username)
      : null,
    candidateCount: row.candidate_count,
    transactionStatus: row.transaction_status,
    giverId: row.giver_id,
    receiverId: row.receiver_id,
    selectedAt: row.created_at,
  };
}

@Injectable()
export class RecipientSelectionAuditRepository implements IRecipientSelectionAuditRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async listForAdmin(params: {
    postId: string | null;
    userId: string | null;
    decidingCriterion: CandidateSelectionReason | null;
    from: Date | null;
    to: Date | null;
    skip: number;
    take: number;
  }): Promise<{ items: IRecipientSelectionAuditRecord[]; total: number }> {
    // Mỗi bộ lọc là một tham số có kiểu riêng, `NULL` nghĩa là không lọc — không dùng lại
    // cùng một `$n` với hai kiểu (42P08).
    const where = `
      WHERE ($1::uuid IS NULL OR audit.post_id = $1::uuid)
        AND ($2::uuid IS NULL OR audit.requester_id = $2::uuid OR post.author_id = $2::uuid)
        AND ($3::text IS NULL OR audit.deciding_criterion = $3::text)
        AND ($4::timestamptz IS NULL OR audit.created_at >= $4::timestamptz)
        AND ($5::timestamptz IS NULL OR audit.created_at < $5::timestamptz)`;
    const filters = [
      params.postId,
      params.userId,
      params.decidingCriterion,
      params.from,
      params.to,
    ];

    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total
         FROM recipient_selection_audits audit
         LEFT JOIN posts post ON post.global_id = audit.post_id
       ${where}`,
      filters,
    );
    const rows = await this.manager.query<IAuditRow[]>(
      `${AuditSelect}
       ${where}
       ORDER BY audit.created_at DESC, audit.transaction_id DESC
       LIMIT $6 OFFSET $7`,
      [...filters, params.take, params.skip],
    );

    return {
      items: rows.map(toRecord),
      total: Number(counted?.total ?? 0),
    };
  }

  public async findByTransactionId(
    transactionId: string,
  ): Promise<IRecipientSelectionAuditRecord | null> {
    const [row] = await this.manager.query<IAuditRow[]>(
      `${AuditSelect} WHERE audit.transaction_id = $1`,
      [transactionId],
    );
    return row ? toRecord(row) : null;
  }
}
