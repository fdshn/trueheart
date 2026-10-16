import {
  GiftTransactionInvalidStateException,
  GiftTransactionOutOfStockException,
} from '@/domain/exceptions';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { ReopenGiftTransactionUseCase } from './reopen-gift-transaction.use-case';

const ActorId = 'admin-1';
const TransactionId = 'tx-1';
const GiverId = 'giver-1';
const ReceiverId = 'receiver-1';
const Now = 1_760_000_000_000;

const Reopened = {
  globalId: TransactionId,
  postId: 'post-1',
  giverId: GiverId,
  receiverId: ReceiverId,
  quantity: 2,
  status: 'DELIVERING' as const,
  requestedAt: new Date('2026-10-01T00:00:00Z'),
  acceptedAt: new Date('2026-10-02T00:00:00Z'),
  handedOverAt: new Date('2026-10-03T00:00:00Z'),
  completedAt: null,
  // Trường thừa của summary không được lọt ra ngoài.
  internalNote: 'không trả về',
};

function makeDeps(options: { granted?: boolean } = {}) {
  return {
    transactions: { reopen: jest.fn(async (_params: unknown) => Reopened) },
    permissions: {
      hasPermission: jest.fn(async () => options.granted ?? true),
    },
    dispatch: { handle: jest.fn(async (_command: unknown) => undefined) },
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new ReopenGiftTransactionUseCase(
    deps.transactions as never,
    deps.permissions as never,
    deps.dispatch as never,
  );

describe('ReopenGiftTransactionUseCase', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(Now));
  afterEach(() => jest.restoreAllMocks());

  it('đòi admin.manage — thiếu quyền thì Forbidden, không mở lại, không báo', async () => {
    const deps = makeDeps({ granted: false });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        transactionId: TransactionId,
        reason: 'đóng nhầm',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(deps.permissions.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'admin.manage',
    );
    expect(deps.transactions.reopen).not.toHaveBeenCalled();
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
  });

  it('kiểm quyền trước lý do: người không có quyền không dò được luật nhập liệu', async () => {
    const deps = makeDeps({ granted: false });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        transactionId: TransactionId,
        reason: '',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['rỗng', ''],
    ['toàn khoảng trắng', '   \n\t '],
    ['thiếu hẳn', undefined],
  ])('lý do %s thì 400 và không mở lại', async (_label, reason) => {
    const deps = makeDeps();

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        transactionId: TransactionId,
        reason: reason as never,
      }),
    ).rejects.toThrow(ValidationFailedException);

    expect(deps.transactions.reopen).not.toHaveBeenCalled();
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
  });

  it('gửi lý do đã cắt khoảng trắng và đúng người bấm xuống repository', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      transactionId: TransactionId,
      reason: '  tự hoàn tất khi hàng chưa tới  ',
    });

    expect(deps.transactions.reopen).toHaveBeenCalledTimes(1);
    expect(deps.transactions.reopen).toHaveBeenCalledWith({
      transactionId: TransactionId,
      actorUserId: ActorId,
      reason: 'tự hoàn tất khi hàng chưa tới',
    });
  });

  it('trả đúng hình dạng DTO, không lộ trường thừa của summary', async () => {
    const deps = makeDeps();

    const result = await build(deps).handle({
      actorUserId: ActorId,
      transactionId: TransactionId,
      reason: 'đóng nhầm',
    });

    expect(result).toEqual({
      transaction: {
        transactionId: TransactionId,
        postId: 'post-1',
        giverId: GiverId,
        receiverId: ReceiverId,
        quantity: 2,
        status: 'DELIVERING',
        requestedAt: Reopened.requestedAt,
        acceptedAt: Reopened.acceptedAt,
        handedOverAt: Reopened.handedOverAt,
        completedAt: null,
      },
    });
  });

  it('báo cả người tặng lẫn người nhận, khoá chống trùng có mốc thời gian', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      transactionId: TransactionId,
      reason: 'đóng nhầm',
    });

    expect(deps.dispatch.handle).toHaveBeenCalledTimes(2);
    for (const userId of [GiverId, ReceiverId])
      expect(deps.dispatch.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: NotificationTypes.GIFT_TRANSACTION_REOPENED,
          referenceType: 'GIFT_TRANSACTION',
          referenceId: TransactionId,
          idempotencyKey: `GIFT_TRANSACTION_REOPENED:${TransactionId}:${userId}:${Now}`,
        }),
      );
  });

  it('mở lại lần hai thì khoá thông báo khác lần đầu — không bị nuốt mất', async () => {
    const deps = makeDeps();
    const useCase = build(deps);
    const command = {
      actorUserId: ActorId,
      transactionId: TransactionId,
      reason: 'đóng nhầm',
    };

    await useCase.handle(command);
    jest.spyOn(Date, 'now').mockReturnValue(Now + 60_000);
    await useCase.handle(command);

    const keys = deps.dispatch.handle.mock.calls
      .map(([c]) => (c as { idempotencyKey: string }).idempotencyKey)
      .filter((k) => k.includes(GiverId));
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('báo một bên lỗi vẫn báo bên kia và không ném — lượt trao đã mở lại rồi', async () => {
    const deps = makeDeps();
    deps.dispatch.handle.mockRejectedValueOnce(new Error('push down'));

    const result = await build(deps).handle({
      actorUserId: ActorId,
      transactionId: TransactionId,
      reason: 'đóng nhầm',
    });

    expect(result.transaction.transactionId).toBe(TransactionId);
    expect(deps.dispatch.handle).toHaveBeenCalledTimes(2);
    expect(deps.dispatch.handle).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: ReceiverId }),
    );
  });

  it.each([
    [
      'lượt trao chưa đóng',
      new GiftTransactionInvalidStateException('ACCEPTED'),
    ],
    [
      'bài đã hết hàng khi mở lại lượt CANCELLED',
      new GiftTransactionOutOfStockException(),
    ],
  ])(
    '%s: lỗi của repository đi nguyên ra, không báo ai',
    async (_label, error) => {
      const deps = makeDeps();
      deps.transactions.reopen.mockRejectedValueOnce(error);

      await expect(
        build(deps).handle({
          actorUserId: ActorId,
          transactionId: TransactionId,
          reason: 'đóng nhầm',
        }),
      ).rejects.toBe(error);

      expect(deps.dispatch.handle).not.toHaveBeenCalled();
    },
  );
});
