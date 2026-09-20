import { NotificationChannelRepository } from './notification-channel.repository';

const ActorId = '10000000-0000-4000-8000-000000000001';

function makeCipher() {
  return {
    isConfigured: true,
    encrypt: jest.fn((plain: string) => `enc(${plain})`),
    decrypt: jest.fn((cipher: string) => cipher.slice(4, -1)),
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'EMAIL',
    provider: 'SMTP',
    enabled: true,
    from_address: 'no-reply@chantam.vn',
    from_name: 'Chân Tâm',
    host: 'smtp.example.com',
    port: 587,
    username: 'mailer',
    secret_encrypted: 'enc(mat-khau-that)',
    updated_at: new Date('2026-09-20T00:00:00.000Z'),
    ...overrides,
  };
}

describe('NotificationChannelRepository', () => {
  it('không bao giờ trả secret ra ngoài, chỉ nói đã cấu hình hay chưa', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [row()]);
    const repository = new NotificationChannelRepository(
      { query } as never,
      makeCipher() as never,
    );

    const [channel] = await repository.list();

    expect(channel.secretConfigured).toBe(true);
    expect(JSON.stringify(channel)).not.toContain('mat-khau-that');
    expect(JSON.stringify(channel)).not.toContain('enc(');
    expect(channel).not.toHaveProperty('secret');
    expect(channel).not.toHaveProperty('secretEncrypted');
  });

  it('báo chưa cấu hình khi kênh không có secret', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [
      row({ secret_encrypted: null }),
    ]);
    const repository = new NotificationChannelRepository(
      { query } as never,
      makeCipher() as never,
    );

    const [channel] = await repository.list();

    expect(channel.secretConfigured).toBe(false);
  });

  it('mã hoá secret trước khi ghi xuống database', async () => {
    const cipher = makeCipher();
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [row()]);
    const repository = new NotificationChannelRepository(
      {
        query,
        transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
      } as never,
      cipher as never,
    );

    await repository.update({
      actorUserId: ActorId,
      channel: 'EMAIL',
      secret: 'mat-khau-that',
      reason: 'Đổi mật khẩu SMTP',
    });

    expect(cipher.encrypt).toHaveBeenCalledWith('mat-khau-that');
    const written = query.mock.calls.flatMap(([, params]) => params ?? []);
    expect(written).toContain('enc(mat-khau-that)');
    expect(written).not.toContain('mat-khau-that');
  });

  it('ghi audit cho mỗi lần đổi cấu hình, nhưng không ghi secret vào audit', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [row()]);
    const repository = new NotificationChannelRepository(
      {
        query,
        transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
      } as never,
      makeCipher() as never,
    );

    await repository.update({
      actorUserId: ActorId,
      channel: 'EMAIL',
      secret: 'mat-khau-that',
      reason: 'Đổi mật khẩu SMTP',
    });

    const auditCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('admin_audit_logs'),
    );
    expect(auditCall).toBeDefined();
    expect(JSON.stringify(auditCall)).not.toContain('mat-khau-that');
    expect(JSON.stringify(auditCall)).not.toContain('enc(');
  });

  it('từ chối lưu secret khi chưa có khoá mã hoá', async () => {
    // Fail closed: không có khoá thì không được ghi bản rõ xuống database.
    const cipher = { ...makeCipher(), isConfigured: false };
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [row()]);
    const repository = new NotificationChannelRepository(
      {
        query,
        transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
      } as never,
      cipher as never,
    );

    await expect(
      repository.update({
        actorUserId: ActorId,
        channel: 'EMAIL',
        secret: 'mat-khau-that',
        reason: 'Đổi mật khẩu SMTP',
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('chỉ coi là gửi được khi kênh vừa bật vừa có secret', async () => {
    const cases: [boolean, string | null, boolean][] = [
      [true, 'enc(x)', true],
      [false, 'enc(x)', false],
      [true, null, false],
      [false, null, false],
    ];

    for (const [enabled, secret, expected] of cases) {
      const query = jest.fn(async () => [
        row({ enabled, secret_encrypted: secret }),
      ]);
      const repository = new NotificationChannelRepository(
        { query } as never,
        makeCipher() as never,
      );

      await expect(repository.isSendable('EMAIL')).resolves.toBe(expected);
    }
  });

  it('kênh chưa có trong database thì không gửi được', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => []);
    const repository = new NotificationChannelRepository(
      { query } as never,
      makeCipher() as never,
    );

    await expect(repository.isSendable('ZALO')).resolves.toBe(false);
  });
});
