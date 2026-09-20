import { AutoCompleteAfterDays } from '@/application/contracts/transaction';
import {
  AcceptGiftRequestUseCase,
  CancelGiftTransactionUseCase,
  CompleteDueGiftDeliveriesUseCase,
  ConfirmGiftReceiptUseCase,
  ListOwnGiftTransactionsUseCase,
  RequestGiftUseCase,
} from './transaction.use-cases';

const UserId = '10000000-0000-4000-8000-000000000001';
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
  completedAt: null,
};

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
    close: jest.fn(async (_params: unknown) => ({
      ...Summary,
      status: 'CANCELLED' as const,
    })),
    listForUser: jest.fn(async (_userId: string) => [Summary]),
    completeDueDeliveries: jest.fn(async (_days: number) => 3),
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
    const useCase = new ConfirmGiftReceiptUseCase(repository as never);

    const result = await useCase.handle({
      userId: UserId,
      transactionId: TransactionId,
    });

    expect(repository.confirmReceipt).toHaveBeenCalledWith(
      TransactionId,
      UserId,
    );
    expect(result.transaction.status).toBe('COMPLETED');
  });

  it('huỷ kèm lý do và đánh dấu CANCELLED', async () => {
    const repository = makeRepository();
    const useCase = new CancelGiftTransactionUseCase(repository as never);

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
