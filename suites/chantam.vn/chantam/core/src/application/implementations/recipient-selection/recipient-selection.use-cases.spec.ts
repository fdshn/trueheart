import { GiftTransactionNotFoundException } from '@/domain/exceptions';
import { IRecipientSelectionAuditRecord } from '@/domain/ports/repository';
import {
  CandidateSelectionCriteria,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  GetAdminRecipientSelectionUseCase,
  GetTransactionSelectionReasonUseCase,
  ListAdminRecipientSelectionsUseCase,
} from './recipient-selection.use-cases';

const Admin = 'admin-1';
const Giver = '10000000-0000-4000-8000-000000000001';
const Receiver = '20000000-0000-4000-8000-000000000002';
const RunnerUp = '30000000-0000-4000-8000-000000000003';
const Deal = '40000000-0000-4000-8000-000000000004';

function record(
  overrides: Partial<IRecipientSelectionAuditRecord> = {},
): IRecipientSelectionAuditRecord {
  return {
    transactionId: Deal,
    postId: '50000000-0000-4000-8000-000000000005',
    postTitle: 'Nồi cơm điện',
    postAuthorId: Giver,
    postAuthorUsername: 'nguoi-tang',
    requesterId: Receiver,
    requesterUsername: 'nguoi-nhan',
    trigger: 'AUTOMATIC',
    decidingCriterion: CandidateSelectionCriteria.NEAREST,
    criteriaOrder: [
      CandidateSelectionCriteria.NEAREST,
      CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST,
    ],
    winner: {
      requesterId: Receiver,
      username: 'nguoi-nhan',
      requestId: 'req-1',
      queueJoinedAt: '2026-10-01T00:00:00.000Z',
      rank: UserRanks.MEMBER,
      distanceMeters: 300,
      receivedCount: 1,
      cancellationCount: 0,
    },
    runnerUp: {
      requesterId: RunnerUp,
      username: 'nguoi-ve-nhi',
      requestId: 'req-2',
      queueJoinedAt: '2026-09-30T00:00:00.000Z',
      rank: UserRanks.GOLD,
      distanceMeters: 4_000,
      receivedCount: 0,
      cancellationCount: 0,
    },
    candidateCount: 3,
    transactionStatus: 'ACCEPTED',
    giverId: Giver,
    receiverId: Receiver,
    selectedAt: new Date('2026-10-08T00:00:00.000Z'),
    ...overrides,
  };
}

const permissions = (granted: boolean) => ({
  hasPermission: jest.fn().mockResolvedValue(granted),
});

describe('ListAdminRecipientSelectionsUseCase', () => {
  it('đòi post.read', async () => {
    const audits = { listForAdmin: jest.fn() };

    await expect(
      new ListAdminRecipientSelectionsUseCase(
        permissions(false) as never,
        audits as never,
      ).handle({ actorUserId: Admin }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audits.listForAdmin).not.toHaveBeenCalled();
  });

  it('chuyển bộ lọc, phân trang và trả câu giải thích dựng sẵn', async () => {
    const audits = {
      listForAdmin: jest
        .fn()
        .mockResolvedValue({ items: [record()], total: 41 }),
    };
    const granted = permissions(true);

    const result = await new ListAdminRecipientSelectionsUseCase(
      granted as never,
      audits as never,
    ).handle({
      actorUserId: Admin,
      userId: Receiver,
      decidingCriterion: CandidateSelectionCriteria.NEAREST,
      from: '2026-10-01T00:00:00.000Z',
      page: 3,
      pageSize: 20,
    });

    expect(granted.hasPermission).toHaveBeenCalledWith(Admin, 'post.read');
    expect(audits.listForAdmin).toHaveBeenCalledWith({
      postId: null,
      userId: Receiver,
      decidingCriterion: 'NEAREST',
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: null,
      skip: 40,
      take: 20,
    });
    expect(result.meta).toMatchObject({ page: 3, total: 41 });
    expect(result.selections[0]).toEqual({
      transactionId: Deal,
      postId: '50000000-0000-4000-8000-000000000005',
      postTitle: 'Nồi cơm điện',
      requesterId: Receiver,
      requesterUsername: 'nguoi-nhan',
      decidingCriterion: 'NEAREST',
      reasonLabel: 'Ở gần điểm hẹn nhất trong các ứng viên',
      candidateCount: 3,
      transactionStatus: 'ACCEPTED',
      selectedAt: '2026-10-08T00:00:00.000Z',
    });
  });

  it('from sau to: 400', async () => {
    await expect(
      new ListAdminRecipientSelectionsUseCase(
        permissions(true) as never,
        { listForAdmin: jest.fn() } as never,
      ).handle({
        actorUserId: Admin,
        from: '2026-10-10T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});

describe('GetAdminRecipientSelectionUseCase', () => {
  const make = (
    audit: IRecipientSelectionAuditRecord | null,
    dealExists = true,
  ) =>
    new GetAdminRecipientSelectionUseCase(
      permissions(true) as never,
      { findByTransactionId: jest.fn().mockResolvedValue(audit) } as never,
      {
        findByGlobalId: jest
          .fn()
          .mockResolvedValue(dealExists ? { globalId: Deal } : null),
      } as never,
    );

  it('đủ chi tiết: thứ tự tiêu chí có nhãn, số đo người thắng và người về nhì', async () => {
    const { selection } = await make(record()).handle({
      actorUserId: Admin,
      transactionId: Deal,
    });

    expect(selection?.criteriaOrder).toEqual([
      { criterion: 'NEAREST', label: 'Gần điểm hẹn nhất' },
      { criterion: 'QUEUE_JOINED_EARLIEST', label: 'Xin sớm nhất' },
    ]);
    expect(selection?.winner.distanceMeters).toBe(300);
    expect(selection?.runnerUp?.username).toBe('nguoi-ve-nhi');
    expect(selection?.postAuthorUsername).toBe('nguoi-tang');
    expect(selection?.trigger).toBe('AUTOMATIC');
  });

  it('lượt trao có thật nhưng chủ bài tự chọn: selection null', async () => {
    expect(
      await make(null).handle({ actorUserId: Admin, transactionId: Deal }),
    ).toEqual({ selection: null });
  });

  it('lượt trao không tồn tại: 404', async () => {
    await expect(
      make(null, false).handle({ actorUserId: Admin, transactionId: Deal }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });
});

describe('GetTransactionSelectionReasonUseCase', () => {
  const make = (
    audit: IRecipientSelectionAuditRecord | null,
    deal: object | null = {
      globalId: Deal,
      giverId: Giver,
      receiverId: Receiver,
    },
  ) =>
    new GetTransactionSelectionReasonUseCase(
      { findByGlobalId: jest.fn().mockResolvedValue(deal) } as never,
      { findByTransactionId: jest.fn().mockResolvedValue(audit) } as never,
    );

  it.each([Giver, Receiver])(
    'người trong cuộc (%s) thấy lý do — không thấy số đo của người về nhì',
    async (userId) => {
      const result = await make(record()).handle({
        userId,
        transactionId: Deal,
      });

      expect(result).toEqual({
        selection: {
          trigger: 'AUTOMATIC',
          decidingCriterion: 'NEAREST',
          reasonLabel: 'Ở gần điểm hẹn nhất trong các ứng viên',
          candidateCount: 3,
          selectedAt: '2026-10-08T00:00:00.000Z',
        },
      });
      expect(JSON.stringify(result)).not.toContain(RunnerUp);
      expect(JSON.stringify(result)).not.toContain('nguoi-ve-nhi');
    },
  );

  it('chủ bài tự chọn: selection null', async () => {
    expect(
      await make(null).handle({ userId: Giver, transactionId: Deal }),
    ).toEqual({
      selection: null,
    });
  });

  it('người ngoài: 404, không phải 403 — không xác nhận lượt trao có thật', async () => {
    await expect(
      make(record()).handle({ userId: RunnerUp, transactionId: Deal }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });
});
