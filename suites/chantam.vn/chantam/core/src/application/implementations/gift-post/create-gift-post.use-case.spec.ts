import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { BenThanhMarket, makeGiftPost, makeRepositoryMock } from './__fixtures';
import { CreateGiftPostUseCase } from './create-gift-post.use-case';

describe('CreateGiftPostUseCase', () => {
  const command = {
    giftPost: {
      title: 'Xe đạp cũ',
      description: 'Còn dùng tốt',
      category: 'VEHICLE' as never,
      condition: 'USED' as never,
      estimatedValue: 1_500_000,
      location: BenThanhMarket,
      areaLabel: 'Quận 1, TP.HCM',
      giverId: '22222222-2222-2222-2222-222222222222',
    },
  };

  it('tạo bài đăng ở trạng thái chờ kiểm duyệt', async () => {
    const repository = makeRepositoryMock();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await new CreateGiftPostUseCase(repository).handle(command);

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: GiftPostStatuses.PENDING_REVIEW }),
    );
  });

  it('mặc định số lượng là 1 và tồn kho bằng tổng số lượng', async () => {
    const repository = makeRepositoryMock();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await new CreateGiftPostUseCase(repository).handle(command);

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ totalQuantity: 1, remainingQuantity: 1 }),
    );
  });

  it('khởi tạo tồn kho bằng tổng số lượng khi đăng nhiều món', async () => {
    const repository = makeRepositoryMock();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await new CreateGiftPostUseCase(repository).handle({
      giftPost: { ...command.giftPost, totalQuantity: 100 },
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ totalQuantity: 100, remainingQuantity: 100 }),
    );
  });

  it('sinh globalId dạng uuid', async () => {
    const repository = makeRepositoryMock();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await new CreateGiftPostUseCase(repository).handle(command);

    const inserted = repository.insert.mock.calls[0][0] as { globalId: string };

    expect(inserted.globalId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
