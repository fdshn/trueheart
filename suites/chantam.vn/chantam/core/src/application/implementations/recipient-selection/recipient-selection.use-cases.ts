import {
  IGetAdminRecipientSelectionCommand,
  IGetAdminRecipientSelectionUseCase,
  IGetTransactionSelectionReasonCommand,
  IGetTransactionSelectionReasonUseCase,
  IListAdminRecipientSelectionsCommand,
  IListAdminRecipientSelectionsUseCase,
} from '@/application/contracts/recipient-selection';
import { GiftTransactionNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IGiftTransactionRepository,
  IRecipientSelectionAuditRecord,
  IRecipientSelectionAuditRepository,
  IRecipientSelectionCandidateRecord,
} from '@/domain/ports/repository';
import {
  IAdminRecipientSelectionDetailDto,
  IAdminRecipientSelectionItemDto,
  IGetAdminRecipientSelectionResponseDto,
  IGetTransactionSelectionReasonResponseDto,
  IListAdminRecipientSelectionsResponseDto,
  IRecipientSelectionCandidateDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  CandidateSelectionCriterionLabels,
  CandidateSelectionReasonLabels,
} from '@chantam.vn/chantam.core-lib/models';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Lý do tự chọn người nhận gắn với lượt trao, nên đọc cùng quyền với đọc lượt trao quản trị
 * (`GET /admin/transactions`).
 */
const ReadPermission = 'post.read';

async function assertCanRead(
  permissions: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  if (!(await permissions.hasPermission(actorUserId, ReadPermission)))
    throw new ForbiddenException();
}

function toItem(
  record: IRecipientSelectionAuditRecord,
): IAdminRecipientSelectionItemDto {
  return {
    transactionId: record.transactionId,
    postId: record.postId,
    postTitle: record.postTitle,
    requesterId: record.requesterId,
    requesterUsername: record.requesterUsername,
    decidingCriterion: record.decidingCriterion,
    reasonLabel: CandidateSelectionReasonLabels[record.decidingCriterion],
    candidateCount: record.candidateCount,
    transactionStatus: record.transactionStatus,
    selectedAt: record.selectedAt.toISOString(),
  };
}

const toCandidate = (
  candidate: IRecipientSelectionCandidateRecord,
): IRecipientSelectionCandidateDto => ({ ...candidate });

function toDetail(
  record: IRecipientSelectionAuditRecord,
): IAdminRecipientSelectionDetailDto {
  return {
    ...toItem(record),
    trigger: record.trigger,
    criteriaOrder: record.criteriaOrder.map((criterion) => ({
      criterion,
      label: CandidateSelectionCriterionLabels[criterion],
    })),
    winner: toCandidate(record.winner),
    runnerUp: record.runnerUp ? toCandidate(record.runnerUp) : null,
    postAuthorId: record.postAuthorId,
    postAuthorUsername: record.postAuthorUsername,
  };
}

function parseInstant(field: string, value: string | undefined): Date | null {
  if (value === undefined) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new ValidationFailedException([
      `${field}: phải là thời điểm ISO 8601`,
    ]);
  return parsed;
}

/** Danh sách lượt trao do hệ thống tự chọn, có bộ lọc (PR #46 §9). Mới nhất trước. */
@Injectable()
export class ListAdminRecipientSelectionsUseCase implements IListAdminRecipientSelectionsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IRecipientSelectionAuditRepository)
    private readonly audits: IRecipientSelectionAuditRepository,
  ) {}

  public async handle(
    command: IListAdminRecipientSelectionsCommand,
  ): Promise<IListAdminRecipientSelectionsResponseDto> {
    await assertCanRead(this.permissions, command.actorUserId);

    const from = parseInstant('from', command.from);
    const to = parseInstant('to', command.to);
    if (from && to && from >= to)
      throw new ValidationFailedException(['from: phải trước to']);

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.audits.listForAdmin({
      postId: command.postId ?? null,
      userId: command.userId ?? null,
      decidingCriterion: command.decidingCriterion ?? null,
      from,
      to,
      skip,
      take,
    });

    return {
      selections: items.map(toItem),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

/**
 * Chi tiết một lượt tự chọn cho Admin: đủ để trả lời "vì sao lại là người này" — thứ tự tiêu
 * chí đã dùng và số đo người thắng, người về nhì TẠI LÚC chọn.
 */
@Injectable()
export class GetAdminRecipientSelectionUseCase implements IGetAdminRecipientSelectionUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IRecipientSelectionAuditRepository)
    private readonly audits: IRecipientSelectionAuditRepository,
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: IGetAdminRecipientSelectionCommand,
  ): Promise<IGetAdminRecipientSelectionResponseDto> {
    await assertCanRead(this.permissions, command.actorUserId);

    const audit = await this.audits.findByTransactionId(command.transactionId);
    if (audit) return { selection: toDetail(audit) };

    // Không có dòng audit: hoặc lượt trao không tồn tại (404), hoặc chủ bài tự chọn — khi đó
    // không có lý do nào của hệ thống để kể.
    if (!(await this.transactions.findByGlobalId(command.transactionId)))
      throw new GiftTransactionNotFoundException();
    return { selection: null };
  }
}

/**
 * "Vì sao tôi được chọn / vì sao hệ thống chọn người này" cho HAI BÊN của lượt trao.
 *
 * Chỉ lý do và số ứng viên. Số đo của người về nhì là dữ liệu của một người thứ ba; số đo của
 * chính người nhận (khoảng cách, số lần huỷ) cũng không cần cho người cho biết. Người ngoài
 * nhận 404 như `GET /transactions/:transactionId`.
 */
@Injectable()
export class GetTransactionSelectionReasonUseCase implements IGetTransactionSelectionReasonUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IRecipientSelectionAuditRepository)
    private readonly audits: IRecipientSelectionAuditRepository,
  ) {}

  public async handle(
    command: IGetTransactionSelectionReasonCommand,
  ): Promise<IGetTransactionSelectionReasonResponseDto> {
    const transaction = await this.transactions.findByGlobalId(
      command.transactionId,
    );
    if (
      !transaction ||
      (transaction.giverId !== command.userId &&
        transaction.receiverId !== command.userId)
    )
      throw new GiftTransactionNotFoundException();

    const audit = await this.audits.findByTransactionId(command.transactionId);
    if (!audit) return { selection: null };

    return {
      selection: {
        trigger: audit.trigger,
        decidingCriterion: audit.decidingCriterion,
        reasonLabel: CandidateSelectionReasonLabels[audit.decidingCriterion],
        candidateCount: audit.candidateCount,
        selectedAt: audit.selectedAt.toISOString(),
      },
    };
  }
}
