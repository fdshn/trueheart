import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { ConfiguredOtpSender } from './configured-otp-sender';

const SmtpChannel = {
  channel: 'EMAIL' as const,
  provider: 'SMTP',
  enabled: true,
  fromAddress: 'no-reply@chantam.vn',
  fromName: 'Chân Tâm',
  host: 'smtp.example.com',
  port: 587,
  username: 'mailer',
  secretConfigured: true,
  updatedAt: new Date(),
};

function makeSender(options: {
  env?: string;
  sendable?: boolean;
  channel?: typeof SmtpChannel;
}) {
  const channels = {
    list: jest.fn(async () => [options.channel ?? SmtpChannel]),
    isSendable: jest.fn(async () => options.sendable ?? false),
    update: jest.fn(),
    readSecret: jest.fn(async () => 'mat-khau-that'),
  };
  const transport = { send: jest.fn(async () => undefined) };
  const sender = new ConfiguredOtpSender(
    { env: options.env ?? 'production' } as never,
    channels as never,
    transport as never,
  );

  return { sender, channels, transport };
}

describe('ConfiguredOtpSender', () => {
  it('gửi được EMAIL khi Admin đã cấu hình SMTP đầy đủ', async () => {
    const { sender } = makeSender({ sendable: true });

    await expect(sender.canSend(PasswordResetChannels.EMAIL)).resolves.toBe(
      true,
    );
  });

  it('KHÔNG gửi được SMS ở production dù Admin đã bật kênh', async () => {
    // Chưa có adapter SMS/Zalo nào. Bật kênh trong CMS không tạo ra khả năng
    // gửi — trả true ở đây là hứa một tin nhắn không bao giờ tới.
    const { sender } = makeSender({ sendable: true });

    await expect(sender.canSend(PasswordResetChannels.SMS)).resolves.toBe(
      false,
    );
  });

  it('không gửi được gì ở production khi chưa cấu hình kênh', async () => {
    const { sender } = makeSender({ sendable: false });

    await expect(sender.canSend(PasswordResetChannels.EMAIL)).resolves.toBe(
      false,
    );
  });

  it('ở dev vẫn gửi được bằng cách ghi log để thử luồng đầu-cuối', async () => {
    const { sender } = makeSender({ env: 'development', sendable: false });

    await expect(sender.canSend(PasswordResetChannels.EMAIL)).resolves.toBe(
      true,
    );
  });

  it('gửi thật qua SMTP với đúng thông tin Admin đã cấu hình', async () => {
    const { sender, transport, channels } = makeSender({ sendable: true });

    await sender.send(
      PasswordResetChannels.EMAIL,
      'nguoidung@example.com',
      '123456',
    );

    expect(channels.readSecret).toHaveBeenCalledWith('EMAIL');
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        username: 'mailer',
        secret: 'mat-khau-that',
        fromAddress: 'no-reply@chantam.vn',
        to: 'nguoidung@example.com',
      }),
    );
  });

  it('mã xác minh nằm trong nội dung mail chứ không nằm trong log', async () => {
    const { sender, transport } = makeSender({ sendable: true });
    const logged: string[] = [];
    jest
      .spyOn(
        (sender as unknown as { logger: { warn: (m: string) => void } }).logger,
        'warn',
      )
      .mockImplementation((message: string) => logged.push(message));

    await sender.send(
      PasswordResetChannels.EMAIL,
      'nguoidung@example.com',
      '123456',
    );

    expect(JSON.stringify(transport.send.mock.calls)).toContain('123456');
    expect(logged.join('\n')).not.toContain('123456');
  });

  it('từ chối gửi ở production khi kênh chưa sẵn sàng, không ghi mã ra log', async () => {
    // Lớp chặn thứ hai: kể cả nghiệp vụ quên hỏi canSend, mã vẫn không được
    // rò ra log production.
    const { sender, transport } = makeSender({ sendable: false });

    await expect(
      sender.send(PasswordResetChannels.EMAIL, 'a@example.com', '123456'),
    ).rejects.toThrow();
    expect(transport.send).not.toHaveBeenCalled();
  });
});
