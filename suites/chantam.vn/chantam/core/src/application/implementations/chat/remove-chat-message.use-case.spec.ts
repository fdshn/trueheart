import { ChatMessageNotFoundException } from '@/domain/exceptions';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { RemoveChatMessageUseCase } from './remove-chat-message.use-case';

const ActorId = '10000000-0000-4000-8000-000000000001';
const MessageId = '70000000-0000-4000-8000-000000000001';
const RoomId = '60000000-0000-4000-8000-000000000001';
const SenderId = 'sender-1';
const Reason = 'Lời lẽ xúc phạm người nhận';

function makeDeps(
  options: { granted?: boolean; found?: boolean; mediaKeys?: string[] } = {},
) {
  return {
    chat: {
      removeMessageByAdmin: jest.fn(async (_params: unknown) =>
        options.found === false
          ? {
              status: 'NOT_FOUND' as const,
              roomId: '',
              senderId: '',
              mediaKeys: [],
            }
          : {
              status: 'REMOVED' as const,
              roomId: RoomId,
              senderId: SenderId,
              mediaKeys: options.mediaKeys ?? [],
            },
      ),
    },
    permissions: {
      hasPermission: jest.fn(async () => options.granted ?? true),
    },
    storage: { deleteObjects: jest.fn(async (_keys: string[]) => undefined) },
    realtime: {
      publishMessage: jest.fn(
        async (_roomId: string, _payload: unknown) => undefined,
      ),
    },
    manager: { query: jest.fn(async (_sql: string, _params: unknown[]) => []) },
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new RemoveChatMessageUseCase(
    deps.chat as never,
    deps.permissions as never,
    deps.storage as never,
    deps.realtime as never,
    deps.manager as never,
  );

const command = { actorUserId: ActorId, messageId: MessageId, reason: Reason };

describe('RemoveChatMessageUseCase', () => {
  it('đòi report.resolve — thiếu quyền thì Forbidden, không gỡ, không audit', async () => {
    const deps = makeDeps({ granted: false });

    await expect(build(deps).handle(command)).rejects.toThrow(
      ForbiddenException,
    );

    expect(deps.permissions.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'report.resolve',
    );
    expect(deps.chat.removeMessageByAdmin).not.toHaveBeenCalled();
    expect(deps.storage.deleteObjects).not.toHaveBeenCalled();
    expect(deps.realtime.publishMessage).not.toHaveBeenCalled();
    expect(deps.manager.query).not.toHaveBeenCalled();
  });

  it('tin không có thì 404, không xoá ảnh, không bắn realtime, không audit', async () => {
    const deps = makeDeps({ found: false });

    await expect(build(deps).handle(command)).rejects.toThrow(
      ChatMessageNotFoundException,
    );

    expect(deps.chat.removeMessageByAdmin).toHaveBeenCalledWith({
      messageId: MessageId,
    });
    expect(deps.storage.deleteObjects).not.toHaveBeenCalled();
    expect(deps.realtime.publishMessage).not.toHaveBeenCalled();
    expect(deps.manager.query).not.toHaveBeenCalled();
  });

  it('gỡ xong thì xoá ảnh trên storage và báo realtime cho phòng', async () => {
    const keys = ['users/s/chat/room/a.webp', 'users/s/chat/room/b.webp'];
    const deps = makeDeps({ mediaKeys: keys });

    await build(deps).handle(command);

    expect(deps.storage.deleteObjects).toHaveBeenCalledWith(keys);
    expect(deps.realtime.publishMessage).toHaveBeenCalledWith(
      RoomId,
      expect.objectContaining({
        messageId: MessageId,
        roomId: RoomId,
        senderId: SenderId,
        body: '',
        mediaKeys: [],
        recalledAt: expect.any(Date),
      }),
    );
  });

  it('tin không có ảnh thì không gọi xoá storage', async () => {
    const deps = makeDeps({ mediaKeys: [] });

    await build(deps).handle(command);

    expect(deps.storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('ghi một dòng audit REMOVE_CHAT_MESSAGE với người bấm, lý do và số ảnh đã gỡ', async () => {
    const deps = makeDeps({ mediaKeys: ['a', 'b'] });

    await build(deps).handle(command);

    expect(deps.manager.query).toHaveBeenCalledTimes(1);
    const [sql, params] = deps.manager.query.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO admin_audit_logs');
    expect(sql).toContain("'REMOVE_CHAT_MESSAGE'");
    expect(sql).toContain("'CHAT_MESSAGE'");
    expect(params).toEqual([ActorId, MessageId, expect.any(String), Reason]);
    expect(JSON.parse(params[2] as string)).toEqual({
      roomId: RoomId,
      senderId: SenderId,
      mediaRemoved: 2,
    });
  });

  it('realtime lỗi không làm hỏng việc gỡ: vẫn audit và trả kết quả', async () => {
    const deps = makeDeps();
    deps.realtime.publishMessage.mockRejectedValueOnce(new Error('ws down'));

    const result = await build(deps).handle(command);

    expect(result).toEqual({ messageId: MessageId, roomId: RoomId });
    expect(deps.manager.query).toHaveBeenCalledTimes(1);
  });
});
