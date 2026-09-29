import { PointRuleUnavailableException } from '@/domain/exceptions';
import { IPointLedgerRepository } from '@/domain/ports/repository';
import {
  ContentViolationPenaltyRuleCode,
  GiftPostStatuses,
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { ReportRepository } from './report.repository';

const ActorId = '11111111-1111-4111-8111-111111111111';
const ReportId = '22222222-2222-4222-8222-222222222222';
const PostId = '33333333-3333-4333-8333-333333333333';
const AuthorId = '44444444-4444-4444-8444-444444444444';

function setup() {
  const query = jest.fn();
  const transactionManager = { query };
  const manager = {
    query,
    transaction: jest.fn(
      async (
        work: (transaction: typeof transactionManager) => Promise<unknown>,
      ) => work(transactionManager),
    ),
  };
  const ledger = {
    appendByRuleWithinTransaction: jest.fn().mockResolvedValue({
      entryId: 1,
      delta: -50,
      balance: 0,
      rawBalance: -50,
      lifetime: 0,
      applied: true,
    }),
  } as unknown as jest.Mocked<IPointLedgerRepository>;
  const repository = new ReportRepository(
    {} as never,
    manager as never,
    ledger,
    // `report.abuse`: trả null để `normalizeReportAbuseConfig` lùi về mặc định.
    { getConfigValue: async () => null } as never,
  );
  return { manager, transactionManager, ledger, repository };
}

describe('ReportRepository.reviewByAdmin', () => {
  it('RESOLVED report bài đăng thì gỡ bài và phạt chủ bài trong cùng transaction', async () => {
    const { manager, transactionManager, ledger, repository } = setup();
    manager.query
      .mockResolvedValueOnce([
        {
          status: ReportStatuses.PENDING,
          target_type: ReportTargetTypes.POST,
          target_id: PostId,
        },
      ])
      .mockResolvedValueOnce([
        { status: GiftPostStatuses.PUBLISHED, author_id: AuthorId },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      repository.reviewByAdmin({
        actorUserId: ActorId,
        reportId: ReportId,
        status: ReportStatuses.RESOLVED,
        note: 'Đã xác minh vi phạm',
      }),
    ).resolves.toBe(true);

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE posts SET status'),
      [PostId, GiftPostStatuses.REJECTED],
    );
    expect(ledger.appendByRuleWithinTransaction).toHaveBeenCalledWith(
      transactionManager,
      expect.objectContaining({
        userId: AuthorId,
        ruleCode: ContentViolationPenaltyRuleCode,
        referenceType: 'REPORT',
        referenceId: ReportId,
        idempotencyKey: `${ContentViolationPenaltyRuleCode}:POST:${PostId}`,
      }),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("'MODERATE_POST'"),
      expect.arrayContaining([ActorId, PostId, 'Đã xác minh vi phạm']),
    );
  });

  it('không phạt lại khi bài đã REJECTED', async () => {
    const { manager, ledger, repository } = setup();
    manager.query
      .mockResolvedValueOnce([
        {
          status: ReportStatuses.PENDING,
          target_type: ReportTargetTypes.POST,
          target_id: PostId,
        },
      ])
      .mockResolvedValueOnce([
        { status: GiftPostStatuses.REJECTED, author_id: AuthorId },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await repository.reviewByAdmin({
      actorUserId: ActorId,
      reportId: ReportId,
      status: ReportStatuses.RESOLVED,
      note: 'Report trùng đích',
    });

    expect(ledger.appendByRuleWithinTransaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE posts SET status'),
      expect.anything(),
    );
  });

  it('rule phạt bị tắt thì vẫn gỡ bài và kết luận report', async () => {
    const { manager, ledger, repository } = setup();
    ledger.appendByRuleWithinTransaction.mockRejectedValue(
      new PointRuleUnavailableException(ContentViolationPenaltyRuleCode),
    );
    manager.query
      .mockResolvedValueOnce([
        {
          status: ReportStatuses.PENDING,
          target_type: ReportTargetTypes.POST,
          target_id: PostId,
        },
      ])
      .mockResolvedValueOnce([
        { status: GiftPostStatuses.PUBLISHED, author_id: AuthorId },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      repository.reviewByAdmin({
        actorUserId: ActorId,
        reportId: ReportId,
        status: ReportStatuses.RESOLVED,
        note: 'Đã xác minh vi phạm',
      }),
    ).resolves.toBe(true);

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE posts SET status'),
      [PostId, GiftPostStatuses.REJECTED],
    );
  });

  it('DISMISSED chỉ đóng report, không gỡ bài hay trừ điểm', async () => {
    const { manager, ledger, repository } = setup();
    manager.query
      .mockResolvedValueOnce([
        {
          status: ReportStatuses.PENDING,
          target_type: ReportTargetTypes.POST,
          target_id: PostId,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await repository.reviewByAdmin({
      actorUserId: ActorId,
      reportId: ReportId,
      status: ReportStatuses.DISMISSED,
      note: 'Không có vi phạm',
    });

    expect(ledger.appendByRuleWithinTransaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE posts SET status'),
      expect.anything(),
    );
  });
});
