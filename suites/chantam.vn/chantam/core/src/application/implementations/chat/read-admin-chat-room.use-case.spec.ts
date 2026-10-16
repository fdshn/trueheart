import { ChatRoomNotFoundException } from '@/domain/exceptions';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { ReadAdminChatRoomUseCase } from './read-admin-chat-room.use-case';

const ActorId = '10000000-0000-4000-8000-000000000001';
const RoomId = '60000000-0000-4000-8000-000000000001';

function makeDeps(options: { granted?: boolean; room?: boolean } = {}) {
  return {
    chat: {
      findRoomForModeration: jest.fn(async () =>
        options.room === false
          ? null
          : { roomId: RoomId, postId: 'post', giverId: 'g', receiverId: 'r' },
      ),
      listMessagesForModeration: jest.fn(async () => [
        {
          messageId: 'm1',
          senderId: 'g',
          senderUsername: 'giver',
          body: 'ảnh đây',
          mediaKeys: ['users/g/chat/room/a.webp'],
          recalledAt: null,
          sentAt: new Date('2026-10-15T00:00:00Z'),
        },
        {
          messageId: 'm2',
          senderId: 'r',
          senderUsername: 'receiver',
          body: 'ok',
          mediaKeys: [],
          recalledAt: null,
          sentAt: new Date('2026-10-15T00:01:00Z'),
        },
      ]),
    },
    permissions: {
      hasPermission: jest.fn(async () => options.granted ?? true),
    },
    manager: { query: jest.fn(async () => []) },
    config: { storage: { publicBaseUrl: 'https://cdn.chantam.test/' } },
  };
}

const read = (deps: ReturnType<typeof makeDeps>) =>
  new ReadAdminChatRoomUseCase(
    deps.chat as never,
    deps.permissions as never,
    deps.manager as never,
    deps.config as never,
  );

describe('ReadAdminChatRoomUseCase', () => {
  it('đòi report.read', async () => {
    const deps = makeDeps({ granted: false });
    await expect(
      read(deps).handle({ actorUserId: ActorId, roomId: RoomId, limit: 50 }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.chat.findRoomForModeration).not.toHaveBeenCalled();
  });

  it('không có báo xấu đang mở thì 404 và không ghi audit', async () => {
    const deps = makeDeps({ room: false });
    await expect(
      read(deps).handle({ actorUserId: ActorId, roomId: RoomId, limit: 50 }),
    ).rejects.toThrow(ChatRoomNotFoundException);
    expect(deps.manager.query).not.toHaveBeenCalled();
  });

  it('mỗi ảnh có URL mở được, cùng thứ tự với mediaKeys (CMS A11)', async () => {
    const deps = makeDeps();
    const result = await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
      limit: 50,
    });

    expect(result.messages[0]?.mediaUrls).toEqual([
      'https://cdn.chantam.test/users/g/chat/room/a.webp',
    ]);
    expect(result.messages[1]?.mediaUrls).toEqual([]);
    expect(deps.manager.query).toHaveBeenCalledTimes(1);
  });
});
