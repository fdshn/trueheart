import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';
import { CandidateSelectionCriteria, UserRanks } from '../../consts';
import { CandidateSelectionReason } from '../../models/candidate-selection';

/**
 * Lý do hệ thống tự chọn người nhận (PR #46 §9) — đọc từ `recipient_selection_audits`.
 *
 * Hai mức nhìn:
 * - **Admin** thấy đủ: thứ tự tiêu chí, số đo người thắng và người về nhì tại thời điểm chọn.
 * - **Hai bên trong lượt trao** chỉ thấy lý do và số ứng viên — số đo của người về nhì là dữ
 *   liệu của một người khác, không phải của họ.
 */
export type RecipientSelectionTrigger = 'AUTOMATIC';

/** Số đo một ứng viên LÚC chọn — không phải số đo hiện tại của họ. */
export interface IRecipientSelectionCandidateDto {
  requesterId: string;
  /** `null` khi tài khoản đã xoá. */
  username: string | null;
  /** Yêu cầu xin nhận của ứng viên; `null` ở dòng audit cũ không lưu. */
  requestId: string | null;
  queueJoinedAt: string | null;
  rank: UserRanks | null;
  /** `null` khi ứng viên chưa đặt Vị trí mặc định. */
  distanceMeters: number | null;
  receivedCount: number | null;
  cancellationCount: number | null;
}

export interface IAdminRecipientSelectionItemDto {
  transactionId: string;
  postId: string;
  postTitle: string | null;
  /** Người được chọn. */
  requesterId: string;
  requesterUsername: string | null;
  decidingCriterion: CandidateSelectionReason;
  reasonLabel: string;
  candidateCount: number;
  /** Trạng thái HIỆN TẠI của lượt trao — để biết lượt tự chọn đó rồi ra sao. */
  transactionStatus: string;
  selectedAt: string;
}

export interface IAdminRecipientSelectionDetailDto extends IAdminRecipientSelectionItemDto {
  trigger: RecipientSelectionTrigger;
  /** Thứ tự tiêu chí ĐÃ dùng (đã chuẩn hoá), không phải cấu hình hiện tại. */
  criteriaOrder: { criterion: CandidateSelectionCriteria; label: string }[];
  winner: IRecipientSelectionCandidateDto;
  /** `null` khi chỉ có một ứng viên. */
  runnerUp: IRecipientSelectionCandidateDto | null;
  postAuthorId: string | null;
  postAuthorUsername: string | null;
}

export interface IListAdminRecipientSelectionsQueryDto {
  postId?: string;
  /** Khớp người được chọn HOẶC chủ bài. */
  userId?: string;
  decidingCriterion?: CandidateSelectionReason;
  /** ISO 8601; lọc theo thời điểm chọn, `[from, to)`. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface IListAdminRecipientSelectionsResponseDto {
  selections: IAdminRecipientSelectionItemDto[];
  meta: IPaginationMetaDto;
}

export interface IAdminRecipientSelectionParamsDto {
  transactionId: string;
}

export interface IGetAdminRecipientSelectionResponseDto {
  /** `null` khi lượt trao có thật nhưng do chủ bài tự chọn — không có lý do nào để ghi. */
  selection: IAdminRecipientSelectionDetailDto | null;
}

/** Bản cho người cho / người nhận của lượt trao. */
export interface ITransactionSelectionReasonDto {
  trigger: RecipientSelectionTrigger;
  decidingCriterion: CandidateSelectionReason;
  reasonLabel: string;
  candidateCount: number;
  selectedAt: string;
}

export interface IGetTransactionSelectionReasonResponseDto {
  /** `null` khi chủ bài tự chọn người nhận. */
  selection: ITransactionSelectionReasonDto | null;
}
