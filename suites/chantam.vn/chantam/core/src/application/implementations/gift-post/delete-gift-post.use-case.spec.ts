import { GiftPostNotFoundException } from '@/domain/exceptions';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { makeGiftPost, makeRepositoryMock } from './__fixtures';
import { DeleteGiftPostUseCase } from './delete-gift-post.use-case';

describe('DeleteGiftPostUseCase', () => {
  const giftPostId = '11111111-1111-1111-1111-111111111111';

  it('xoá mềm chứ không xoá thật, và chuyển trạng thái sang CANCELLED', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(makeGiftPost());

    const result = await new DeleteGiftPostUseCase(repository).handle({
      giftPostId,
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: giftPostId },
      expect.objectContaining({
        deletedAt: expect.any(Date),
        status: GiftPostStatuses.CANCELLED,
      }),
    );
    expect(result.giftPostId).toBe(giftPostId);
  });

  it('không xoá lại bản ghi đã xoá mềm', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(
      makeGiftPost({ deletedAt: new Date() }),
    );

    await expect(
      new DeleteGiftPostUseCase(repository).handle({ giftPostId }),
    ).rejects.toBeInstanceOf(GiftPostNotFoundException);
  });
});
