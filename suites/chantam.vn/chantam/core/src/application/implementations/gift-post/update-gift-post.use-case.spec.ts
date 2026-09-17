import {
  GiftPostAlreadyClosedException,
  GiftPostNotFoundException,
} from '@/domain/exceptions';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { makeGiftPost, makeRepositoryMock } from './__fixtures';
import { UpdateGiftPostUseCase } from './update-gift-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';

describe('UpdateGiftPostUseCase', () => {
  const giftPostId = '11111111-1111-1111-1111-111111111111';

  it('chỉ ghi những trường thực sự được gửi lên', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(makeGiftPost({ giverId: UserId }));
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await new UpdateGiftPostUseCase(repository).handle({
      userId: UserId,
      giftPostId,
      giftPost: { title: 'Tiêu đề mới', description: undefined },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: giftPostId },
      { title: 'Tiêu đề mới' },
    );
  });

  it('từ chối người không phải chủ bài', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(
      makeGiftPost({ giverId: 'nguoi-khac' }),
    );

    await expect(
      new UpdateGiftPostUseCase(repository).handle({
        userId: UserId,
        giftPostId,
        giftPost: { title: 'Tiêu đề mới' },
      }),
    ).rejects.toThrow();

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('từ chối chỉnh sửa bài đã đóng', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(
      makeGiftPost({ giverId: UserId, status: GiftPostStatuses.COMPLETED }),
    );

    await expect(
      new UpdateGiftPostUseCase(repository).handle({
        userId: UserId,
        giftPostId,
        giftPost: { title: 'Tiêu đề mới' },
      }),
    ).rejects.toBeInstanceOf(GiftPostAlreadyClosedException);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('ném GiftPostNotFoundException khi không có bản ghi', async () => {
    const repository = makeRepositoryMock();
    repository.findOneBy.mockResolvedValue(null);

    await expect(
      new UpdateGiftPostUseCase(repository).handle({
        userId: UserId,
        giftPostId,
        giftPost: { title: 'Tiêu đề mới' },
      }),
    ).rejects.toBeInstanceOf(GiftPostNotFoundException);
  });
});
