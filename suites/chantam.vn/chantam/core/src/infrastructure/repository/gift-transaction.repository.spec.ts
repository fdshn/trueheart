import { giftCompletionIdempotencyKey } from '@/application/implementations/review/award-gift-completion.use-case';
import { PointDailyCapReachedException } from '@/domain/exceptions';
import {
  GiftCompletedGiverRuleCode,
  GiftCompletedReceiverRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';
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

/**
 * Hai tham số được KHAI TƯỜNG MINH dù thân hàm không dùng tới.
 *
 * `jest.fn(async () => ...)` suy ra `mock.calls` là `[]`, nên mọi phép kiểm đọc
 * `calls[i][1]` sẽ không biên dịch được — và cách chữa nhanh là rải `as never`
 * khắp nơi, tức bỏ luôn kiểu của chính thứ đang kiểm.
 */
function makeLedgerRepository() {
  return {
    appendByRuleWithinTransaction: jest.fn(
      async (
        _manager: unknown,
        _command: { userId: string; ruleCode: string; idempotencyKey: string },
      ) => ({
        entryId: 1,
        delta: 56,
        balance: 56,
        rawBalance: 56,
        lifetime: 56,
        applied: true,
      }),
    ),
  };
}

function makeRepository(
  query: jest.Mock,
  chat: ReturnType<typeof makeChatRepository> = makeChatRepository(),
  ledger: ReturnType<typeof makeLedgerRepository> = makeLedgerRepository(),
  checkIn: { accrueFromCompletedTransaction: jest.Mock } = {
    accrueFromCompletedTransaction: jest.fn().mockResolvedValue(undefined),
  },
  affiliate: { recordEvent: jest.Mock } = {
    recordEvent: jest.fn().mockResolvedValue(null),
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
    affiliate as never,
  );
}

/**
 * Chuỗi `query` của một lượt `confirmReceipt` đi tới `COMPLETED`.
 *
 * Hai lần đầu là `lockTransaction` rồi `UPDATE ... RETURNING`; mọi câu sau đó
 * (`awardAffiliateForCompletion` đọc toạ độ bài, `syncPostStatus`) chỉ cần trả
 * thứ ITERATE được, nếu không thì `const [post] = await query(...)` ném và lỗi
 * hiện ra như lỗi của chỗ khác.
 */
function completingQuery(overrides: Record<string, unknown> = {}) {
  return jest
    .fn()
    .mockResolvedValueOnce([
      transactionRow({ status: 'ACCEPTED', ...overrides }),
    ])
    .mockResolvedValueOnce([
      transactionRow({
        status: 'COMPLETED',
        completed_at: new Date(),
        ...overrides,
      }),
    ])
    .mockResolvedValue([]);
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
      ])
      // Mọi câu sau đó: `awardCompletionPoints`, `awardAffiliateForCompletion` (đọc
      // toạ độ bài), `syncPostStatus`. Trả mảng rỗng là đủ — phép kiểm này chỉ quan
      // tâm câu UPDATE đặt `completed_at`, nhưng mock phải trả thứ ITERATE được, nếu
      // không thì `const [post] = await query(...)` ném và lỗi hiện ra như một lỗi
      // của chỗ khác.
      .mockResolvedValue([]);
    const repository = makeRepository(query);

    const result = await repository.confirmReceipt(TransactionId, ReceiverId);

    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).not.toBeNull();
    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE gift_transactions'),
    );
    expect(String(update?.[0])).toContain('completed_at');
  });

  it('cộng điểm cho CẢ HAI bên ngay tại COMPLETED (CHỐT-14)', async () => {
    // Tới 06/10 chỉ người nhận được cộng ở đây, vì điểm người tặng còn phụ thuộc
    // mức chính xác chưa ai chấm. CHỐT-14 tách phần đó ra `value_bonus`, nên điểm
    // hoàn tất là một con số đã biết ngay tại mốc này.
    const query = completingQuery();
    const ledger = makeLedgerRepository();
    const repository = makeRepository(query, makeChatRepository(), ledger);

    await repository.confirmReceipt(TransactionId, ReceiverId);

    const codes = ledger.appendByRuleWithinTransaction.mock.calls.map(
      (call) => call[1].ruleCode,
    );
    expect(codes).toHaveLength(2);
    expect(codes).toContain(GiftCompletedGiverRuleCode);
    expect(codes).toContain(GiftCompletedReceiverRuleCode);
  });

  it('khoá chống trùng của người tặng trùng KHÍT với đường đánh giá', async () => {
    // Phép kiểm quan trọng nhất của lượt sửa này. Ba đường cùng dẫn tới một bút
    // toán, và repository dựng khoá bằng chuỗi ghép tại chỗ vì tầng hạ tầng không
    // nhập từ tầng ứng dụng. Hai chuỗi lệch một ký tự là trả thưởng HAI LẦN cho
    // một lượt trao, trên một cái sổ chỉ ghi thêm.
    const query = completingQuery();
    const ledger = makeLedgerRepository();
    const repository = makeRepository(query, makeChatRepository(), ledger);

    await repository.confirmReceipt(TransactionId, ReceiverId);

    const giverCall = ledger.appendByRuleWithinTransaction.mock.calls.find(
      (call) => call[1].ruleCode === GiftCompletedGiverRuleCode,
    );
    expect(giverCall?.[1].idempotencyKey).toBe(
      giftCompletionIdempotencyKey(TransactionId),
    );
  });

  it('KHÔNG nhân điểm hoàn tất với mức chính xác', async () => {
    // `scaleRulePoints` chỉ trả trọn `rule.points` khi tham số này VẮNG, nên
    // truyền `100` cũng không tương đương về ý nghĩa.
    const query = completingQuery();
    const ledger = makeLedgerRepository();
    const repository = makeRepository(query, makeChatRepository(), ledger);

    await repository.confirmReceipt(TransactionId, ReceiverId);

    for (const call of ledger.appendByRuleWithinTransaction.mock.calls)
      expect(call[1]).not.toHaveProperty('multiplierPercent');
  });

  it('xin khoá theo userId tăng dần, không theo vai — chặn deadlock', async () => {
    // Cả hai lượt cộng lấy `pg_advisory_xact_lock(hashtext(userId))` và giữ tới
    // hết transaction. Hai lượt trao TẶNG CHÉO nhau hoàn tất cùng lúc sẽ xin hai
    // khoá theo hai thứ tự ngược nhau — đó là deadlock. Một thứ tự toàn cục làm
    // nó không còn đường xảy ra.
    //
    // `GiverId` bắt đầu bằng '1', `ReceiverId` bằng '2', nên thứ tự đúng là người
    // tặng trước — NGƯỢC với thứ tự vai mà mã nguồn dựng mảng.
    const query = completingQuery();
    const ledger = makeLedgerRepository();
    const repository = makeRepository(query, makeChatRepository(), ledger);

    await repository.confirmReceipt(TransactionId, ReceiverId);

    expect(
      ledger.appendByRuleWithinTransaction.mock.calls.map(
        (call) => call[1].userId,
      ),
    ).toEqual([GiverId, ReceiverId]);
  });

  it('người tặng và người nhận là MỘT người thì không cộng phần người tặng', async () => {
    // `CannotRequestOwnPostException` chặn ở tầng use case, nhưng một chốt ở tầng
    // use case không phải một chốt ở sổ điểm — và cái giá của việc lọt là 56 + 28
    // điểm cho một "lượt trao" chỉ có một phía.
    const query = completingQuery({ giver_id: ReceiverId });
    const ledger = makeLedgerRepository();
    const repository = makeRepository(query, makeChatRepository(), ledger);

    await repository.confirmReceipt(TransactionId, ReceiverId);

    expect(
      ledger.appendByRuleWithinTransaction.mock.calls.map(
        (call) => call[1].ruleCode,
      ),
    ).toEqual([GiftCompletedReceiverRuleCode]);
  });

  it('người tặng chạm trần ngày thì người NHẬN vẫn được cộng', async () => {
    // Trần ngày của `GIFT_COMPLETED_GIVER` là 10. `try/catch` phải nằm TRONG vòng
    // lặp: đặt ngoài thì lượt trao thứ 11 của một người tặng làm người nhận mất
    // điểm, vì một ngoại lệ của bên này cuốn luôn bên kia.
    const query = completingQuery();
    const ledger = makeLedgerRepository();
    ledger.appendByRuleWithinTransaction.mockImplementation(
      async (_manager, command) => {
        if (command.ruleCode === GiftCompletedGiverRuleCode)
          throw new PointDailyCapReachedException(
            GiftCompletedGiverRuleCode,
            10,
          );
        return {
          entryId: 1,
          delta: 28,
          balance: 28,
          rawBalance: 28,
          lifetime: 0,
          applied: true,
        };
      },
    );
    const repository = makeRepository(query, makeChatRepository(), ledger);

    const result = await repository.confirmReceipt(TransactionId, ReceiverId);

    expect(result.status).toBe('COMPLETED');
    expect(
      ledger.appendByRuleWithinTransaction.mock.calls.map(
        (call) => call[1].ruleCode,
      ),
    ).toEqual([GiftCompletedGiverRuleCode, GiftCompletedReceiverRuleCode]);
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
