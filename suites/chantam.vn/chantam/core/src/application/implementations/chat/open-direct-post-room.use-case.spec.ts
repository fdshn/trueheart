import {
  ChatDirectPostNotSupportedException,
  ChatDirectPostSelfException,
  PostNotFoundException,
  ProfileIncompleteException,
} from '@/domain/exceptions';
import {
  ChatRoomStatuses,
  ChatRoomTypes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { OpenDirectPostRoomUseCase } from './open-direct-post-room.use-case';

const Seller = '10000000-0000-4000-8000-000000000001';
const Buyer = '20000000-0000-4000-8000-000000000002';
const PostId = '30000000-0000-4000-8000-000000000003';

function make(post: Record<string, unknown> | null = {}) {
  const deps = {
    posts: {
      findOneBy: jest.fn(async () =>
        post === null
          ? null
          : {
              globalId: PostId,
              authorId: Seller,
              postType: PostTypes.CLASSIFIED,
              status: 'PUBLISHED',
              deletedAt: null,
              ...post,
            },
      ),
    },
    chat: {
      openDirectPostRoom: jest.fn(async () => ({
        room: { globalId: 'room-1' },
        created: true,
      })),
      describeRoom: jest.fn(async () => ({
        room: {
          globalId: 'room-1',
          roomType: ChatRoomTypes.DIRECT_POST,
          transactionId: null,
          postId: PostId,
          status: ChatRoomStatuses.OPEN,
        },
        postTitle: 'Xe đạp',
        postThumbnailKey: null,
        postPrice: 150000,
        counterpartUsername: 'nguoi-ban',
        counterpartFullName: null,
        counterpartAvatarUrl: null,
        lastMessageBody: null,
        unreadCount: 0,
      })),
    },
    gate: { assertComplete: jest.fn(async () => ({})) },
    config: { storage: { publicBaseUrl: 'https://cdn.test' } },
  };
  const useCase = new OpenDirectPostRoomUseCase(
    deps.posts as never,
    deps.chat as never,
    deps.gate as never,
    deps.config as never,
  );
  return { deps, useCase };
}

describe('OpenDirectPostRoomUseCase (PR #46 §7.2)', () => {
  it('mở phòng: người mua là người gọi, người bán là chủ bài', async () => {
    const { deps, useCase } = make();

    const result = await useCase.handle({ userId: Buyer, postId: PostId });

    expect(deps.chat.openDirectPostRoom).toHaveBeenCalledWith({
      postId: PostId,
      buyerId: Buyer,
      sellerId: Seller,
    });
    expect(result.created).toBe(true);
    expect(result.room).toEqual(
      expect.objectContaining({
        roomId: 'room-1',
        roomType: ChatRoomTypes.DIRECT_POST,
        transactionId: null,
        postPrice: 150000,
        readOnly: false,
      }),
    );
  });

  it('cổng hồ sơ chặn TRƯỚC khi mở phòng — như chat giao dịch', async () => {
    const { deps, useCase } = make();
    deps.gate.assertComplete.mockRejectedValue(
      new ProfileIncompleteException(['phone']) as never,
    );

    await expect(
      useCase.handle({ userId: Buyer, postId: PostId }),
    ).rejects.toBeInstanceOf(ProfileIncompleteException);
    expect(deps.chat.openDirectPostRoom).not.toHaveBeenCalled();
  });

  it('chủ bài không tự nhắn với bài của mình', async () => {
    const { deps, useCase } = make();

    await expect(
      useCase.handle({ userId: Seller, postId: PostId }),
    ).rejects.toBeInstanceOf(ChatDirectPostSelfException);
    expect(deps.chat.openDirectPostRoom).not.toHaveBeenCalled();
  });

  it('chỉ bài Rao vặt — bài cho/nhận đi qua xin nhận và chat giao dịch', async () => {
    const { useCase } = make({ postType: PostTypes.OFFER });

    await expect(
      useCase.handle({ userId: Buyer, postId: PostId }),
    ).rejects.toBeInstanceOf(ChatDirectPostNotSupportedException);
  });

  it.each([
    ['không có', null],
    ['đã xoá', { deletedAt: new Date() }],
    ['bị Admin gỡ', { status: 'REJECTED' }],
    ['đã hết hạn', { status: 'EXPIRED' }],
  ])('bài %s thì 404', async (_label, post) => {
    const { deps, useCase } = make(post as Record<string, unknown> | null);

    await expect(
      useCase.handle({ userId: Buyer, postId: PostId }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
    expect(deps.chat.openDirectPostRoom).not.toHaveBeenCalled();
  });
});
