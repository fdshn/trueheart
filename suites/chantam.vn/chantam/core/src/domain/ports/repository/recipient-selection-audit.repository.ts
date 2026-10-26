import {
  CandidateSelectionCriteria,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { CandidateSelectionReason } from '@chantam.vn/chantam.core-lib/models';

/** Số đo một ứng viên như đã lưu trong jsonb lúc chọn, kèm username tra lúc đọc. */
export interface IRecipientSelectionCandidateRecord {
  requesterId: string;
  username: string | null;
  requestId: string | null;
  queueJoinedAt: string | null;
  rank: UserRanks | null;
  distanceMeters: number | null;
  receivedCount: number | null;
  cancellationCount: number | null;
}

export interface IRecipientSelectionAuditRecord {
  transactionId: string;
  postId: string;
  postTitle: string | null;
  postAuthorId: string | null;
  postAuthorUsername: string | null;
  requesterId: string;
  requesterUsername: string | null;
  trigger: 'AUTOMATIC';
  decidingCriterion: CandidateSelectionReason;
  criteriaOrder: CandidateSelectionCriteria[];
  winner: IRecipientSelectionCandidateRecord;
  runnerUp: IRecipientSelectionCandidateRecord | null;
  candidateCount: number;
  transactionStatus: string;
  /** Hai bên của lượt trao — để kiểm người gọi có trong cuộc không. */
  giverId: string;
  receiverId: string;
  selectedAt: Date;
}

/**
 * Đọc bảng `recipient_selection_audits` (PR #46 §9). Ghi chỉ ở MỘT chỗ — trong transaction
 * của `IGiftRequestRepository.acceptRequest` — nên port này chỉ có phép đọc.
 */
export interface IRecipientSelectionAuditRepository {
  listForAdmin(params: {
    postId: string | null;
    userId: string | null;
    decidingCriterion: CandidateSelectionReason | null;
    from: Date | null;
    to: Date | null;
    skip: number;
    take: number;
  }): Promise<{ items: IRecipientSelectionAuditRecord[]; total: number }>;

  findByTransactionId(
    transactionId: string,
  ): Promise<IRecipientSelectionAuditRecord | null>;
}

export const IRecipientSelectionAuditRepository = Symbol(
  'IRecipientSelectionAuditRepository',
);
