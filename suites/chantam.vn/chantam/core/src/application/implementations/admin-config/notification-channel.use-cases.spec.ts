import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  GetNotificationChannelsUseCase,
  UpdateNotificationChannelUseCase,
} from './notification-channel.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

const Channel = {
  channel: 'EMAIL' as const,
  provider: 'SMTP',
  enabled: true,
  fromAddress: 'no-reply@chantam.vn',
  fromName: 'Chân Tâm',
  host: 'smtp.example.com',
  port: 587,
  username: 'mailer',
  secretConfigured: true,
  updatedAt: new Date('2026-09-20T00:00:00.000Z'),
};

function makeDeps(granted: string[]) {
  return {
    permissions: {
      hasPermission: jest.fn(async (_userId: string, permission: string) =>
        granted.includes(permission),
      ),
    },
    channels: {
      list: jest.fn(async () => [Channel]),
      isSendable: jest.fn(async () => true),
      update: jest.fn(async () => Channel),
    },
  };
}

describe('Notification channel admin use cases', () => {
  it('từ chối xem cấu hình khi thiếu notification.manage', async () => {
    const deps = makeDeps([]);
    const useCase = new GetNotificationChannelsUseCase(
      deps.permissions as never,
      deps.channels as never,
    );

    await expect(
      useCase.handle({ actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.channels.list).not.toHaveBeenCalled();
  });

  it('trả cấu hình kênh mà không kèm secret', async () => {
    const deps = makeDeps(['notification.manage']);
    const useCase = new GetNotificationChannelsUseCase(
      deps.permissions as never,
      deps.channels as never,
    );

    const result = await useCase.handle({ actorUserId: ActorId });

    expect(result.channels[0].secretConfigured).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/"secret"\s*:/);
  });

  it('từ chối đổi cấu hình khi thiếu quyền và không ghi gì', async () => {
    const deps = makeDeps(['config.read']);
    const useCase = new UpdateNotificationChannelUseCase(
      deps.permissions as never,
      deps.channels as never,
    );

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        channel: 'EMAIL',
        channelConfig: { enabled: true, reason: 'Bật kênh' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.channels.update).not.toHaveBeenCalled();
  });

  it('chuyển đúng người thực hiện và lý do xuống tầng lưu trữ', async () => {
    const deps = makeDeps(['notification.manage']);
    const useCase = new UpdateNotificationChannelUseCase(
      deps.permissions as never,
      deps.channels as never,
    );

    await useCase.handle({
      actorUserId: ActorId,
      channel: 'EMAIL',
      channelConfig: {
        host: 'smtp.example.com',
        secret: 'mat-khau-that',
        reason: 'Đổi mật khẩu SMTP',
      },
    });

    expect(deps.channels.update).toHaveBeenCalledWith({
      actorUserId: ActorId,
      channel: 'EMAIL',
      host: 'smtp.example.com',
      secret: 'mat-khau-that',
      reason: 'Đổi mật khẩu SMTP',
    });
  });

  it('bắt buộc có lý do khi đổi cấu hình', async () => {
    // Audit không lý do thì sáu tháng sau không ai biết vì sao kênh bị tắt.
    const deps = makeDeps(['notification.manage']);
    const useCase = new UpdateNotificationChannelUseCase(
      deps.permissions as never,
      deps.channels as never,
    );

    const error = await useCase
      .handle({
        actorUserId: ActorId,
        channel: 'EMAIL',
        channelConfig: { enabled: false, reason: '   ' },
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ForbiddenException);
    expect(deps.channels.update).not.toHaveBeenCalled();
  });
});
