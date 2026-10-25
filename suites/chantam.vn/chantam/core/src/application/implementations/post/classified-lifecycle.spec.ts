import {
  ClassifiedTransactionNotSupportedException,
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  ClassifiedLegacyTransactionsConfigKey,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { AcceptGiftRequestUseCase } from '../gift-request/accept-gift-request.use-case';
import { CreateGiftRequestUseCase } from '../gift-request/create-gift-request.use-case';
import { UpdateClassifiedStatusUseCase } from './update-classified-status.use-case';

const Seller = '10000000-0000-4000-8000-000000000001';
const Buyer = '20000000-0000-4000-8000-000000000002';
const PostId = '30000000-0000-4000-8000-000000000003';

const classified = (overrides: Record<string, unknown> = {}) => ({
  globalId: PostId,
  authorId: Seller,
  postType: PostTypes.CLASSIFIED,
  status: GiftPostStatuses.PUBLISHED,
  deletedAt: null,
  expiresAt: null,
  ...overrides,
});

const config = (legacy: number | null) => ({
  getConfigValue: jest.fn(async (key: string) =>
    key === ClassifiedLegacyTransactionsConfigKey ? legacy : null,
  ),
});

/**
 * Rao vặt chỉ để đăng tin và liên hệ (PR #46 §8): hệ thống không tạo yêu cầu xin nhận hay
 * lượt trao cho bài `CLASSIFIED`. Client cũ gọi các đường đó nhận lỗi riêng.
 */
describe('Rao vặt không tạo yêu cầu xin nhận mới', () => {
  const make = (legacy: number | null) => {
    const requests = {
      countOpenByRequester: jest.fn(async () => 0),
      countActiveByPostIds: jest.fn(async () => new Map()),
    };
    const useCase = new CreateGiftRequestUseCase(
      { findOneBy: jest.fn(async () => classified()) } as never,
      requests as never,
      {
        getCapability: jest.fn(async () => ({ allowed: true, limit: 10 })),
      } as never,
      { assertComplete: jest.fn(async () => ({})) } as never,
      {} as never,
      config(legacy) as never,
    );
    return { useCase, requests };
  };

  it('mặc định (cờ tắt): CLASSIFIED_TRANSACTION_NOT_SUPPORTED', async () => {
    const { useCase, requests } = make(null);

    await expect(
      useCase.handle({
        requesterId: Buyer,
        postId: PostId,
        message: 'Cho mình mua nhé',
      } as never),
    ).rejects.toBeInstanceOf(ClassifiedTransactionNotSupportedException);
    expect(requests.countActiveByPostIds).not.toHaveBeenCalled();
  });

  it('Admin bật lại luồng cũ (=1) thì không chặn ở đây', async () => {
    const { useCase } = make(1);

    const error = await useCase
      .handle({
        requesterId: Buyer,
        postId: PostId,
        message: 'Cho mình mua nhé',
      } as never)
      .catch((thrown: unknown) => thrown);

    expect(error).not.toBeInstanceOf(
      ClassifiedTransactionNotSupportedException,
    );
  });
});

describe('Rao vặt không duyệt yêu cầu cũ thành lượt trao mới', () => {
  it('chủ bài duyệt yêu cầu tồn từ trước: bị chặn', async () => {
    const useCase = new AcceptGiftRequestUseCase(
      { findOneBy: jest.fn(async () => classified()) } as never,
      { findOneBy: jest.fn() } as never,
      { getCapability: jest.fn(async () => ({ allowed: true })) } as never,
      {} as never,
      config(0) as never,
    );

    await expect(
      useCase.handle({
        userId: Seller,
        postId: PostId,
        requestId: 'r-1',
      } as never),
    ).rejects.toBeInstanceOf(ClassifiedTransactionNotSupportedException);
  });
});

describe('UpdateClassifiedStatusUseCase', () => {
  const make = (post: Record<string, unknown> | null = classified()) => {
    const posts = {
      findOneBy: jest.fn(async () => post),
      updateClassifiedStatus: jest.fn(
        async (params: { to: GiftPostStatuses }) => ({
          ...(post ?? {}),
          status: params.to,
        }),
      ),
    };
    return {
      posts,
      useCase: new UpdateClassifiedStatusUseCase(posts as never),
    };
  };

  it.each([
    ['ACTIVE', GiftPostStatuses.PUBLISHED],
    ['RESERVED', GiftPostStatuses.RESERVED],
    ['SOLD', GiftPostStatuses.SOLD],
    ['HIDDEN', GiftPostStatuses.HIDDEN],
  ])(
    '%s ghi trạng thái %s, chỉ từ trạng thái chủ bài được đổi',
    async (status, to) => {
      const { posts, useCase } = make();

      const result = await useCase.handle({
        userId: Seller,
        postId: PostId,
        status: status as never,
      });

      expect(posts.updateClassifiedStatus).toHaveBeenCalledWith({
        postId: PostId,
        to,
        from: [
          GiftPostStatuses.PUBLISHED,
          GiftPostStatuses.RESERVED,
          GiftPostStatuses.HIDDEN,
        ],
      });
      expect(result.post.status).toBe(to);
    },
  );

  it('không phải chủ bài: 403', async () => {
    const { useCase } = make();

    await expect(
      useCase.handle({ userId: Buyer, postId: PostId, status: 'SOLD' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bài cho/nhận không dùng đường này: 409 trạng thái không hợp lệ', async () => {
    const { posts, useCase } = make(classified({ postType: PostTypes.OFFER }));

    await expect(
      useCase.handle({ userId: Seller, postId: PostId, status: 'SOLD' }),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
    expect(posts.updateClassifiedStatus).not.toHaveBeenCalled();
  });

  it('đã bán, hết hạn hay bị gỡ (trạng thái không còn cho đổi): 409', async () => {
    const { posts, useCase } = make(
      classified({ status: GiftPostStatuses.SOLD }),
    );
    posts.updateClassifiedStatus.mockResolvedValue(null as never);

    await expect(
      useCase.handle({ userId: Seller, postId: PostId, status: 'ACTIVE' }),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
  });

  it('bài không có hoặc đã xoá: 404', async () => {
    const { useCase } = make(null);

    await expect(
      useCase.handle({ userId: Seller, postId: PostId, status: 'SOLD' }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });
});
