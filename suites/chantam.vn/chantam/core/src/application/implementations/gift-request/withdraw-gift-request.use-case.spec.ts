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
    status: GiftRequestStatuses.WITHDRAWN,
    queueJoinedAt: new Date(),
    withdrawnAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeRepository(withdrawn: IGiftRequestEntity | null) {
  return {
    withdrawIfPending: jest.fn(
      async (_postId: string, _requesterId: string) => withdrawn,
    ),
    findByPostAndRequester: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IGiftRequestRepository>;
}

describe('WithdrawGiftRequestUseCase', () => {
  it('rút được yêu cầu đang PENDING', async () => {
    const repository = makeRepository(makeRequest());

    const result = await new WithdrawGiftRequestUseCase(repository).handle({
      postId: PostId,
      requesterId: RequesterId,
    });

    expect(repository.withdrawIfPending).toHaveBeenCalledWith(
      PostId,
      RequesterId,
    );
    expect(result.request.status).toBe(GiftRequestStatuses.WITHDRAWN);
  });

  it('để DATABASE quyết, không đọc rồi ghi', async () => {
    // Đọc-rồi-ghi mở ra một cửa sổ: bên rút đọc thấy PENDING, bên duyệt commit
    // (trừ tồn kho, tạo giao dịch), rồi câu ghi của bên rút đáp xuống và biến
    // yêu cầu ACCEPTED thành WITHDRAWN — để lại một giao dịch đang sống gắn
    // với yêu cầu mà hệ thống nói đã rút.
    const repository = makeRepository(makeRequest());

    await new WithdrawGiftRequestUseCase(repository).handle({
      postId: PostId,
      requesterId: RequesterId,
    });

    expect(repository.findByPostAndRequester).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('không rút được thì báo không tìm thấy', async () => {
    // `null` gộp cả hai trường hợp: yêu cầu không tồn tại, và yêu cầu không
    // còn PENDING. Cả hai đều do mệnh đề WHERE của câu UPDATE quyết định.
    const repository = makeRepository(null);

    await expect(
      new WithdrawGiftRequestUseCase(repository).handle({
        postId: PostId,
        requesterId: RequesterId,
      }),
    ).rejects.toBeInstanceOf(GiftRequestNotFoundException);
  });
});
