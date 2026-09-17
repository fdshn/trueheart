import { GiftPostNotFoundException } from '@/domain/exceptions';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { makeGiftPost, makeRepositoryMock } from './__fixtures';
import { DeleteGiftPostUseCase } from './delete-gift-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';

describe('DeleteGiftPostUseCase', () => {
  const giftPostId = '11111111-1111-1111-1111-111111111111';

  it('xoá mềm chứ không xoá thật, và chuyển trạng thái sang CANCELLED', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(makeGiftPost({ giverId: UserId }));

    const result = await new DeleteGiftPostUseCase(repository).handle({
      userId: UserId,
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

  it('từ chối người không phải chủ bài', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(
      makeGiftPost({ giverId: 'nguoi-khac' }),
    );

    await expect(
      new DeleteGiftPostUseCase(repository).handle({
        userId: UserId,
        giftPostId,
      }),
    ).rejects.toThrow();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('không xoá lại bản ghi đã xoá mềm', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(
      makeGiftPost({ deletedAt: new Date() }),
    );

    await expect(
      new DeleteGiftPostUseCase(repository).handle({
        userId: UserId,
        giftPostId,
      }),
    ).rejects.toBeInstanceOf(GiftPostNotFoundException);
  });
});
