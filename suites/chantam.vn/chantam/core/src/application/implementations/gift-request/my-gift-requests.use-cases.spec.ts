import { GiftRequestNotFoundException } from '@/domain/exceptions';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  ListMyGiftRequestsUseCase,
  RejectGiftRequestUseCase,
} from './my-gift-requests.use-cases';

const RequesterId = '11111111-1111-1111-1111-111111111111';
const OwnerId = '22222222-2222-2222-2222-222222222222';
const PostId = '33333333-3333-3333-3333-333333333333';
const RequestId = '44444444-4444-4444-4444-444444444444';

function makeConfig(publicBaseUrl = 'http://localhost:9000/chantam') {
  return { storage: { publicBaseUrl } } as never;
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    request: {
      globalId: RequestId,
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin ạ',
      status: GiftRequestStatuses.PENDING,
      queueJoinedAt: new Date('2026-09-20T00:00:00.000Z'),
      withdrawnAt: null,
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
      updatedAt: new Date('2026-09-20T00:00:00.000Z'),
    },
    postTitle: 'Tặng nồi cơm điện',
    postStatus: GiftPostStatuses.PUBLISHED,
    postThumbnailKey: 'users/u/posts/p/media/first.webp',
    ...overrides,
  };
}

describe('ListMyGiftRequestsUseCase', () => {
  it('ghép URL ảnh và trả tiêu đề bài ngay trên dòng', async () => {
    // Không có tiêu đề thì danh sách chỉ là một dãy id, và bài đã đóng thì mở
    // ra cũng không còn gì để xem.
    const repository = {
      listByRequester: jest.fn(async () => ({
        items: [makeRow()],
        total: 1,
      })),
    };

    const result = await new ListMyGiftRequestsUseCase(
      repository as never,
      makeConfig(),
    ).handle({ requesterId: RequesterId, page: 1, pageSize: 20 });

    expect(result.requests[0].postTitle).toBe('Tặng nồi cơm điện');
    expect(result.requests[0].postThumbnailUrl).toBe(
      'http://localhost:9000/chantam/users/u/posts/p/media/first.webp',
    );
    expect(result.meta.page).toBe(1);
  });

  it('bài không có ảnh thì trả null, không phải chuỗi URL cụt', async () => {
    const repository = {
      listByRequester: jest.fn(async () => ({
        items: [makeRow({ postThumbnailKey: null })],
        total: 1,
      })),
    };

    const result = await new ListMyGiftRequestsUseCase(
      repository as never,
      makeConfig(),
    ).handle({ requesterId: RequesterId, page: 1, pageSize: 20 });

    expect(result.requests[0].postThumbnailUrl).toBeNull();
  });

  it('bật cờ postClosed cho bài đã hết hạn — đây là cái người dùng cần tìm để rút', async () => {
    const repository = {
      listByRequester: jest.fn(async () => ({
        items: [
          makeRow({ postStatus: GiftPostStatuses.EXPIRED }),
          makeRow({ postStatus: GiftPostStatuses.RESERVED }),
        ],
        total: 2,
      })),
    };

    const result = await new ListMyGiftRequestsUseCase(
      repository as never,
      makeConfig(),
    ).handle({ requesterId: RequesterId, page: 1, pageSize: 20 });

    expect(result.requests[0].postClosed).toBe(true);
    // RESERVED là lượt trao đang chạy: người đứng STANDBY dưới nó vẫn được xét
    // tiếp nếu lượt đó đổ, nên bài CHƯA đóng.
    expect(result.requests[1].postClosed).toBe(false);
  });

  it('truyền đúng trang và bộ lọc trạng thái xuống repository', async () => {
    const repository = {
      listByRequester: jest.fn(async () => ({ items: [], total: 0 })),
    };

    await new ListMyGiftRequestsUseCase(
      repository as never,
      makeConfig(),
    ).handle({
      requesterId: RequesterId,
      status: GiftRequestStatuses.STANDBY,
      page: 3,
      pageSize: 10,
    });

    expect(repository.listByRequester).toHaveBeenCalledWith({
      requesterId: RequesterId,
      status: GiftRequestStatuses.STANDBY,
      skip: 20,
      take: 10,
    });
  });
});

describe('RejectGiftRequestUseCase', () => {
  function makePosts(overrides: Record<string, unknown> = {}) {
    return {
      findOneBy: jest.fn(async () => ({
        globalId: PostId,
        authorId: OwnerId,
        deletedAt: null,
        title: 'Tặng nồi cơm điện',
        ...overrides,
      })),
    };
  }

  function makeNotifier() {
    return { announceRejected: jest.fn(async () => undefined) };
  }

  it('người không phải chủ bài thì không từ chối được ai', async () => {
    const repository = { rejectIfOpen: jest.fn() };
    const notifier = makeNotifier();

    await expect(
      new RejectGiftRequestUseCase(
        repository as never,
        makePosts() as never,
        notifier as never,
      ).handle({ postId: PostId, requestId: RequestId, userId: RequesterId }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.rejectIfOpen).not.toHaveBeenCalled();
    expect(notifier.announceRejected).not.toHaveBeenCalled();
  });

  it('yêu cầu đã ACCEPTED không rơi vào đây — repo trả null thì báo không tìm thấy', async () => {
    // Từ chối một lượt trao đang sống là việc của `/transactions`, nơi tồn kho
    // và phòng chat phải dọn theo.
    const repository = { rejectIfOpen: jest.fn(async () => null) };
    const notifier = makeNotifier();

    await expect(
      new RejectGiftRequestUseCase(
        repository as never,
        makePosts() as never,
        notifier as never,
      ).handle({ postId: PostId, requestId: RequestId, userId: OwnerId }),
    ).rejects.toBeInstanceOf(GiftRequestNotFoundException);

    expect(notifier.announceRejected).not.toHaveBeenCalled();
  });

  it('từ chối xong thì báo cho người xin, kèm tên bài', async () => {
    const rejected = {
      ...makeRow().request,
      status: GiftRequestStatuses.REJECTED,
    };
    const repository = { rejectIfOpen: jest.fn(async () => rejected) };
    const notifier = makeNotifier();

    const result = await new RejectGiftRequestUseCase(
      repository as never,
      makePosts() as never,
      notifier as never,
    ).handle({ postId: PostId, requestId: RequestId, userId: OwnerId });

    expect(repository.rejectIfOpen).toHaveBeenCalledWith({
      postId: PostId,
      requestId: RequestId,
    });
    expect(notifier.announceRejected).toHaveBeenCalledWith({
      requesterId: RequesterId,
      postTitle: 'Tặng nồi cơm điện',
      requestId: RequestId,
    });
    expect(result.request.status).toBe(GiftRequestStatuses.REJECTED);
  });
});
