import { GiftPostNotFoundException } from '@/domain/exceptions';
import {
  BenThanhMarket,
  makeConfigMock,
  makeGiftPost,
  makeRepositoryMock,
} from './__fixtures';
import { GetGiftPostUseCase } from './get-gift-post.use-case';

describe('GetGiftPostUseCase', () => {
  const giftPostId = '11111111-1111-1111-1111-111111111111';

  it('làm nhiễu toạ độ khi người gọi chưa được duyệt nhận', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(makeGiftPost());

    const result = await new GetGiftPostUseCase(
      repository,
      makeConfigMock(),
    ).handle({ giftPostId });

    expect(result.isLocationApproximate).toBe(true);
    expect(result.giftPost.location).not.toEqual(BenThanhMarket);
  });

  it('trả toạ độ chính xác khi người gọi đã được duyệt nhận', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(makeGiftPost());

    const result = await new GetGiftPostUseCase(
      repository,
      makeConfigMock(),
    ).handle({ giftPostId, canViewExactLocation: true });

    expect(result.isLocationApproximate).toBe(false);
    expect(result.giftPost.location).toEqual(BenThanhMarket);
  });

  it('ném GiftPostNotFoundException khi không có bản ghi', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(null);

    await expect(
      new GetGiftPostUseCase(repository, makeConfigMock()).handle({
        giftPostId,
      }),
    ).rejects.toBeInstanceOf(GiftPostNotFoundException);
  });

  it('coi bản ghi đã xoá mềm như không tồn tại', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(
      makeGiftPost({ deletedAt: new Date() }),
    );

    await expect(
      new GetGiftPostUseCase(repository, makeConfigMock()).handle({
        giftPostId,
      }),
    ).rejects.toBeInstanceOf(GiftPostNotFoundException);
  });
});
