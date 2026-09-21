import { GiftRequestNotFoundException } from '@/domain/exceptions';
import { IGiftRequestRepository } from '@/domain/ports/repository';
import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import { WithdrawGiftRequestUseCase } from './withdraw-gift-request.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const RequesterId = '33333333-3333-3333-3333-333333333333';

function makeRequest(
  overrides: Partial<IGiftRequestEntity> = {},
): IGiftRequestEntity {
  return {
    id: 1,
    globalId: '44444444-4444-4444-4444-444444444444',
    postId: PostId,
    requesterId: RequesterId,
    message: 'Em xin món này ạ',
    status: GiftRequestStatuses.PENDING,
    queueJoinedAt: new Date(),
    withdrawnAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('WithdrawGiftRequestUseCase', () => {
  it('rút yêu cầu thành công khi request đang ở trạng thái PENDING', async () => {
    const existing = makeRequest();

    const giftRequestRepo = {
      findByPostAndRequester: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockResolvedValue(existing),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new WithdrawGiftRequestUseCase(giftRequestRepo);
    const result = await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
    });

    expect(existing.status).toBe(GiftRequestStatuses.WITHDRAWN);
    expect(existing.withdrawnAt).toBeInstanceOf(Date);
    expect(giftRequestRepo.save).toHaveBeenCalledWith(existing);
    expect(result.request.status).toBe(GiftRequestStatuses.WITHDRAWN);
  });

  it('ném GiftRequestNotFoundException nếu không tìm thấy yêu cầu', async () => {
    const giftRequestRepo = {
      findByPostAndRequester: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new WithdrawGiftRequestUseCase(giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
      }),
    ).rejects.toBeInstanceOf(GiftRequestNotFoundException);
  });

  it('ném GiftRequestNotFoundException nếu request không phải PENDING', async () => {
    const existing = makeRequest({ status: GiftRequestStatuses.ACCEPTED });
    const giftRequestRepo = {
      findByPostAndRequester: jest.fn().mockResolvedValue(existing),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new WithdrawGiftRequestUseCase(giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
      }),
    ).rejects.toBeInstanceOf(GiftRequestNotFoundException);
  });
});
