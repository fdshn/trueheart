import {
  GiftTransactionInvalidStateException,
  GiftTransactionNotFoundException,
  GiftTransactionNotParticipantException,
} from '@/domain/exceptions';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { StorageValidationError } from '@chantam/service.storage-lib';
import {
  MarkGiftHandedOverUseCase,
  RequestGiftEvidenceUploadUseCase,
} from './gift-evidence.use-cases';

const GiverId = 'giver-1';
const ReceiverId = 'receiver-1';
const StrangerId = 'stranger-1';
const TransactionId = 'tx-1';

const Upload = {
  key: `users/${GiverId}/transactions/${TransactionId}/a.webp`,
  uploadUrl: 'https://storage.test/put',
  expiresInSeconds: 300,
};

const HandedOver = {
  globalId: TransactionId,
  postId: 'post-1',
  giverId: GiverId,
  receiverId: ReceiverId,
  quantity: 1,
  status: 'DELIVERING' as const,
  requestedAt: new Date('2026-10-01T00:00:00Z'),
  acceptedAt: new Date('2026-10-02T00:00:00Z'),
  handedOverAt: new Date('2026-10-03T00:00:00Z'),
  completedAt: null,
};

describe('RequestGiftEvidenceUploadUseCase', () => {
  function makeDeps(found = true) {
    return {
      transactions: {
        findByGlobalId: jest.fn(async (_id: string) =>
          found
            ? {
                globalId: TransactionId,
                giverId: GiverId,
                receiverId: ReceiverId,
              }
            : null,
        ),
      },
      storage: {
        createTransactionEvidenceUpload: jest.fn(
          async (_params: unknown) => Upload,
        ),
      },
    };
  }

  const build = (deps: ReturnType<typeof makeDeps>) =>
    new RequestGiftEvidenceUploadUseCase(
      deps.transactions as never,
      deps.storage as never,
    );

  const command = (userId: string) => ({
    userId,
    transactionId: TransactionId,
    contentType: 'image/webp',
    contentLength: 120_000,
  });

  it('lượt trao không tồn tại thì 404 và không cấp đường tải', async () => {
    const deps = makeDeps(false);

    await expect(build(deps).handle(command(GiverId))).rejects.toThrow(
      GiftTransactionNotFoundException,
    );
    expect(deps.storage.createTransactionEvidenceUpload).not.toHaveBeenCalled();
  });

  it('người ngoài lượt trao thì bị chặn và không cấp đường tải', async () => {
    const deps = makeDeps();

    await expect(build(deps).handle(command(StrangerId))).rejects.toThrow(
      GiftTransactionNotParticipantException,
    );
    expect(deps.storage.createTransactionEvidenceUpload).not.toHaveBeenCalled();
  });

  it.each([
    ['người tặng', GiverId],
    ['người nhận', ReceiverId],
  ])(
    '%s xin được, khoá mang đúng userId của người gọi',
    async (_label, userId) => {
      const deps = makeDeps();

      const result = await build(deps).handle(command(userId));

      expect(deps.transactions.findByGlobalId).toHaveBeenCalledWith(
        TransactionId,
      );
      expect(deps.storage.createTransactionEvidenceUpload).toHaveBeenCalledWith(
        {
          userId,
          transactionId: TransactionId,
          contentType: 'image/webp',
          contentLength: 120_000,
        },
      );
      expect(result).toEqual({ upload: Upload });
    },
  );

  // Trước 16/10 lời gọi này không bọc withStorageValidation, nên
  // StorageValidationError lọt ra thành 500.
  it('lỗi chính sách của storage (sai loại, quá nặng) thành 400', async () => {
    const deps = makeDeps();
    deps.storage.createTransactionEvidenceUpload.mockRejectedValueOnce(
      new StorageValidationError('chỉ nhận ảnh'),
    );

    await expect(build(deps).handle(command(GiverId))).rejects.toThrow(
      ValidationFailedException,
    );
  });
});

describe('MarkGiftHandedOverUseCase', () => {
  function makeDeps() {
    return {
      transactions: {
        markHandedOver: jest.fn(async (_params: unknown) => HandedOver),
      },
      storage: {
        confirmTransactionEvidenceUpload: jest.fn(
          async (_userId: string, _transactionId: string, _key: string) =>
            undefined,
        ),
      },
      dispatch: { handle: jest.fn(async (_command: unknown) => undefined) },
    };
  }

  const build = (deps: ReturnType<typeof makeDeps>) =>
    new MarkGiftHandedOverUseCase(
      deps.transactions as never,
      deps.storage as never,
      deps.dispatch as never,
    );

  it('không ảnh vẫn bàn giao được, gửi mảng rỗng xuống repository', async () => {
    const deps = makeDeps();

    await build(deps).handle({ userId: GiverId, transactionId: TransactionId });

    expect(
      deps.storage.confirmTransactionEvidenceUpload,
    ).not.toHaveBeenCalled();
    expect(deps.transactions.markHandedOver).toHaveBeenCalledWith({
      transactionId: TransactionId,
      giverId: GiverId,
      evidenceKeys: [],
    });
  });

  it('xác nhận từng ảnh trên storage dưới tên người gọi trước khi ghi', async () => {
    const deps = makeDeps();
    const order: string[] = [];
    deps.storage.confirmTransactionEvidenceUpload.mockImplementation(
      async (_u, _t, key) => {
        order.push(`confirm:${key}`);
      },
    );
    deps.transactions.markHandedOver.mockImplementation(async () => {
      order.push('write');
      return HandedOver;
    });

    await build(deps).handle({
      userId: GiverId,
      transactionId: TransactionId,
      evidenceKeys: ['a', 'b'],
    });

    expect(
      deps.storage.confirmTransactionEvidenceUpload,
    ).toHaveBeenNthCalledWith(1, GiverId, TransactionId, 'a');
    expect(order).toEqual(['confirm:a', 'confirm:b', 'write']);
    expect(deps.transactions.markHandedOver).toHaveBeenCalledWith({
      transactionId: TransactionId,
      giverId: GiverId,
      evidenceKeys: ['a', 'b'],
    });
  });

  it('quá 3 ảnh thì chỉ lấy 3 tấm đầu, phần thừa không xác nhận cũng không ghi', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      userId: GiverId,
      transactionId: TransactionId,
      evidenceKeys: ['a', 'b', 'c', 'd', 'e'],
    });

    expect(deps.storage.confirmTransactionEvidenceUpload).toHaveBeenCalledTimes(
      3,
    );
    expect(
      deps.storage.confirmTransactionEvidenceUpload,
    ).not.toHaveBeenCalledWith(GiverId, TransactionId, 'd');
    expect(deps.transactions.markHandedOver).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceKeys: ['a', 'b', 'c'] }),
    );
  });

  it('key bịa hoặc của người khác thì 400 trên evidenceKeys và không ghi gì', async () => {
    const deps = makeDeps();
    deps.storage.confirmTransactionEvidenceUpload.mockRejectedValueOnce(
      new StorageValidationError('Không tìm thấy object'),
    );

    await expect(
      build(deps).handle({
        userId: GiverId,
        transactionId: TransactionId,
        evidenceKeys: ['bia'],
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(deps.transactions.markHandedOver).not.toHaveBeenCalled();
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
  });

  it('lỗi hạ tầng của storage không bị đổi thành 400', async () => {
    const deps = makeDeps();
    const error = new Error('ECONNRESET');
    deps.storage.confirmTransactionEvidenceUpload.mockRejectedValueOnce(error);

    await expect(
      build(deps).handle({
        userId: GiverId,
        transactionId: TransactionId,
        evidenceKeys: ['a'],
      }),
    ).rejects.toBe(error);
    expect(deps.transactions.markHandedOver).not.toHaveBeenCalled();
  });

  it('sai trạng thái / không phải người tặng: lỗi repository đi nguyên ra, không báo ai', async () => {
    const deps = makeDeps();
    const error = new GiftTransactionInvalidStateException('DELIVERING');
    deps.transactions.markHandedOver.mockRejectedValueOnce(error);

    await expect(
      build(deps).handle({ userId: GiverId, transactionId: TransactionId }),
    ).rejects.toBe(error);
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
  });

  it('chỉ báo người nhận, khoá chống trùng theo lượt trao', async () => {
    const deps = makeDeps();

    await build(deps).handle({ userId: GiverId, transactionId: TransactionId });

    expect(deps.dispatch.handle).toHaveBeenCalledTimes(1);
    expect(deps.dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ReceiverId,
        type: NotificationTypes.GIFT_TRANSACTION_HANDED_OVER,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: TransactionId,
        idempotencyKey: `GIFT_TRANSACTION_HANDED_OVER:${TransactionId}`,
      }),
    );
  });

  it('báo lỗi thì không ném và vẫn trả lượt trao đã bàn giao', async () => {
    const deps = makeDeps();
    deps.dispatch.handle.mockRejectedValueOnce(new Error('push down'));

    const result = await build(deps).handle({
      userId: GiverId,
      transactionId: TransactionId,
    });

    expect(result).toEqual({
      transaction: {
        transactionId: TransactionId,
        postId: 'post-1',
        giverId: GiverId,
        receiverId: ReceiverId,
        quantity: 1,
        status: 'DELIVERING',
        requestedAt: HandedOver.requestedAt,
        acceptedAt: HandedOver.acceptedAt,
        handedOverAt: HandedOver.handedOverAt,
        completedAt: null,
      },
    });
  });
});
