import { IGiftRequestRepository } from '@/domain/ports/repository';
import { MaxBatchAcceptRequests } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { AcceptedRequestNotifier } from './accepted-request.notifier';
import { BatchAcceptRequestsUseCase } from './batch-accept-requests.use-case';

const PostId = '11111111-1111-4111-8111-111111111111';
const GiverId = '22222222-2222-4222-8222-222222222222';
const ReqA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ReqB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UserA = 'a1111111-1111-4111-8111-111111111111';
const UserB = 'b1111111-1111-4111-8111-111111111111';

function makeDeps(outcome?: unknown) {
  return {
    repo: {
      acceptRequestsBatch: jest.fn().mockResolvedValue(
        outcome ?? {
          accepted: [
            { requestId: ReqA, requesterId: UserA, transactionId: 'tx-a' },
            { requestId: ReqB, requesterId: UserB, transactionId: 'tx-b' },
          ],
          remainingQuantity: 3,
          standbyCount: 0,
        },
      ),
    } as unknown as jest.Mocked<IGiftRequestRepository>,
    notifier: {
      announce: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AcceptedRequestNotifier>,
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new BatchAcceptRequestsUseCase(deps.repo, deps.notifier);

describe('BatchAcceptRequestsUseCase', () => {
  it('giao cả lô cho MỘT lượt gọi repository, không lặp từng cái', async () => {
    // Đây là toàn bộ lý do use case này tồn tại: một vòng lặp gọi `acceptRequest`
    // tự phá chính nó khi suất cuối cạn.
    const deps = makeDeps();

    const result = await build(deps).handle({
      postId: PostId,
      userId: GiverId,
      requestIds: [ReqA, ReqB],
    });

    expect(deps.repo.acceptRequestsBatch).toHaveBeenCalledTimes(1);
    expect(deps.repo.acceptRequestsBatch).toHaveBeenCalledWith({
      postId: PostId,
      giverId: GiverId,
      requestIds: [ReqA, ReqB],
    });
    expect(result.accepted).toHaveLength(2);
    expect(result.remainingQuantity).toBe(3);
  });

  it('báo cho TỪNG người được chọn, với trigger MANUAL', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      postId: PostId,
      userId: GiverId,
      requestIds: [ReqA, ReqB],
    });

    expect(deps.notifier.announce).toHaveBeenCalledTimes(2);
    expect(deps.notifier.announce).toHaveBeenCalledWith({
      receiverId: UserA,
      giverId: GiverId,
      postId: PostId,
      transactionId: 'tx-a',
      trigger: 'MANUAL',
    });
    expect(deps.notifier.announce).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: UserB, transactionId: 'tx-b' }),
    );
  });

  it('lô rỗng bị từ chối TRƯỚC khi đụng database', async () => {
    const deps = makeDeps();

    await expect(
      build(deps).handle({ postId: PostId, userId: GiverId, requestIds: [] }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.repo.acceptRequestsBatch).not.toHaveBeenCalled();
  });

  it('id trùng bị TỪ CHỐI, không âm thầm khử trùng', async () => {
    // Khử hộ sẽ trả về "đã duyệt 1" cho một lần bấm chọn 2 người, và chủ bài đếm
    // lại rồi không hiểu người thứ hai đi đâu.
    const deps = makeDeps();

    await expect(
      build(deps).handle({
        postId: PostId,
        userId: GiverId,
        requestIds: [ReqA, ReqA],
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.repo.acceptRequestsBatch).not.toHaveBeenCalled();
  });

  it('vượt trần lô bị từ chối', async () => {
    const deps = makeDeps();
    const tooMany = Array.from(
      { length: MaxBatchAcceptRequests + 1 },
      (_, index) => `req-${index}`,
    );

    await expect(
      build(deps).handle({
        postId: PostId,
        userId: GiverId,
        requestIds: tooMany,
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.repo.acceptRequestsBatch).not.toHaveBeenCalled();
  });

  it('đúng trần lô thì CHO qua — biên là hợp lệ', async () => {
    const deps = makeDeps({
      accepted: [],
      remainingQuantity: 0,
      standbyCount: 0,
    });
    const exactly = Array.from(
      { length: MaxBatchAcceptRequests },
      (_, index) => `req-${index}`,
    );

    await build(deps).handle({
      postId: PostId,
      userId: GiverId,
      requestIds: exactly,
    });

    expect(deps.repo.acceptRequestsBatch).toHaveBeenCalled();
  });

  it('trả lại standbyCount của repository, không tự tính', async () => {
    // Hết suất thì những người còn lại vào hàng chờ (F33), và chỉ transaction
    // bên dưới biết con số đó.
    const deps = makeDeps({
      accepted: [
        { requestId: ReqA, requesterId: UserA, transactionId: 'tx-a' },
      ],
      remainingQuantity: 0,
      standbyCount: 4,
    });

    const result = await build(deps).handle({
      postId: PostId,
      userId: GiverId,
      requestIds: [ReqA],
    });

    expect(result.standbyCount).toBe(4);
    expect(result.remainingQuantity).toBe(0);
  });

  it('repository ném thì KHÔNG báo cho ai', async () => {
    // Hết suất giữa lô thì cả lô bị từ chối, nên không ai được thông báo là đã
    // được chọn.
    const deps = makeDeps();
    (deps.repo.acceptRequestsBatch as jest.Mock).mockRejectedValue(
      new Error('out of stock'),
    );

    await expect(
      build(deps).handle({
        postId: PostId,
        userId: GiverId,
        requestIds: [ReqA, ReqB],
      }),
    ).rejects.toThrow('out of stock');
    expect(deps.notifier.announce).not.toHaveBeenCalled();
  });
});
