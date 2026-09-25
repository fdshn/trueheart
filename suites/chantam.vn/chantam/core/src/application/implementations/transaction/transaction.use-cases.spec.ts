import { AutoCompleteAfterDays } from '@/application/contracts/transaction';
import { IGiftTransactionSummary } from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { ICandidateMetrics } from '@chantam.vn/chantam.core-lib/models';
import {
  AcceptGiftRequestUseCase,
  CancelGiftTransactionUseCase,
  CompleteDueGiftDeliveriesUseCase,
  ConfirmGiftReceiptUseCase,
  ListOwnGiftTransactionsUseCase,
  RequestGiftUseCase,
} from './transaction.use-cases';

const UserId = '10000000-0000-4000-8000-000000000001';
const NextCandidateId = '10000000-0000-4000-8000-000000000009';
const SeniorCandidateId = '10000000-0000-4000-8000-000000000008';

/** Xin trước nhưng hạng thấp. */
const EarlyCandidate: ICandidateMetrics = {
  requesterId: NextCandidateId,
  queueJoinedAt: new Date('2026-09-01T08:00:00.000Z'),
  requestId: 1,
  rank: UserRanks.MEMBER,
  distanceMeters: 5_000,
  receivedCount: 0,
  cancellationCount: 0,
};

/** Xin sau nhưng hạng cao. */
const SeniorCandidate: ICandidateMetrics = {
  requesterId: SeniorCandidateId,
  queueJoinedAt: new Date('2026-09-01T09:00:00.000Z'),
  requestId: 2,
  rank: UserRanks.DIAMOND,
  distanceMeters: 1_000,
  receivedCount: 0,
  cancellationCount: 0,
};

/**
 * Cấu hình động của Admin. `null` nghĩa là chưa cấu hình gì — use case phải rơi
 * về thứ tự mặc định chứ không ném lỗi.
 */
function makeAdminConfig(order: string[] | null = null) {
  return {
    getConfigValue: jest.fn(async (_key: string): Promise<unknown> => order),
  };
}
const PostId = '30000000-0000-4000-8000-000000000001';
const TransactionId = '40000000-0000-4000-8000-000000000003';

const Summary = {
  globalId: TransactionId,
  postId: PostId,
  giverId: '20000000-0000-4000-8000-000000000002',
  receiverId: UserId,
  quantity: 1,
  status: 'REQUESTED' as const,
  requestedAt: new Date('2026-09-20T00:00:00.000Z'),
  acceptedAt: null,
  handedOverAt: null,
  completedAt: null,
};

/**
 * Use case huỷ gửi thông báo, nên mock luôn để kiểm nội dung — nhất là việc nói
 * với ứng viên kế tiếp rằng "đang được xét tiếp", KHÔNG phải "đã được chọn".
 */
/**
 * Phòng chat giả.
 *
 * `findPurgeSchedule` trả `null` ở mặc định: không có hạn xoá thì không báo gì, và
 * các phép kiểm cũ về hàng đợi không bị thêm nhiễu.
 */
function makeChat(purgeAfter: Date | null = null) {
  return {
    findPurgeSchedule: jest.fn(async () =>
      purgeAfter ? { roomId: 'phong-1', purgeAfter } : null,
    ),
  };
}

function makeNotifier() {
  return {
    handle: jest.fn(async (_command: unknown) => ({
      created: true,
      pushedDevices: 0,
    })),
  };
}

function makeRepository() {
  return {
    request: jest.fn(
      async (_params: {
        globalId: string;
        postId: string;
        receiverId: string;
        quantity: number;
      }) => Summary,
    ),
    accept: jest.fn(async (_transactionId: string, _giverId: string) => ({
      ...Summary,
      status: 'ACCEPTED' as const,
    })),
    confirmReceipt: jest.fn(
      async (_transactionId: string, _receiverId: string) => ({
        ...Summary,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
      }),
    ),
    close: jest.fn(
      async (
        _params: unknown,
      ): Promise<{
        transaction: IGiftTransactionSummary;
        queue: { reopenedCount: number; candidates: ICandidateMetrics[] };
      }> => ({
        transaction: { ...Summary, status: 'CANCELLED' as const },
        // Hai ứng viên khác nhau ở HẠNG và ở THỜI ĐIỂM vào hàng đợi, để đổi
        // thứ tự ưu tiên là đổi người được đề xuất.
        queue: {
          reopenedCount: 2,
          candidates: [EarlyCandidate, SeniorCandidate],
        },
      }),
    ),
    listForUser: jest.fn(async (_userId: string) => [Summary]),
    completeDueDeliveries: jest.fn(async (_days: number) => ({
      completed: 3,
      heldForDispute: 0,
    })),
    findByGlobalId: jest.fn(),
    countCompletedByGiver: jest.fn(),
  };
}

describe('Gift transaction use cases', () => {
  it('xin quà dùng danh tính từ token, không nhận receiverId từ client', async () => {
    const repository = makeRepository();
    const useCase = new RequestGiftUseCase(repository as never);

    await useCase.handle({
      userId: UserId,
      giftRequest: { postId: PostId, quantity: 2 },
    });

    expect(repository.request).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: PostId,
        receiverId: UserId,
        quantity: 2,
      }),
    );
  });

  it('sinh sẵn định danh cho lượt xin quà', async () => {
    const repository = makeRepository();
    const useCase = new RequestGiftUseCase(repository as never);

    await useCase.handle({ userId: UserId, giftRequest: { postId: PostId } });

    const params = repository.request.mock.calls[0]?.[0] as unknown as {
      globalId: string;
      quantity: number;
    };
    expect(params.globalId).toEqual(expect.any(String));
    expect(params.globalId.length).toBeGreaterThan(0);
    // Không gửi số lượng thì mặc định xin một suất.
    expect(params.quantity).toBe(1);
  });

  it('duyệt yêu cầu bằng danh tính người tặng từ token', async () => {
    const repository = makeRepository();
    const useCase = new AcceptGiftRequestUseCase(repository as never);

    await useCase.handle({ userId: UserId, transactionId: TransactionId });

    expect(repository.accept).toHaveBeenCalledWith(TransactionId, UserId);
  });

  it('xác nhận đã nhận bằng danh tính người nhận từ token', async () => {
    const repository = makeRepository();
    const useCase = new ConfirmGiftReceiptUseCase(
      repository as never,
      makeChat() as never,
      makeNotifier() as never,
    );

    const result = await useCase.handle({
      userId: UserId,
      transactionId: TransactionId,
    });

    expect(repository.confirmReceipt).toHaveBeenCalledWith(
      TransactionId,
      UserId,
      [],
    );
    expect(result.transaction.status).toBe('COMPLETED');
  });

  it('huỷ xong thì báo cho NGƯỜI CHO và ứng viên kế tiếp (F33)', async () => {
    const repository = makeRepository();
    const notifier = makeNotifier();

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig() as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được' },
    });

    const targets = notifier.handle.mock.calls.map(
      ([command]) => (command as { userId: string }).userId,
    );
    // Chưa cấu hình gì thì mặc định ưu tiên ai xin trước.
    expect(targets).toEqual([Summary.giverId, NextCandidateId]);
  });

  it('Admin đổi thứ tự ưu tiên thì đổi người được đề xuất (CH-1)', async () => {
    // Toàn bộ lý do tồn tại của cấu hình động: cùng dữ liệu, hai chính sách,
    // hai người khác nhau được đề xuất.
    const repository = makeRepository();
    const notifier = makeNotifier();

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig(['HIGHEST_RANK']) as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được' },
    });

    const targets = notifier.handle.mock.calls.map(
      ([command]) => (command as { userId: string }).userId,
    );
    expect(targets).toEqual([Summary.giverId, SeniorCandidateId]);
  });

  it('cấu hình rác thì rơi về mặc định, không ném lỗi', async () => {
    const repository = makeRepository();
    const notifier = makeNotifier();

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig(['KHONG_TON_TAI']) as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được' },
    });

    const targets = notifier.handle.mock.calls.map(
      ([command]) => (command as { userId: string }).userId,
    );
    expect(targets).toEqual([Summary.giverId, NextCandidateId]);
  });

  it('KHÔNG nói với ứng viên kế tiếp rằng đã được chọn', async () => {
    // F33: hệ thống chỉ đề xuất, tuyệt đối không tự trao. Thông báo hứa hộ một
    // điều chưa xảy ra là thứ người dùng nhớ rất lâu.
    const repository = makeRepository();
    const notifier = makeNotifier();

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig() as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được' },
    });

    const toCandidate = notifier.handle.mock.calls
      .map(([command]) => command as { userId: string; body: string })
      .find((command) => command.userId === NextCandidateId);

    expect(toCandidate?.body).toContain('chưa phải là đã được chọn');
    expect(toCandidate?.body).not.toContain('đã được chọn nhận');
  });

  it('không còn ai trong hàng đợi thì không gửi thông báo nào', async () => {
    const repository = makeRepository();
    repository.close = jest.fn(async (_params: unknown) => ({
      transaction: { ...Summary, status: 'CANCELLED' as const },
      queue: { reopenedCount: 0, candidates: [] },
    }));
    const notifier = makeNotifier();

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig() as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được' },
    });

    expect(notifier.handle).not.toHaveBeenCalled();
  });

  it('huỷ kèm lý do và đánh dấu CANCELLED', async () => {
    const repository = makeRepository();
    const useCase = new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      makeNotifier() as never,
      makeAdminConfig() as never,
    );

    await useCase.handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được thời gian' },
    });

    expect(repository.close).toHaveBeenCalledWith({
      transactionId: TransactionId,
      actorUserId: UserId,
      status: 'CANCELLED',
      reason: 'Không sắp xếp được thời gian',
    });
  });

  it('chỉ liệt kê lượt của chính người đang đăng nhập', async () => {
    const repository = makeRepository();
    const useCase = new ListOwnGiftTransactionsUseCase(repository as never);

    const result = await useCase.handle({ userId: UserId });

    expect(repository.listForUser).toHaveBeenCalledWith(UserId);
    expect(result.transactions[0].transactionId).toBe(TransactionId);
  });

  it('tự hoàn tất dùng mốc 5 ngày của đặc tả khi không truyền tham số', async () => {
    const repository = makeRepository();
    const useCase = new CompleteDueGiftDeliveriesUseCase(repository as never);

    const result = await useCase.handle({});

    expect(repository.completeDueDeliveries).toHaveBeenCalledWith(
      AutoCompleteAfterDays,
    );
    expect(result.completedTransactions).toBe(3);
  });
});
