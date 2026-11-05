import { ChatGateway } from './chat.gateway';

describe('ChatGateway', () => {
  function make(allowed: boolean) {
    let release: () => void = () => undefined;
    const slowVerify = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway = new ChatGateway(
      {
        verifyAccessToken: jest.fn(async (token: string) => {
          await slowVerify;
          return { userId: token, issuedAt: 1 };
        }),
      } as never,
      { isRevoked: jest.fn(async () => false) } as never,
      {
        findRoomForParticipant: jest.fn(async () =>
          allowed ? { roomId: 'r1' } : null,
        ),
      } as never,
    );
    const client = {
      data: {},
      handshake: { auth: { token: 'u1' }, headers: {} },
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(async () => undefined),
    };
    return { gateway, client, release: () => release() };
  }

  it('room:join gửi trước khi xác thực xong vẫn được xét sau khi xác thực xong', async () => {
    const { gateway, client, release } = make(true);
    const connecting = gateway.handleConnection(client as never);
    const joined = gateway.joinRoom(client as never, { roomId: 'r1' });
    release();
    await connecting;
    expect(await joined).toEqual({ joined: true });
    expect(client.join).toHaveBeenCalledWith('chat:r1');
  });

  it('không phải người trong phòng → joined false', async () => {
    const { gateway, client, release } = make(false);
    const connecting = gateway.handleConnection(client as never);
    release();
    await connecting;
    expect(await gateway.joinRoom(client as never, { roomId: 'r1' })).toEqual({
      joined: false,
    });
  });
});
