import { AutoCompleteAfterDays } from '@/application/contracts/transaction';
import { GiftTransactionNotFoundException } from '@/domain/exceptions';
import { IGiftTransactionSummary } from '@/domain/ports/repository';
import {
  GiftEvidenceKinds,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { ICandidateMetrics } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { StorageValidationError } from '@chantam/service.storage-lib';
import {
  CancelGiftTransactionUseCase,
  CompleteDueGiftDeliveriesUseCase,
  ConfirmGiftReceiptUseCase,
  GetGiftTransactionUseCase,
  ListOwnGiftTransactionsUseCase,
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
        queue: {
          reopenedCount: number;
          candidates: ICandidateMetrics[];
          cancelledRequestId: string | null;
        };
      }> => ({
        transaction: { ...Summary, status: 'CANCELLED' as const },
        // Hai ứng viên khác nhau ở HẠNG và ở THỜI ĐIỂM vào hàng đợi, để đổi
        // thứ tự ưu tiên là đổi người được đề xuất.
        queue: {
          reopenedCount: 2,
          candidates: [EarlyCandidate, SeniorCandidate],
          cancelledRequestId: null,
        },
      }),
    ),
    listForUser: jest.fn(async (_userId: string) => [Summary]),
    completeDueDeliveries: jest.fn(async (_days: number) => ({
      completed: 3,
      heldForDispute: 0,
      // Trả ra CHÍNH những lượt đã đóng: con số không đủ để báo cho ai.
      completedTransactions: [Summary, Summary, Summary],
    })),
    findByGlobalId: jest.fn(async () => Summary),
    listEvidence: jest.fn(async (_transactionId: string) => [
      {
        kind: GiftEvidenceKinds.HANDOVER,
        slot: 1,
        storageKey: 'users/giver/transactions/t/evidence/a.webp',
        uploadedBy: Summary.giverId,
        createdAt: new Date('2026-10-20T00:00:00Z'),
      },
    ]),
    countCompletedByGiver: jest.fn(),
  };
}

/**
 * Service hoàn điểm, dạng giả. Mặc định "không có gì để hoàn" — đó là đường PHỔ
 * BIẾN: phần lớn lượt trao không đến từ đổi điểm.
 */
const WebConfig = { storage: { publicBaseUrl: 'https://cdn.chantam.test/' } };

function makeStorage() {
  return {
    confirmTransactionEvidenceUpload: jest.fn(
      async (_userId: string, _transactionId: string, _key: string) =>
        undefined,
    ),
  };
}

function makeRefund(refunded = 0) {
  return { refundFor: jest.fn(async () => refunded) };
}

describe('Gift transaction use cases', () => {
  it('xem chi tiết một lượt trao, chỉ hai bên trong cuộc', async () => {
    const repository = makeRepository();
    const useCase = new GetGiftTransactionUseCase(
      repository as never,
      WebConfig as never,
    );

    const result = await useCase.handle({
      userId: Summary.giverId,
      transactionId: TransactionId,
    });

    expect(result.transaction.transactionId).toBe(TransactionId);
  });

  it('người ngoài cuộc nhận 404 chứ không phải 403', async () => {
    // 403 xác nhận rằng lượt trao đó CÓ THẬT. Id đoán được thì đó là một kênh dò.
    const repository = makeRepository();
    const useCase = new GetGiftTransactionUseCase(
      repository as never,
      WebConfig as never,
    );

    await expect(
      useCase.handle({
        userId: '00000000-0000-4000-8000-000000000999',
        transactionId: TransactionId,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });

  it('lượt trao không tồn tại cũng ra 404', async () => {
    const repository = makeRepository();
    repository.findByGlobalId = jest.fn(async () => null) as never;
    const useCase = new GetGiftTransactionUseCase(
      repository as never,
      WebConfig as never,
    );

    await expect(
      useCase.handle({ userId: UserId, transactionId: TransactionId }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });

  it('xác nhận đã nhận bằng danh tính người nhận từ token', async () => {
    const repository = makeRepository();
    const useCase = new ConfirmGiftReceiptUseCase(
      repository as never,
      makeChat() as never,
      makeNotifier() as never,
      makeStorage() as never,
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

  it('chi tiết lượt trao trả ảnh bằng chứng kèm URL mở được, cho cả hai bên', async () => {
    // Ảnh lúc trao là thứ tạo thế bất đối xứng khi tranh chấp — người nhận phải
    // XEM được nó, không chỉ Admin.
    const repository = makeRepository();

    for (const viewer of [Summary.giverId, Summary.receiverId]) {
      const result = await new GetGiftTransactionUseCase(
        repository as never,
        WebConfig as never,
      ).handle({ userId: viewer, transactionId: TransactionId });

      expect(result.evidence).toEqual([
        {
          kind: GiftEvidenceKinds.HANDOVER,
          slot: 1,
          url: 'https://cdn.chantam.test/users/giver/transactions/t/evidence/a.webp',
          uploadedBy: Summary.giverId,
          createdAt: new Date('2026-10-20T00:00:00Z'),
        },
      ]);
    }
    expect(repository.listEvidence).toHaveBeenCalledWith(TransactionId);
  });

  it('người ngoài cuộc không được đọc ảnh — 404 trước khi chạm tới bảng ảnh', async () => {
    const repository = makeRepository();

    await expect(
      new GetGiftTransactionUseCase(
        repository as never,
        WebConfig as never,
      ).handle({
        userId: '00000000-0000-4000-8000-000000000999',
        transactionId: TransactionId,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
    expect(repository.listEvidence).not.toHaveBeenCalled();
  });

  it('xác nhận kèm ảnh: kiểm TỪNG ảnh trên storage dưới tên người nhận, tối đa 3', async () => {
    const repository = makeRepository();
    const storage = makeStorage();

    await new ConfirmGiftReceiptUseCase(
      repository as never,
      makeChat() as never,
      makeNotifier() as never,
      storage as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      evidenceKeys: ['k1', 'k2', 'k3', 'k4'],
    });

    expect(storage.confirmTransactionEvidenceUpload.mock.calls).toEqual([
      [UserId, TransactionId, 'k1'],
      [UserId, TransactionId, 'k2'],
      [UserId, TransactionId, 'k3'],
    ]);
    expect(repository.confirmReceipt).toHaveBeenCalledWith(
      TransactionId,
      UserId,
      ['k1', 'k2', 'k3'],
    );
  });

  it('ảnh không thuộc người nhận / chưa tải lên thì 400 và KHÔNG hoàn tất', async () => {
    // Không kiểm thì người nhận gắn được key của người khác vào bằng chứng.
    const repository = makeRepository();
    const storage = makeStorage();
    storage.confirmTransactionEvidenceUpload.mockRejectedValueOnce(
      new StorageValidationError('key không thuộc người dùng'),
    );

    await expect(
      new ConfirmGiftReceiptUseCase(
        repository as never,
        makeChat() as never,
        makeNotifier() as never,
        storage as never,
      ).handle({
        userId: UserId,
        transactionId: TransactionId,
        evidenceKeys: ['users/khac/transactions/t/evidence/x.webp'],
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.confirmReceipt).not.toHaveBeenCalled();
  });

  it('huỷ xong thì báo cho NGƯỜI CHO và ứng viên kế tiếp (F33)', async () => {
    const repository = makeRepository();
    const notifier = makeNotifier();

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig() as never,
      makeRefund() as never,
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

  it('huỷ thì GỌI hoàn điểm, với id yêu cầu lấy từ queue (CHỐT-13)', async () => {
    // Lưới cho CHỖ NỐI, không cho service. Phép kiểm của service nói rằng nó hoàn
    // đúng số điểm; phép kiểm này nói rằng nó ĐƯỢC GỌI. Dựng lại lỗi cho thấy vì
    // sao cần cả hai: gỡ lượt gọi khỏi use case mà chỉ có phép kiểm service thì
    // mọi thứ vẫn xanh — đúng cái lỗ lát này sửa.
    const repository = makeRepository();
    repository.close = jest.fn(async () => ({
      transaction: { ...Summary, status: 'CANCELLED' as const },
      queue: {
        reopenedCount: 0,
        candidates: [],
        cancelledRequestId: 'req-da-doi-diem',
      },
    })) as never;
    const refund = makeRefund(500);

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      makeNotifier() as never,
      makeAdminConfig() as never,
      refund as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được' },
    });

    expect(refund.refundFor).toHaveBeenCalledWith({
      cancelledRequestId: 'req-da-doi-diem',
      actorUserId: UserId,
    });
  });

  it('hoàn điểm chạy TRƯỚC khi báo cho hàng đợi', async () => {
    // Thứ tự có nghĩa: thông báo "bài mở lại" mời ứng viên kế tiếp vào, và họ có
    // thể đổi điểm ngay. Hoàn sau đó thì có một khoảng người vừa bị huỷ chưa có
    // điểm lại trong khi suất đã mở cho người khác.
    const order: string[] = [];
    const repository = makeRepository();
    repository.close = jest.fn(async () => ({
      transaction: { ...Summary, status: 'CANCELLED' as const },
      queue: {
        reopenedCount: 1,
        candidates: [],
        cancelledRequestId: 'req-1',
      },
    })) as never;
    const refund = {
      refundFor: jest.fn(async () => {
        order.push('refund');
        return 500;
      }),
    };
    const notifier = makeNotifier();
    const original = notifier.handle;
    notifier.handle = jest.fn(async (...args: unknown[]) => {
      order.push('notify');
      return (original as (...a: unknown[]) => unknown)(...args);
    }) as never;

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig() as never,
      refund as never,
    ).handle({
      userId: UserId,
      transactionId: TransactionId,
      cancellation: { reason: 'Không sắp xếp được' },
    });

    expect(order[0]).toBe('refund');
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
      makeRefund() as never,
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
      makeRefund() as never,
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
      makeRefund() as never,
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
      queue: { reopenedCount: 0, candidates: [], cancelledRequestId: null },
    }));
    const notifier = makeNotifier();

    await new CancelGiftTransactionUseCase(
      repository as never,
      makeChat() as never,
      notifier as never,
      makeAdminConfig() as never,
      makeRefund() as never,
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
      makeRefund() as never,
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
    const useCase = new CompleteDueGiftDeliveriesUseCase(
      repository as never,
      makeChat() as never,
      makeNotifier() as never,
    );

    const result = await useCase.handle({});

    expect(repository.completeDueDeliveries).toHaveBeenCalledWith(
      AutoCompleteAfterDays,
    );
    expect(result.completedTransactions).toBe(3);
  });
});
