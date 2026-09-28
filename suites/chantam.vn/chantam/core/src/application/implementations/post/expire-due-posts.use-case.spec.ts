import { IPostRepository } from '@/domain/ports/repository';
import { ExpireDuePostsUseCase } from './expire-due-posts.use-case';

function makeRepository() {
  return {
    expireDuePosts: jest.fn(async (_now: Date) => ({
      expired: 4,
      convertedToOffer: 2,
    })),
  } as unknown as jest.Mocked<IPostRepository>;
}

/**
 * Dịch vụ đóng yêu cầu treo, dạng giả.
 *
 * Bài đóng lại mà để hàng đợi nguyên thì người xin không bao giờ nhận được câu
 * trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần của họ.
 */
function makeCloseOpenRequests() {
  return { closeFor: jest.fn(async () => 0) } as never;
}

describe('ExpireDuePostsUseCase', () => {
  it('trả về số bài đã đóng và số tin rao vặt đã chuyển', async () => {
    const repository = makeRepository();

    const result = await new ExpireDuePostsUseCase(
      repository,
      makeCloseOpenRequests(),
    ).handle({});

    expect(result).toEqual({ expired: 4, convertedToOffer: 2 });
  });

  it('mặc định lấy thời điểm hiện tại', async () => {
    const repository = makeRepository();
    const before = Date.now();

    await new ExpireDuePostsUseCase(repository, makeCloseOpenRequests()).handle(
      {},
    );

    const [now] = repository.expireDuePosts.mock.calls[0];
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('dùng mốc thời gian được bơm vào khi có', async () => {
    const repository = makeRepository();
    const pinned = new Date(2026, 5, 1);

    await new ExpireDuePostsUseCase(repository, makeCloseOpenRequests()).handle(
      { now: pinned },
    );

    expect(repository.expireDuePosts).toHaveBeenCalledWith(pinned);
  });
});
