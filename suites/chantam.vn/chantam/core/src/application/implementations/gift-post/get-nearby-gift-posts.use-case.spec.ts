import {
  BenThanhMarket,
  makeConfigMock,
  makeGiftPost,
  makeRepositoryMock,
} from './__fixtures';
import { GetNearbyGiftPostsUseCase } from './get-nearby-gift-posts.use-case';

describe('GetNearbyGiftPostsUseCase', () => {
  const command = {
    ...BenThanhMarket,
    radiusMeters: 5_000,
    page: 1,
    pageSize: 20,
  };

  it('chuyển page/pageSize thành skip/take cho repository', async () => {
    const repository = makeRepositoryMock();
    repository.findNearby.mockResolvedValue({ items: [], total: 0 });

    await new GetNearbyGiftPostsUseCase(repository, makeConfigMock()).handle({
      ...command,
      page: 3,
      pageSize: 10,
    });

    expect(repository.findNearby).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('luôn làm nhiễu toạ độ vì đây là kênh công khai', async () => {
    const repository = makeRepositoryMock();
    repository.findNearby.mockResolvedValue({
      items: [{ giftPost: makeGiftPost(), distanceMeters: 431.7 }],
      total: 1,
    });

    const result = await new GetNearbyGiftPostsUseCase(
      repository,
      makeConfigMock(),
    ).handle(command);

    expect(result.giftPosts[0].isLocationApproximate).toBe(true);
    expect(result.giftPosts[0].giftPost.location).not.toEqual(BenThanhMarket);
  });

  it('làm tròn thô khoảng cách để không giải tam giác ra vị trí thật', async () => {
    const repository = makeRepositoryMock();
    repository.findNearby.mockResolvedValue({
      items: [{ giftPost: makeGiftPost(), distanceMeters: 431.7 }],
      total: 1,
    });

    const result = await new GetNearbyGiftPostsUseCase(
      repository,
      makeConfigMock(),
    ).handle(command);

    expect(result.giftPosts[0].distanceMeters).toBe(400);
  });

  it('tính đúng thông tin phân trang', async () => {
    const repository = makeRepositoryMock();
    repository.findNearby.mockResolvedValue({ items: [], total: 45 });

    const result = await new GetNearbyGiftPostsUseCase(
      repository,
      makeConfigMock(),
    ).handle({ ...command, page: 2, pageSize: 20 });

    expect(result.meta).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });
});
