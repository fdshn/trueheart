import { ICreateGiftRequestUseCase } from '@/application/contracts/gift-request';
import {
  OfferGiftSourceInvalidException,
  OfferGiftTargetNotWantedException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { OfferGiftUseCase } from './offer-gift.use-case';

const WantedPostId = '11111111-1111-4111-8111-111111111111';
const OffererId = '22222222-2222-4222-8222-222222222222';
const OfferingPostId = '33333333-3333-4333-8333-333333333333';

const wantedPost = {
  globalId: WantedPostId,
  postType: PostTypes.WANTED,
  deletedAt: null,
  authorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  status: GiftPostStatuses.PUBLISHED,
};

const usableOfferingPost = {
  globalId: OfferingPostId,
  postType: PostTypes.OFFER,
  deletedAt: null,
  authorId: OffererId,
  status: GiftPostStatuses.PUBLISHED,
};

function makeDeps(postsByGlobalId: Record<string, unknown>) {
  return {
    posts: {
      findOneBy: jest.fn(({ globalId }: { globalId: string }) =>
        Promise.resolve(postsByGlobalId[globalId] ?? null),
      ),
    } as unknown as jest.Mocked<IPostRepository>,
    create: {
      handle: jest.fn().mockResolvedValue({ request: { id: 'req-1' } }),
    } as unknown as jest.Mocked<ICreateGiftRequestUseCase>,
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new OfferGiftUseCase(deps.posts, deps.create);

describe('OfferGiftUseCase', () => {
  it('giao lại cho đường tạo yêu cầu, kèm bài mang ra tặng', async () => {
    // Một lời tặng CHÍNH LÀ một hàng gift_requests trên bài Muốn Nhận, nên hạn
    // mức, cổng hồ sơ, chống trùng và thông báo chỉ được viết một lần.
    const deps = makeDeps({
      [WantedPostId]: wantedPost,
      [OfferingPostId]: usableOfferingPost,
    });

    const result = await build(deps).handle({
      wantedPostId: WantedPostId,
      offererId: OffererId,
      message: 'Mình có sẵn món này muốn tặng bạn!',
      offeringPostId: OfferingPostId,
    });

    expect(deps.create.handle).toHaveBeenCalledWith({
      postId: WantedPostId,
      requesterId: OffererId,
      message: 'Mình có sẵn món này muốn tặng bạn!',
      offeringPostId: OfferingPostId,
    });
    expect(result.request.id).toBe('req-1');
  });

  it('không kèm bài thì truyền null và KHÔNG tra bài thứ hai', async () => {
    const deps = makeDeps({ [WantedPostId]: wantedPost });

    await build(deps).handle({
      wantedPostId: WantedPostId,
      offererId: OffererId,
      message: 'Mình có món này',
    });

    expect(deps.posts.findOneBy).toHaveBeenCalledTimes(1);
    expect(deps.create.handle).toHaveBeenCalledWith(
      expect.objectContaining({ offeringPostId: null }),
    );
  });

  it('bài đích không tồn tại ra PostNotFound', async () => {
    const deps = makeDeps({});

    await expect(
      build(deps).handle({
        wantedPostId: WantedPostId,
        offererId: OffererId,
        message: 'Mình có món này',
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
    expect(deps.create.handle).not.toHaveBeenCalled();
  });

  it('bài đích đã xoá mềm cũng ra PostNotFound', async () => {
    const deps = makeDeps({
      [WantedPostId]: { ...wantedPost, deletedAt: new Date() },
    });

    await expect(
      build(deps).handle({
        wantedPostId: WantedPostId,
        offererId: OffererId,
        message: 'Mình có món này',
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('bài đích không phải Muốn Nhận thì ra lỗi RIÊNG, không phải "bài đang đóng"', async () => {
    // Gộp với POST_NOT_ACCEPTING_REQUESTS thì client không biết nên thử lại sau
    // hay nên đổi endpoint.
    for (const postType of [
      PostTypes.OFFER,
      PostTypes.CHARITY,
      PostTypes.CLASSIFIED,
    ]) {
      const deps = makeDeps({ [WantedPostId]: { ...wantedPost, postType } });

      await expect(
        build(deps).handle({
          wantedPostId: WantedPostId,
          offererId: OffererId,
          message: 'Mình có món này',
        }),
      ).rejects.toBeInstanceOf(OfferGiftTargetNotWantedException);
      expect(deps.create.handle).not.toHaveBeenCalled();
    }
  });

  it('bài mang ra tặng của NGƯỜI KHÁC bị từ chối', async () => {
    const deps = makeDeps({
      [WantedPostId]: wantedPost,
      [OfferingPostId]: {
        ...usableOfferingPost,
        authorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    });

    await expect(
      build(deps).handle({
        wantedPostId: WantedPostId,
        offererId: OffererId,
        message: 'Mình có món này',
        offeringPostId: OfferingPostId,
      }),
    ).rejects.toBeInstanceOf(OfferGiftSourceInvalidException);
    expect(deps.create.handle).not.toHaveBeenCalled();
  });

  it('bài mang ra tặng không phải loại Muốn Tặng bị từ chối', async () => {
    const deps = makeDeps({
      [WantedPostId]: wantedPost,
      [OfferingPostId]: {
        ...usableOfferingPost,
        postType: PostTypes.WANTED,
      },
    });

    await expect(
      build(deps).handle({
        wantedPostId: WantedPostId,
        offererId: OffererId,
        message: 'Mình có món này',
        offeringPostId: OfferingPostId,
      }),
    ).rejects.toBeInstanceOf(OfferGiftSourceInvalidException);
  });

  it('bài mang ra tặng không còn công khai bị từ chối', async () => {
    for (const status of [
      GiftPostStatuses.EXPIRED,
      GiftPostStatuses.REJECTED,
      GiftPostStatuses.COMPLETED,
    ]) {
      const deps = makeDeps({
        [WantedPostId]: wantedPost,
        [OfferingPostId]: { ...usableOfferingPost, status },
      });

      await expect(
        build(deps).handle({
          wantedPostId: WantedPostId,
          offererId: OffererId,
          message: 'Mình có món này',
          offeringPostId: OfferingPostId,
        }),
      ).rejects.toBeInstanceOf(OfferGiftSourceInvalidException);
    }
  });

  it('bài mang ra tặng không tồn tại bị từ chối, không ra PostNotFound', async () => {
    // PostNotFound ở đây sẽ nói sai: bài ĐÍCH vẫn còn, chỉ là lựa chọn kèm theo
    // không dùng được.
    const deps = makeDeps({ [WantedPostId]: wantedPost });

    await expect(
      build(deps).handle({
        wantedPostId: WantedPostId,
        offererId: OffererId,
        message: 'Mình có món này',
        offeringPostId: OfferingPostId,
      }),
    ).rejects.toBeInstanceOf(OfferGiftSourceInvalidException);
  });
});
