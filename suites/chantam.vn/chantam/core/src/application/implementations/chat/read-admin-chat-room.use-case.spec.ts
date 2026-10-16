import { ChatRoomNotFoundException } from '@/domain/exceptions';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '@chantam.vn/chantam.core-lib/models';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { ReadAdminChatRoomUseCase } from './read-admin-chat-room.use-case';

const ActorId = '10000000-0000-4000-8000-000000000001';
const RoomId = '60000000-0000-4000-8000-000000000001';

const First = {
  id: 11,
  messageId: 'm1',
  senderId: 'g',
  senderUsername: 'giver',
  body: 'ảnh đây',
  mediaKeys: ['users/g/chat/room/a.webp'],
  recalledAt: null,
  sentAt: new Date('2026-10-15T00:00:00Z'),
};
const Last = {
  id: 12,
  messageId: 'm2',
  senderId: 'r',
  senderUsername: 'receiver',
  body: 'ok',
  mediaKeys: [],
  recalledAt: null,
  sentAt: new Date('2026-10-15T00:01:00Z'),
};

function makeDeps(
  options: { granted?: boolean; room?: boolean; empty?: boolean } = {},
) {
  return {
    chat: {
      findRoomForModeration: jest.fn(async () =>
        options.room === false
          ? null
          : { roomId: RoomId, postId: 'post', giverId: 'g', receiverId: 'r' },
      ),
      listMessagesForModeration: jest.fn(async (_query: unknown) => ({
        items: options.empty ? [] : [First, Last],
        hasMoreBefore: true,
        hasMoreAfter: false,
      })),
    },
    permissions: {
      hasPermission: jest.fn(async () => options.granted ?? true),
    },
    manager: { query: jest.fn(async (_sql: string, _params: unknown[]) => []) },
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
      read(deps).handle({ actorUserId: ActorId, roomId: RoomId }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.chat.findRoomForModeration).not.toHaveBeenCalled();
  });

  it('không có báo xấu đang mở thì 404 và không ghi audit', async () => {
    const deps = makeDeps({ room: false });
    await expect(
      read(deps).handle({ actorUserId: ActorId, roomId: RoomId }),
    ).rejects.toThrow(ChatRoomNotFoundException);
    expect(deps.manager.query).not.toHaveBeenCalled();
  });

  it('mỗi ảnh có URL mở được, cùng thứ tự với mediaKeys (CMS A11)', async () => {
    const deps = makeDeps();
    const result = await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
    });

    expect(result.messages[0]?.mediaUrls).toEqual([
      'https://cdn.chantam.test/users/g/chat/room/a.webp',
    ]);
    expect(result.messages[1]?.mediaUrls).toEqual([]);
    expect(deps.manager.query).toHaveBeenCalledTimes(1);
  });

  it('không con trỏ: cửa sổ mới nhất, mặc định 50 tin', async () => {
    const deps = makeDeps();
    await read(deps).handle({ actorUserId: ActorId, roomId: RoomId });

    expect(deps.chat.listMessagesForModeration).toHaveBeenCalledWith({
      roomId: RoomId,
      limit: 50,
      before: null,
      after: null,
      aroundMessageId: null,
    });
  });

  it('trần 200 tin một lần', async () => {
    const deps = makeDeps();
    const result = await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
      limit: 5000,
    });

    expect(result.window.limit).toBe(200);
  });

  it('window: con trỏ hai đầu lấy từ tin cũ nhất và mới nhất', async () => {
    const deps = makeDeps();
    const result = await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
    });

    expect(decodeKeysetCursor(result.window.oldestCursor ?? undefined)).toEqual(
      { createdAt: First.sentAt, id: First.id },
    );
    expect(decodeKeysetCursor(result.window.newestCursor ?? undefined)).toEqual(
      { createdAt: Last.sentAt, id: Last.id },
    );
    expect(result.window).toMatchObject({
      hasMoreBefore: true,
      hasMoreAfter: false,
    });
    // `id` nội bộ không lộ ra response.
    expect(result.messages[0]).not.toHaveProperty('id');
  });

  it('phòng rỗng thì hai con trỏ null', async () => {
    const deps = makeDeps({ empty: true });
    const result = await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
    });

    expect(result.window.oldestCursor).toBeNull();
    expect(result.window.newestCursor).toBeNull();
  });

  it('before thắng after và aroundMessageId', async () => {
    const deps = makeDeps();
    const cursor = { createdAt: First.sentAt, id: First.id };
    await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
      before: encodeKeysetCursor(cursor),
      after: encodeKeysetCursor(cursor),
      aroundMessageId: '70000000-0000-4000-8000-000000000001',
    });

    expect(deps.chat.listMessagesForModeration).toHaveBeenCalledWith(
      expect.objectContaining({
        before: cursor,
        after: null,
        aroundMessageId: null,
      }),
    );
  });

  it('aroundMessageId chỉ dùng khi không có con trỏ', async () => {
    const deps = makeDeps();
    await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
      aroundMessageId: '70000000-0000-4000-8000-000000000001',
    });

    expect(deps.chat.listMessagesForModeration).toHaveBeenCalledWith(
      expect.objectContaining({
        aroundMessageId: '70000000-0000-4000-8000-000000000001',
      }),
    );
  });

  it('con trỏ hỏng được coi như không có, không phải lỗi', async () => {
    const deps = makeDeps();
    await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
      before: 'not-a-cursor',
    });

    expect(deps.chat.listMessagesForModeration).toHaveBeenCalledWith(
      expect.objectContaining({ before: null }),
    );
  });

  it('MỌI trang đều ghi audit, kèm hướng đọc', async () => {
    // Con trỏ chỉ là base64 của (thời điểm, id): ai cũng tự dựng được. Chỉ ghi
    // audit lúc mở trang đầu là chừa đường đọc cả phòng mà không để lại vết.
    const deps = makeDeps();
    await read(deps).handle({
      actorUserId: ActorId,
      roomId: RoomId,
      before: encodeKeysetCursor({ createdAt: First.sentAt, id: First.id }),
    });

    expect(deps.manager.query).toHaveBeenCalledTimes(1);
    const [, params] = deps.manager.query.mock.calls[0]!;
    expect(JSON.parse(String(params[2]))).toEqual({
      messageCount: 2,
      direction: 'BEFORE',
    });
  });
});
