import {
  GiftEvidenceKinds,
  ShipPayers,
} from '@chantam.vn/chantam.core-lib/consts';
import { ReportShipUnpaidUseCase } from './report-ship-unpaid.use-case';

const GiverId = 'giver-1';
const ReceiverId = 'receiver-1';
const TransactionId = 'tx-1';
const PostId = 'post-1';
const RequestId = 'req-da-doi-diem';

function makeTransactions(cancelledRequestId: string | null = RequestId) {
  return {
    findByGlobalId: jest.fn(async () => ({
      globalId: TransactionId,
      postId: PostId,
      giverId: GiverId,
      receiverId: ReceiverId,
      status: 'DELIVERING' as const,
    })),
    hasEvidence: jest.fn(async () => true),
    close: jest.fn(async () => ({
      transaction: { globalId: TransactionId, status: 'CANCELLED' as const },
      queue: { reopenedCount: 0, candidates: [], cancelledRequestId },
    })),
  };
}

function makeLedger() {
  return {
    appendByRule: jest.fn(async () => ({
      delta: -50,
      balance: 950,
      rawBalance: 950,
      applied: true,
    })),
  };
}

function build(
  overrides: {
    transactions?: ReturnType<typeof makeTransactions>;
    refund?: { refundFor: jest.Mock };
  } = {},
) {
  const transactions = overrides.transactions ?? makeTransactions();
  const refund = overrides.refund ?? { refundFor: jest.fn(async () => 0) };
  const useCase = new ReportShipUnpaidUseCase(
    transactions as never,
    {
      findOneBy: jest.fn(async () => ({
        globalId: PostId,
        shipPayer: ShipPayers.RECEIVER,
      })),
    } as never,
    makeLedger() as never,
    {
      confirmTransactionEvidenceUpload: jest.fn(async () => undefined),
    } as never,
    refund as never,
  );
  return { useCase, transactions, refund };
}

const Command = {
  userId: GiverId,
  transactionId: TransactionId,
  reason: 'Người nhận không trả phí ship',
  evidenceKeys: ['returned/1.jpg'],
};

describe('ReportShipUnpaidUseCase', () => {
  it('đóng lượt trao thì GỌI hoàn điểm, với id yêu cầu từ close() (CHỐT-13)', async () => {
    // Đây là đường đóng lượt trao THỨ HAI. Trước 11/10 cả hai đường đều không
    // hoàn, và đường này dễ bị bỏ sót hơn vì nó không tên là "huỷ".
    const { useCase, refund } = build();

    await useCase.handle(Command);

    expect(refund.refundFor).toHaveBeenCalledWith({
      cancelledRequestId: RequestId,
      actorUserId: GiverId,
    });
  });

  it('vẫn giữ khoản phạt không-trả-ship như một bút toán RIÊNG', async () => {
    // Hoàn điểm đổi vật phẩm và phạt không trả ship là hai việc khác nhau: một
    // cái trả lại thứ người ta đã đưa, một cái phạt hành vi. Hoàn cái này không
    // được xoá cái kia.
    const { useCase } = build();

    const result = await useCase.handle(Command);

    expect(result.penaltyPoints).toBe(-50);
    expect(result.penaltyApplied).toBe(true);
    expect(result.transactionStatus).toBe('CANCELLED');
  });

  it('hoàn điểm chạy SAU khi lượt trao đã đóng', async () => {
    // `reverseEntry` mở transaction riêng. Gọi trước khi đóng là hoàn điểm cho
    // một lượt trao có thể không đóng được — ví dụ nó vừa `COMPLETED`.
    const order: string[] = [];
    const transactions = makeTransactions();
    transactions.close = jest.fn(async () => {
      order.push('close');
      return {
        transaction: { globalId: TransactionId, status: 'CANCELLED' as const },
        queue: {
          reopenedCount: 0,
          candidates: [],
          cancelledRequestId: RequestId,
        },
      };
    }) as never;
    const refund = {
      refundFor: jest.fn(async () => {
        order.push('refund');
        return 500;
      }),
    };

    await build({ transactions, refund }).useCase.handle(Command);

    expect(order).toEqual(['close', 'refund']);
  });

  it('lượt trao thường (không qua đổi điểm) thì không có gì để hoàn', async () => {
    const { useCase, refund } = build({ transactions: makeTransactions(null) });

    await useCase.handle(Command);

    expect(refund.refundFor).toHaveBeenCalledWith({
      cancelledRequestId: null,
      actorUserId: GiverId,
    });
  });

  it('đòi ảnh RETURNED gửi kèm, không chỉ ảnh lúc trao', async () => {
    // Phép kiểm này không về hoàn điểm — nó là lưới đầu tiên cho use case này,
    // và điều kiện ảnh là thứ chặn một report dựng trên không có gì.
    const { useCase, transactions } = build();

    await expect(
      useCase.handle({ ...Command, evidenceKeys: [] }),
    ).rejects.toThrow();
    expect(transactions.close).not.toHaveBeenCalled();
    expect(transactions.hasEvidence).toHaveBeenCalledWith(
      TransactionId,
      GiftEvidenceKinds.HANDOVER,
    );
  });
});
