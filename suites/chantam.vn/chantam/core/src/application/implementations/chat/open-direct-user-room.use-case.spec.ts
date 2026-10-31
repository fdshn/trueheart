import {
  ChatDirectUserSelfException,
  ChatRecipientUnavailableException,
  ProfileIncompleteException,
  TooManyRequestsException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  ChatRoomStatuses,
  ChatRoomTypes,
  UserStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  DirectUserDailyLimitConfigKey,
  OpenDirectUserRoomUseCase,
} from './open-direct-user-room.use-case';

const Me = '10000000-0000-4000-8000-000000000001';
const Other = '20000000-0000-4000-8000-000000000002';

function make(
  options: {
    target?: Record<string, unknown> | null;
    limit?: unknown;
    outcome?: Record<string, unknown>;
  } = {},
) {
  const deps = {
    users: {
      findOneBy: jest.fn(async () =>
        options.target === null
          ? null
          : {
              globalId: Other,
              username: 'nguoi-kia',
              status: UserStatuses.ACTIVE,
              deletedAt: null,
              ...options.target,
            },
      ),
    },
    chat: {
      openDirectUserRoom: jest.fn(
        async () =>
          options.outcome ?? {
            status: 'OPENED',
            room: { globalId: 'room-1' },
            created: true,
          },
      ),
      describeRoom: jest.fn(async () => ({
        room: {
          globalId: 'room-1',
          roomType: ChatRoomTypes.DIRECT_USER,
          transactionId: null,
          postId: null,
          status: ChatRoomStatuses.OPEN,
        },
        postTitle: null,
        postThumbnailKey: null,
        postPrice: null,
        counterpartId: Other,
        counterpartUsername: 'nguoi-kia',
        counterpartFullName: null,
        counterpartAvatarUrl: null,
        blockedByMe: false,
        lastMessageBody: null,
        unreadCount: 0,
      })),
    },
    gate: { assertComplete: jest.fn(async () => ({})) },
    adminConfig: {
      getConfigValue: jest.fn(async () =>
        'limit' in options ? options.limit : 20,
      ),
    },
    config: { storage: { publicBaseUrl: 'https://cdn.test' } },
  };
  const useCase = new OpenDirectUserRoomUseCase(
    deps.users as never,
    deps.chat as never,
    deps.gate as never,
    deps.adminConfig as never,
    deps.config as never,
  );
  return { deps, useCase };
}

describe('OpenDirectUserRoomUseCase (chat trực tiếp 30/10)', () => {
  it('mở theo userId: phòng không bài, có counterpartId, giới hạn từ cấu hình', async () => {
    const { deps, useCase } = make({ limit: 5 });

    const result = await useCase.handle({
      userId: Me,
      target: { userId: Other },
    });

    expect(deps.adminConfig.getConfigValue).toHaveBeenCalledWith(
      DirectUserDailyLimitConfigKey,
    );
    expect(deps.chat.openDirectUserRoom).toHaveBeenCalledWith({
      initiatorId: Me,
      recipientId: Other,
      dailyLimit: 5,
    });
    expect(result.created).toBe(true);
    expect(result.room).toMatchObject({
      roomType: ChatRoomTypes.DIRECT_USER,
      postId: null,
      postTitle: null,
      counterpartId: Other,
      blockedByMe: false,
    });
  });

  it('mở theo username — từ hồ sơ công khai', async () => {
    const { deps, useCase } = make();

    await useCase.handle({ userId: Me, target: { username: ' nguoi-kia ' } });

    expect(deps.users.findOneBy).toHaveBeenCalledWith({
      username: 'nguoi-kia',
    });
  });

  it.each([
    ['không có gì', {}],
    ['cả hai', { userId: Other, username: 'nguoi-kia' }],
  ])('đúng một trong userId/username — %s là lỗi', async (_label, target) => {
    const { deps, useCase } = make();

    await expect(useCase.handle({ userId: Me, target })).rejects.toThrow(
      ValidationFailedException,
    );
    expect(deps.chat.openDirectUserRoom).not.toHaveBeenCalled();
  });

  it('hồ sơ chưa đủ thì không mở', async () => {
    const { deps, useCase } = make();
    deps.gate.assertComplete.mockRejectedValueOnce(
      new ProfileIncompleteException(['phone']) as never,
    );

    await expect(
      useCase.handle({ userId: Me, target: { userId: Other } }),
    ).rejects.toThrow(ProfileIncompleteException);
    expect(deps.chat.openDirectUserRoom).not.toHaveBeenCalled();
  });

  it.each([
    ['không tồn tại', null],
    ['đã xoá', { deletedAt: new Date() }],
    ['bị khoá', { status: UserStatuses.BANNED }],
    ['đang treo', { status: UserStatuses.SUSPENDED }],
  ])('người nhận %s → 404', async (_label, target) => {
    const { useCase } = make({ target });

    await expect(
      useCase.handle({ userId: Me, target: { userId: Other } }),
    ).rejects.toThrow(UserNotFoundException);
  });

  it('nhắn chính mình → lỗi riêng', async () => {
    const { useCase } = make({ target: { globalId: Me } });

    await expect(
      useCase.handle({ userId: Me, target: { userId: Me } }),
    ).rejects.toThrow(ChatDirectUserSelfException);
  });

  it('bị chặn hoặc người nhận không nhận tin người lạ → cùng một lỗi chung', async () => {
    const { useCase } = make({ outcome: { status: 'RECIPIENT_UNAVAILABLE' } });

    await expect(
      useCase.handle({ userId: Me, target: { userId: Other } }),
    ).rejects.toThrow(ChatRecipientUnavailableException);
  });

  it('hết suất mở phòng trong ngày → 429 với thời gian chờ', async () => {
    const { useCase } = make({
      outcome: { status: 'DAILY_LIMIT_REACHED', retryAfterSeconds: 3600 },
    });

    await expect(
      useCase.handle({ userId: Me, target: { userId: Other } }),
    ).rejects.toThrow(TooManyRequestsException);
  });

  it.each([
    ['thiếu', undefined, 20],
    ['không phải số', 'abc', 20],
    ['âm', -3, 20],
    ['số lẻ', 7.5, 20],
    ['0 — Admin tắt hẳn', 0, 0],
  ])('cấu hình giới hạn %s → dùng %p', async (_label, configured, expected) => {
    const { deps, useCase } = make({ limit: configured });

    await useCase.handle({ userId: Me, target: { userId: Other } });

    expect(deps.chat.openDirectUserRoom).toHaveBeenCalledWith(
      expect.objectContaining({ dailyLimit: expected }),
    );
  });
});
