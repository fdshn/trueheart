import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostHasLiveTransactionException,
  PostInvalidStateException,
} from '../exceptions';
import {
  assertEditablePost,
  isEditablePostStatus,
  statusImpliesLiveTransaction,
} from './post-edit-policy';

const post = (postType: PostTypes, status: GiftPostStatuses) =>
  ({ postType, status, expiresAt: null }) as unknown as IPostEntity;

describe('post-edit-policy', () => {
  it('bài cho/nhận: RESERVED là có lượt trao sống — chặn sửa', () => {
    expect(
      statusImpliesLiveTransaction(
        post(PostTypes.OFFER, GiftPostStatuses.RESERVED),
      ),
    ).toBe(true);
    expect(() =>
      assertEditablePost(post(PostTypes.OFFER, GiftPostStatuses.RESERVED)),
    ).toThrow(PostHasLiveTransactionException);
  });

  it.each([GiftPostStatuses.RESERVED, GiftPostStatuses.HIDDEN])(
    'Rao vặt %s do chủ bài tự đặt: sửa được — lượt trao sống kiểm ở bảng lượt trao',
    (status) => {
      const listing = post(PostTypes.CLASSIFIED, status);
      expect(statusImpliesLiveTransaction(listing)).toBe(false);
      expect(isEditablePostStatus(listing)).toBe(true);
      expect(() => assertEditablePost(listing)).not.toThrow();
    },
  );

  it.each([
    GiftPostStatuses.SOLD,
    GiftPostStatuses.EXPIRED,
    GiftPostStatuses.REJECTED,
  ])('Rao vặt %s: không sửa được', (status) => {
    expect(() =>
      assertEditablePost(post(PostTypes.CLASSIFIED, status)),
    ).toThrow(PostInvalidStateException);
  });

  it('bài cho/nhận HIDDEN (không thể xảy ra) cũng không sửa được', () => {
    expect(
      isEditablePostStatus(post(PostTypes.OFFER, GiftPostStatuses.HIDDEN)),
    ).toBe(false);
  });
});
