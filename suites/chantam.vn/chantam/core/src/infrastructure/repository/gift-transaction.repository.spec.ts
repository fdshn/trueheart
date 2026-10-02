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

/**
 * Chat được mở khi duyệt và khoá khi kết thúc, trong CÙNG transaction (F34,
 * F38). Mock để kiểm rằng hai việc đó ĐƯỢC gọi với cùng `manager`.
 */
function makeChatRepository() {
  return {
    openRoomWithinTransaction: jest.fn(
      async (_manager: unknown, params: { transactionId: string }) => ({
        globalId: 'cafe0000-0000-4000-8000-000000000002',
        transactionId: params.transactionId,
      }),
    ),
    lockRoomWithinTransaction: jest.fn(
      async (_manager: unknown, _transactionId: string) => undefined,
    ),
  };
}

function makeLedgerRepository() {
  return {
    appendByRuleWithinTransaction: jest.fn(async () => ({
      entryId: 1,
      delta: 56,
      balance: 56,
      rawBalance: 56,
      lifetime: 56,
      applied: true,
    })),
  };
}

function makeRepository(
  query: jest.Mock,
  chat: ReturnType<typeof makeChatRepository> = makeChatRepository(),
  ledger: ReturnType<typeof makeLedgerRepository> = makeLedgerRepository(),
  checkIn: { accrueFromCompletedTransaction: jest.Mock } = {
    accrueFromCompletedTransaction: jest.fn().mockResolvedValue(undefined),
  },
) {
  return new GiftTransactionRepository(
    {
      query,
      transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
    } as never,
    chat as never,
    ledger as never,
    checkIn as never,
  );
}

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
      .mockResolvedValueOnce([])
      // Lần đọc cuối: bản ghi đầy đủ của những lượt vừa đóng, để nơi gọi còn
      // BÁO cho hai bên. Con số không đủ — ở đường tự hoàn tất người dùng không
      // bấm gì cả, nên thông báo là cách duy nhất họ biết.
      .mockResolvedValue([]);
    const repository = makeRepository(query);

    await expect(repository.completeDueDeliveries(5)).resolves.toEqual({
      completed: 1,
      heldForDispute: 0,
      completedTransactions: [],
    });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('FOR UPDATE SKIP LOCKED');
    // Đếm từ lần cuối CÓ CHUYỆN XẢY RA, không phải từ lúc duyệt: ship liên
    // tỉnh 4–5 ngày thì đếm từ `accepted_at` sẽ đóng lượt trao trước khi hàng
    // tới nơi. Một `accepted_at <=` trần ở đây là dấu hiệu lỗi đó quay lại.
    expect(String(sql)).toMatch(
      /COALESCE\(\s*handed_over_at\s*,\s*accepted_at\s*\)\s*<=/,
    );
    expect(String(sql)).not.toMatch(/AND\s+accepted_at\s*<=/);
    expect(params).toEqual([5]);

    // Lượt đang có báo xấu chưa xử phải bị GIỮ LẠI. Đánh một lượt trao đang bị
    // nghi là "thành công" vừa cộng điểm cho người có thể gian lận, vừa ghi công
    // người nhận đã nhận món đồ mà họ chưa nhận.
    const disputeQuery = String(query.mock.calls[1][0]);
    expect(disputeQuery).toMatch(/status IN \('PENDING', 'IN_REVIEW'\)/);
    expect(disputeQuery).toMatch(/target_type = 'POST'/);
    // Báo xấu vào người tặng CHỈ tính khi do chính người nhận của lượt này gửi:
    // một báo xấu bất kỳ nhắm vào người tặng sẽ khoá mọi lượt trao của họ, và đó
    // là một đường phá hoại rẻ tiền.
    expect(disputeQuery).toMatch(/reporter_user_id = deal\.receiver_id/);
  });

  it('giữ lại lượt đang tranh chấp và KHÔNG cộng điểm cho nó', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ global_id: TransactionId }])
      .mockResolvedValueOnce([{ global_id: TransactionId }]);
    const repository = makeRepository(query);

    await expect(repository.completeDueDeliveries(5)).resolves.toEqual({
      completed: 0,
      heldForDispute: 1,
      // Không đóng lượt nào thì cũng không báo cho ai.
      completedTransactions: [],
    });

    // Không có câu UPDATE nào chạy: lượt duy nhất đủ hạn đang bị giữ.
    expect(
      query.mock.calls
        .map((call) => String(call[0]))
        .some((sql) => sql.includes('UPDATE gift_transactions')),
    ).toBe(false);
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

describe('GiftTransactionRepository open transaction count', () => {
  it('đếm lượt dở dang ở CẢ hai vai của người dùng', async () => {
    // Chỉ đếm một vai thì người đang chờ nhận hàng vẫn xoá được tài khoản.
    const query = jest.fn().mockResolvedValue([{ total: '2' }]);
    const repository = makeRepository(query);

    await expect(repository.countOpenForUser(GiverId)).resolves.toBe(2);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('giver_id = $1');
    expect(String(sql)).toContain('receiver_id = $1');
    expect(params).toEqual([GiverId]);
  });

  it('chỉ tính những trạng thái còn dở dang', async () => {
    const query = jest.fn().mockResolvedValue([{ total: '0' }]);
    const repository = makeRepository(query);

    await repository.countOpenForUser(GiverId);

    const sql = String(query.mock.calls[0][0]);
    for (const status of ['ACCEPTED', 'DELIVERING'])
      expect(sql).toContain(status);
    // Đã xong hoặc đã đóng thì không chặn xoá tài khoản nữa. `REQUESTED` và
    // `REJECTED` đã dọn 28/09 nên cũng không được xuất hiện lại ở đây.
    for (const status of ['COMPLETED', 'CANCELLED', 'REQUESTED', 'REJECTED'])
      expect(sql).not.toContain(status);
  });
});
