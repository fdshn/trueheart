import { RefundRedemptionOnCloseService } from './refund-redemption-on-close.service';

const RequestId = 'req-1';
const ActorId = 'actor-1';

function makeLedger(
  options: {
    entryId?: number | null;
    outcome?: unknown;
    reverseError?: unknown;
  } = {},
) {
  return {
    findEntryIdByIdempotencyKey: jest.fn(async (_key: string) =>
      options.entryId === undefined ? 42 : options.entryId,
    ),
    reverseEntry: options.reverseError
      ? jest.fn(async (_params: { entryId: number }) => {
          throw options.reverseError;
        })
      : jest.fn(
          async (_params: { entryId: number }) =>
            options.outcome ?? {
              status: 'REVERSED',
              userId: 'user-1',
              result: { entryId: 99, delta: 500 },
            },
        ),
  };
}

function build(ledger: ReturnType<typeof makeLedger>) {
  return new RefundRedemptionOnCloseService(ledger as never);
}

describe('RefundRedemptionOnCloseService', () => {
  it('hoàn ĐÚNG số điểm của bút toán gốc, không tính lại', async () => {
    // Cả lý do service này tồn tại. `reverseEntry` đọc `delta` của bút toán gốc,
    // nên không có đường nào tính lại theo giá hay tỷ lệ hiện tại — đúng điều
    // CHỐT-13 cấm.
    const ledger = makeLedger();

    const refunded = await build(ledger).refundFor({
      cancelledRequestId: RequestId,
      actorUserId: ActorId,
    });

    expect(refunded).toBe(500);
    expect(ledger.reverseEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 42, actorUserId: ActorId }),
    );
  });

  it('tra bút toán theo khoá ITEM_REDEMPTION của YÊU CẦU', async () => {
    const ledger = makeLedger();

    await build(ledger).refundFor({
      cancelledRequestId: RequestId,
      actorUserId: ActorId,
    });

    expect(ledger.findEntryIdByIdempotencyKey).toHaveBeenCalledWith(
      `ITEM_REDEMPTION:${RequestId}`,
    );
  });

  it('không có yêu cầu bị huỷ thì KHÔNG đụng sổ điểm', async () => {
    const ledger = makeLedger();

    const refunded = await build(ledger).refundFor({
      cancelledRequestId: null,
      actorUserId: ActorId,
    });

    expect(refunded).toBe(0);
    expect(ledger.findEntryIdByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('lượt trao thường (không qua đổi điểm) thì không hoàn gì', async () => {
    // Đây là đường PHỔ BIẾN nhất, nên nó không được là lỗi và không được log ồn.
    const ledger = makeLedger({ entryId: null });

    const refunded = await build(ledger).refundFor({
      cancelledRequestId: RequestId,
      actorUserId: ActorId,
    });

    expect(refunded).toBe(0);
    expect(ledger.reverseEntry).not.toHaveBeenCalled();
  });

  it('đã hoàn rồi thì trả 0, không ném', async () => {
    // Hai đường đóng lượt trao đều gọi tới đây, và khoá `REVERSAL:<entryId>` là
    // chỗ chặn lần thứ hai. Lần thứ hai phải im lặng, không phải lỗi.
    const ledger = makeLedger({ outcome: { status: 'NOT_REVERSIBLE' } });

    await expect(
      build(ledger).refundFor({
        cancelledRequestId: RequestId,
        actorUserId: ActorId,
      }),
    ).resolves.toBe(0);
  });

  it('lỗi khi hoàn KHÔNG ném ra — lượt huỷ đã commit', async () => {
    // Ném ở đây sẽ báo cho người dùng rằng huỷ thất bại trong khi nó đã xong.
    // Điểm chưa hoàn là một khoản nợ ĐỌC ĐƯỢC: bút toán trừ còn đó mà không có
    // `REVERSAL:<id>` đi kèm.
    const ledger = makeLedger({ reverseError: new Error('mất kết nối') });

    await expect(
      build(ledger).refundFor({
        cancelledRequestId: RequestId,
        actorUserId: ActorId,
      }),
    ).resolves.toBe(0);
  });

  it('trả số DƯƠNG dù bút toán gốc có delta âm', async () => {
    // Bút toán trừ có `delta = -500`; "đã hoàn 500 điểm" là câu nơi gọi cần.
    const ledger = makeLedger({
      outcome: {
        status: 'REVERSED',
        userId: 'user-1',
        result: { entryId: 99, delta: -500 },
      },
    });

    await expect(
      build(ledger).refundFor({
        cancelledRequestId: RequestId,
        actorUserId: ActorId,
      }),
    ).resolves.toBe(500);
  });
});
