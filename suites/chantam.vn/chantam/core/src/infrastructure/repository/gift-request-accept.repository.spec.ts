import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { GiftRequestRepository } from './gift-request.repository';

const PostId = '11111111-1111-1111-1111-111111111111';
const RequestId = '44444444-4444-4444-4444-444444444444';
const GiverId = '22222222-2222-2222-2222-222222222222';
const RequesterId = '33333333-3333-3333-3333-333333333333';

const PendingRequest = {
  global_id: RequestId,
  post_id: PostId,
  requester_id: RequesterId,
  status: GiftRequestStatuses.PENDING,
};

function postRow(remaining = 3) {
  return {
    global_id: PostId,
    author_id: GiverId,
    status: 'PUBLISHED',
    remaining_quantity: remaining,
  };
}

/** Trả kết quả theo nội dung câu lệnh, để test không phụ thuộc thứ tự gọi. */
function makeQuery(options: {
  post?: ReturnType<typeof postRow>;
  transaction?: { global_id: string; status: string; quantity: string } | null;
}) {
  return jest.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);

    if (text.includes('FROM gift_requests') && text.includes('FOR UPDATE'))
      return [PendingRequest];
    if (text.includes('FROM gift_transactions') && text.includes('FOR UPDATE'))
      return options.transaction ? [options.transaction] : [];
    if (text.includes('FROM posts') && text.includes('FOR UPDATE'))
      return [options.post ?? postRow()];
    return [];
  });
}

function makeRepository(query: jest.Mock) {
  return new GiftRequestRepository(
    {} as never,
    {
      query,
      transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
    } as never,
  );
}

const Params = {
  requestId: RequestId,
  postId: PostId,
  giverId: GiverId,
  transactionId: '55555555-5555-4555-8555-555555555555',
};

/** Thứ tự các bảng bị khoá, theo đúng trình tự câu lệnh đã chạy. */
function lockOrder(query: jest.Mock): string[] {
  return query.mock.calls
    .map(([sql]) => String(sql))
    .filter((sql) => sql.includes('FOR UPDATE'))
    .map((sql) =>
      ['gift_requests', 'gift_transactions', 'posts'].find((table) =>
        new RegExp(`FROM ${table}\\b`).test(sql),
      ),
    )
    .filter(Boolean) as string[];
}

function postUpdate(query: jest.Mock): unknown[] | undefined {
  return query.mock.calls.find(([sql]) =>
    String(sql).includes('UPDATE posts SET remaining_quantity'),
  )?.[1] as unknown[] | undefined;
}

describe('GiftRequestRepository.acceptRequest — thứ tự khoá', () => {
  it('khoá gift_transactions TRƯỚC posts', async () => {
    // GiftTransactionRepository khoá gift_transactions rồi mới UPDATE posts.
    // Khoá ngược ở đây thì hai luồng duyệt chạy đồng thời trên cùng một bài
    // tạo chờ vòng tròn và Postgres huỷ một bên với 40P01.
    const query = makeQuery({});
    await makeRepository(query).acceptRequest(Params);

    const order = lockOrder(query);

    expect(order).toEqual(['gift_requests', 'gift_transactions', 'posts']);
  });
});

describe('GiftRequestRepository.acceptRequest — tồn kho', () => {
  it('từ chối khi lượt bàn giao đã được duyệt ở luồng kia', async () => {
    // Luồng /transactions đã trừ tồn kho khi chuyển sang ACCEPTED. Duyệt tiếp
    // ở đây là trừ hai lần cho MỘT lượt bàn giao.
    const query = makeQuery({
      transaction: { global_id: 'tx-1', status: 'ACCEPTED', quantity: '1' },
    });

    await expect(makeRepository(query).acceptRequest(Params)).rejects.toThrow();
    expect(postUpdate(query)).toBeUndefined();
  });

  it('nhận nuôi lượt REQUESTED và trừ ĐÚNG số lượng của nó', async () => {
    // `close()` hoàn lại theo `quantity` đã ghi. Trừ 1 mà hoàn 2 là tồn kho
    // tự nở ra sau mỗi lần huỷ.
    const query = makeQuery({
      post: postRow(5),
      transaction: { global_id: 'tx-1', status: 'REQUESTED', quantity: '2' },
    });

    const result = await makeRepository(query).acceptRequest(Params);

    expect(postUpdate(query)?.[0]).toBe(3);
    expect(result.transactionId).toBe('tx-1');
  });

  it('chưa có lượt nào thì tạo mới và trừ 1', async () => {
    const query = makeQuery({ post: postRow(3) });

    const result = await makeRepository(query).acceptRequest(Params);

    expect(postUpdate(query)?.[0]).toBe(2);
    expect(result.transactionId).toBe(Params.transactionId);
  });

  it('hết hàng thì từ chối, không ghi gì', async () => {
    const query = makeQuery({ post: postRow(0) });

    await expect(makeRepository(query).acceptRequest(Params)).rejects.toThrow();
    expect(postUpdate(query)).toBeUndefined();
  });
});

describe('GiftRequestRepository.acceptRequest — trạng thái bài', () => {
  it('còn hàng thì bài vẫn PUBLISHED để người khác xin tiếp', async () => {
    // Ép DELIVERING khi còn hàng là khoá bài nhiều món sau lần duyệt đầu:
    // không ai xin được nữa mà tác giả cũng không duyệt tiếp được.
    const query = makeQuery({ post: postRow(3) });

    await makeRepository(query).acceptRequest(Params);

    expect(postUpdate(query)?.[1]).toBe('PUBLISHED');
  });

  it('hết hàng thì chuyển DELIVERING và từ chối các yêu cầu còn lại', async () => {
    const query = makeQuery({ post: postRow(1) });

    await makeRepository(query).acceptRequest(Params);

    expect(postUpdate(query)?.[1]).toBe('DELIVERING');
    const rejectOthers = query.mock.calls.find(
      ([sql, params]) =>
        String(sql).includes('UPDATE gift_requests') &&
        (params as unknown[])?.[0] === GiftRequestStatuses.REJECTED,
    );
    expect(rejectOthers).toBeDefined();
  });
});
