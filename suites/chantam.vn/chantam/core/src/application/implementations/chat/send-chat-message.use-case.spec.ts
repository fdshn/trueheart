import { ChatRecipientUnavailableException } from '@/domain/exceptions';
import {
  ChatRoomTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { SendChatMessageUseCase } from './chat.use-cases';

const Me = '10000000-0000-4000-8000-000000000001';
const Other = '20000000-0000-4000-8000-000000000002';
const RoomId = '30000000-0000-4000-8000-000000000003';

function make(outcome: Record<string, unknown>) {
  const deps = {
    chat: { appendMessage: jest.fn(async () => outcome) },
    dispatch: { handle: jest.fn(async () => ({})) },
    realtime: { publishMessage: jest.fn(async () => undefined) },
    storage: { confirmChatMediaUpload: jest.fn(async () => undefined) },
    gate: { assertComplete: jest.fn(async () => ({})) },
    throttle: {
      assertWithinLimit: jest.fn(async () => undefined),
      registerHit: jest.fn(async () => undefined),
    },
    adminConfig: { getConfigValue: jest.fn(async () => null) },
  };
  const useCase = new SendChatMessageUseCase(
    deps.chat as never,
    deps.dispatch as never,
    deps.realtime as never,
    deps.storage as never,
    deps.gate as never,
    deps.throttle as never,
    deps.adminConfig as never,
  );
  return { deps, useCase };
}

const command = {
  userId: Me,
  username: 'toi',
  roomId: RoomId,
  message: { body: 'chào bạn' },
};

describe('SendChatMessageUseCase — chat trực tiếp (30/10)', () => {
  it('phòng DIRECT_USER có quan hệ chặn → lỗi chung, không báo, không phát, không trừ suất', async () => {
    const { deps, useCase } = make({ status: 'BLOCKED' });

    await expect(useCase.handle(command)).rejects.toThrow(
      ChatRecipientUnavailableException,
    );
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
    expect(deps.realtime.publishMessage).not.toHaveBeenCalled();
    expect(deps.throttle.registerHit).not.toHaveBeenCalled();
  });

  it('push tin nhắn mới mang roomType của phòng', async () => {
    const { deps, useCase } = make({
      status: 'APPENDED',
      message: {
        globalId: 'msg-1',
        roomId: RoomId,
        senderId: Me,
        body: 'chào bạn',
        createdAt: new Date(),
      },
      room: { globalId: RoomId, roomType: ChatRoomTypes.DIRECT_USER },
      counterpartId: Other,
      counterpartMuted: false,
    });

    await useCase.handle(command);

    expect(deps.dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: Other,
        type: NotificationTypes.NEW_CHAT_MESSAGE,
        referenceType: 'CHAT_ROOM',
        referenceId: RoomId,
        pushData: { roomType: ChatRoomTypes.DIRECT_USER },
      }),
    );
  });
});
