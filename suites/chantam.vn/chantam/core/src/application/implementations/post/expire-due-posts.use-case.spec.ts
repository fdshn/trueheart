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

describe('ExpireDuePostsUseCase', () => {
  it('trả về số bài đã đóng và số tin rao vặt đã chuyển', async () => {
    const repository = makeRepository();

    const result = await new ExpireDuePostsUseCase(repository).handle({});

    expect(result).toEqual({ expired: 4, convertedToOffer: 2 });
  });

  it('mặc định lấy thời điểm hiện tại', async () => {
    const repository = makeRepository();
    const before = Date.now();

    await new ExpireDuePostsUseCase(repository).handle({});

    const [now] = repository.expireDuePosts.mock.calls[0];
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('dùng mốc thời gian được bơm vào khi có', async () => {
    const repository = makeRepository();
    const pinned = new Date(2026, 5, 1);

    await new ExpireDuePostsUseCase(repository).handle({ now: pinned });

    expect(repository.expireDuePosts).toHaveBeenCalledWith(pinned);
  });
});
