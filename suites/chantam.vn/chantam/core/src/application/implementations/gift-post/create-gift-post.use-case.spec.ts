import {
  GiftPostStatuses,
  UserStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { BenThanhMarket, makeGiftPost, makeRepositoryMock } from './__fixtures';
import { CreateGiftPostUseCase } from './create-gift-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';
const CompleteUser = {
  globalId: UserId,
  username: 'nguoi-tang',
  passwordHash: 'hash',
  fullName: 'Người Tặng',
  avatarUrl: 'https://cdn.example.com/a.png',
  email: 'giver@example.com',
  phone: '0912345678',
  defaultLocation: null,
  rank: 'VIEWER',
  status: UserStatuses.ACTIVE,
  phoneVerifiedAt: null,
  suspendedUntil: null,
  deletedAt: null,
};

function makeUseCase(repository = makeRepositoryMock()) {
  const users = { findOneBy: jest.fn(async () => CompleteUser) };
  return {
    repository,
    useCase: new CreateGiftPostUseCase(repository, users as never),
  };
}

describe('CreateGiftPostUseCase', () => {
  const command = {
    userId: UserId,
    giftPost: {
      title: 'Xe đạp cũ',
      description: 'Còn dùng tốt',
      category: 'VEHICLE' as never,
      condition: 'USED' as never,
      estimatedValue: 1_500_000,
      location: BenThanhMarket,
      areaLabel: 'Quận 1, TP.HCM',
    },
  };

  it('tạo bài đăng ở trạng thái chờ kiểm duyệt', async () => {
    const { repository, useCase } = makeUseCase();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await useCase.handle(command);

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: GiftPostStatuses.PENDING_REVIEW }),
    );
  });

  it('mặc định số lượng là 1 và tồn kho bằng tổng số lượng', async () => {
    const { repository, useCase } = makeUseCase();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await useCase.handle(command);

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ totalQuantity: 1, remainingQuantity: 1 }),
    );
  });

  it('khởi tạo tồn kho bằng tổng số lượng khi đăng nhiều món', async () => {
    const { repository, useCase } = makeUseCase();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await useCase.handle({
      ...command,
      giftPost: { ...command.giftPost, totalQuantity: 100 },
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ totalQuantity: 100, remainingQuantity: 100 }),
    );
  });

  it('sinh globalId dạng uuid', async () => {
    const { repository, useCase } = makeUseCase();
    repository.findOneByOrFail.mockResolvedValue(makeGiftPost());

    await useCase.handle(command);

    const inserted = repository.insert.mock.calls[0][0] as { globalId: string };

    expect(inserted.globalId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
