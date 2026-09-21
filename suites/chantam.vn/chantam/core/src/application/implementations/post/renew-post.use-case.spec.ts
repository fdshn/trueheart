import {
  PostNotFoundException,
  PostNotRenewableException,
  PostQuotaExceededException,
  PostRenewalLimitReachedException,
} from '@/domain/exceptions';
import {
  IEntitlementRepository,
  IPostRepository,
  IRenewPostParams,
  RenewPostOutcome,
} from '@/domain/ports/repository';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { PostLifetimeMonths } from '@chantam.vn/chantam.core-lib/models';
import { RenewPostUseCase } from './renew-post.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const UserId = '22222222-2222-2222-2222-222222222222';

function makeRepositories(outcome: RenewPostOutcome, limit = 3) {
  const posts = {
    renewPost: jest.fn(async (_params: IRenewPostParams) => outcome),
  } as unknown as jest.Mocked<IPostRepository>;

  const entitlements = {
    getCapability: jest.fn(async (_userId: string, _code: string) => ({
      allowed: true,
      limit,
    })),
  } as unknown as jest.Mocked<IEntitlementRepository>;

  return { posts, entitlements };
}

describe('RenewPostUseCase', () => {
  it('gia hạn thành công và đặt hạn mới cách hôm nay đúng số tháng quy định', async () => {
    const post = { globalId: PostId } as IPostEntity;
    const { posts, entitlements } = makeRepositories({
      status: 'RENEWED',
      post,
    });

    const result = await new RenewPostUseCase(posts, entitlements).handle({
      postId: PostId,
      userId: UserId,
    });

    expect(result.post).toBe(post);

    const [params] = posts.renewPost.mock.calls[0];
    const expected = new Date();
    expected.setMonth(expected.getMonth() + PostLifetimeMonths);
    // So tới ngày, không so tới mili-giây: hai lời gọi `new Date()` cách nhau
    // vài mili-giây vẫn phải coi là cùng một hạn.
    expect(params.expiresAt.toDateString()).toBe(expected.toDateString());
    expect(params.authorId).toBe(UserId);
  });

  it('lấy trần quota HIỆN TẠI chứ không phải trần lúc bài được đăng', async () => {
    // "Tính quota như bài mới" (CHỐT-07) nghĩa là chịu đúng luật đang áp cho
    // một bài mới — hạng của tác giả có thể đã tụt từ lúc bài lên.
    const { posts, entitlements } = makeRepositories(
      { status: 'RENEWED', post: {} as IPostEntity },
      10,
    );

    await new RenewPostUseCase(posts, entitlements).handle({
      postId: PostId,
      userId: UserId,
    });

    expect(entitlements.getCapability).toHaveBeenCalledWith(
      UserId,
      'POST_OFFER',
    );
    expect(posts.renewPost.mock.calls[0][0].quota).toBe(10);
  });

  it('hết hạn mức thì báo đúng con số trần', async () => {
    const { posts, entitlements } = makeRepositories(
      { status: 'QUOTA_EXCEEDED' },
      3,
    );

    await expect(
      new RenewPostUseCase(posts, entitlements).handle({
        postId: PostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostQuotaExceededException);
  });

  it('gia hạn lần hai thì bị chặn', async () => {
    const { posts, entitlements } = makeRepositories({
      status: 'LIMIT_REACHED',
    });

    await expect(
      new RenewPostUseCase(posts, entitlements).handle({
        postId: PostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostRenewalLimitReachedException);
  });

  it('sai loại bài hoặc sai trạng thái thì báo không gia hạn được', async () => {
    const { posts, entitlements } = makeRepositories({
      status: 'NOT_RENEWABLE',
    });

    await expect(
      new RenewPostUseCase(posts, entitlements).handle({
        postId: PostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostNotRenewableException);
  });

  it('bài của người khác trả về NOT_FOUND, không phải FORBIDDEN', async () => {
    // Trả lời khác nhau giữa "không có bài" và "bài của người khác" là cho
    // người lạ dò được id nào có thật.
    const { posts, entitlements } = makeRepositories({ status: 'NOT_FOUND' });

    await expect(
      new RenewPostUseCase(posts, entitlements).handle({
        postId: PostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('không có capability thì quota là 0, không phải vô hạn', async () => {
    const posts = {
      renewPost: jest.fn(async (_params: IRenewPostParams) => ({
        status: 'QUOTA_EXCEEDED' as const,
      })),
    } as unknown as jest.Mocked<IPostRepository>;
    const entitlements = {
      getCapability: jest.fn(async (_userId: string, _code: string) => null),
    } as unknown as jest.Mocked<IEntitlementRepository>;

    await expect(
      new RenewPostUseCase(posts, entitlements).handle({
        postId: PostId,
        userId: UserId,
      }),
    ).rejects.toBeInstanceOf(PostQuotaExceededException);
    expect(posts.renewPost.mock.calls[0][0].quota).toBe(0);
  });
});
