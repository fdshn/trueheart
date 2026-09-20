import { GiftTransactionRepository } from './gift-transaction.repository';

const PostId = '30000000-0000-4000-8000-000000000001';
const GiverId = '10000000-0000-4000-8000-000000000001';
const ReceiverId = '20000000-0000-4000-8000-000000000002';
const TransactionId = '40000000-0000-4000-8000-000000000003';

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    global_id: TransactionId,
    post_id: PostId,
    giver_id: GiverId,
    receiver_id: ReceiverId,
    quantity: 1,
    status: 'REQUESTED',
    requested_at: new Date('2026-09-20T00:00:00.000Z'),
    accepted_at: null,
    completed_at: null,
    ...overrides,
  };
}

function makeRepository(query: jest.Mock) {
  return new GiftTransactionRepository({
    query,
    transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
  } as never);
}

describe('GiftTransactionRepository accept', () => {
  it('trừ tồn kho nguyên tử bằng UPDATE có điều kiện, không đọc rồi ghi', async () => {
    // Đọc remaining rồi mới ghi thì hai người tặng duyệt cùng lúc sẽ phát quá
    // số lượng thật. Phải là UPDATE ... WHERE remaining_quantity > 0.
    const query = jest
      .fn()
      .mockResolvedValueOnce([transactionRow()])
      .mockResolvedValueOnce([{ global_id: PostId }])
      .mockResolvedValueOnce([
        transactionRow({ status: 'ACCEPTED', accepted_at: new Date() }),
      ]);
    const repository = makeRepository(query);

    await repository.accept(TransactionId, GiverId);

    const decrement = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE posts'),
    );
    expect(decrement).toBeDefined();
    expect(String(decrement?.[0])).toMatch(
      /remaining_quantity\s*=\s*remaining_quantity\s*-/,
    );
    expect(String(decrement?.[0])).toMatch(
      /WHERE[\s\S]*remaining_quantity\s*>=/,
    );
    expect(String(decrement?.[0])).toContain('RETURNING');
  });

  it('không duyệt được khi bài đã hết hàng', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([transactionRow()])
      // UPDATE không trả dòng nào nghĩa là đã hết hàng.
      .mockResolvedValueOnce([]);
    const repository = makeRepository(query);

    await expect(repository.accept(TransactionId, GiverId)).rejects.toThrow();
    const statusUpdate = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE gift_transactions'),
    );
    expect(statusUpdate).toBeUndefined();
  });

  it('chỉ người tặng mới duyệt được', async () => {
    const query = jest.fn().mockResolvedValueOnce([transactionRow()]);
    const repository = makeRepository(query);

    await expect(
      repository.accept(TransactionId, ReceiverId),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('không duyệt lại lượt đã duyệt', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([transactionRow({ status: 'ACCEPTED' })]);
    const repository = makeRepository(query);

    await expect(repository.accept(TransactionId, GiverId)).rejects.toThrow();
  });
});

describe('GiftTransactionRepository confirmReceipt', () => {
  it('chỉ người nhận mới xác nhận được', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([transactionRow({ status: 'ACCEPTED' })]);
    const repository = makeRepository(query);

    await expect(
      repository.confirmReceipt(TransactionId, GiverId),
    ).rejects.toThrow();
  });

  it('đặt completed_at khi hoàn tất, vì rank đếm theo mốc đó', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([transactionRow({ status: 'ACCEPTED' })])
      .mockResolvedValueOnce([
        transactionRow({ status: 'COMPLETED', completed_at: new Date() }),
      ]);
    const repository = makeRepository(query);

    const result = await repository.confirmReceipt(TransactionId, ReceiverId);

    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).not.toBeNull();
    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE gift_transactions'),
    );
    expect(String(update?.[0])).toContain('completed_at');
  });
});

describe('GiftTransactionRepository auto-complete', () => {
  it('claim bằng SKIP LOCKED và chỉ lấy lượt quá hạn', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ global_id: TransactionId }])
      .mockResolvedValueOnce([]);
    const repository = makeRepository(query);

    await expect(repository.completeDueDeliveries(5)).resolves.toBe(1);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('FOR UPDATE SKIP LOCKED');
    expect(String(sql)).toMatch(/accepted_at\s*<=/);
    expect(params).toEqual([5]);
  });
});

describe('GiftTransactionRepository activity counting', () => {
  it('chỉ đếm lượt COMPLETED của người tặng', async () => {
    const query = jest.fn().mockResolvedValue([{ total: '3' }]);
    const repository = makeRepository(query);

    await expect(repository.countCompletedByGiver(GiverId)).resolves.toBe(3);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain("status = 'COMPLETED'");
    expect(String(sql)).toContain('giver_id');
    expect(params).toEqual([GiverId]);
  });

  it('đếm trong đúng cửa sổ chu kỳ khi được yêu cầu', async () => {
    const query = jest.fn().mockResolvedValue([{ total: '2' }]);
    const repository = makeRepository(query);
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-10-01T00:00:00.000Z');

    await repository.countCompletedByGiver(GiverId, { from, to });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/completed_at\s*>=/);
    expect(String(sql)).toMatch(/completed_at\s*</);
    expect(params).toEqual([GiverId, from, to]);
  });
});
