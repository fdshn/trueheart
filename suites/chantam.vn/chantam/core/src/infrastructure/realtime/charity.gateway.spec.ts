import { CharityGateway } from './charity.gateway';

function makeGateway(
  options: { visible?: string | null; owner?: string } = {},
) {
  const gateway = new CharityGateway(
    {
      verifyAccessToken: jest.fn(async (token: string) => ({
        userId: token,
        issuedAt: 1,
      })),
    } as never,
    { isRevoked: jest.fn(async () => false) } as never,
    {
      findByGlobalId: jest.fn(async () => ({
        createdBy: options.owner ?? 'owner',
      })),
      isCampaignManager: jest.fn(async () => false),
    } as never,
    {
      findVisibleCampaignId: jest.fn(async () =>
        options.visible === undefined ? 'c1' : options.visible,
      ),
    } as never,
    { hasPermission: jest.fn(async () => false) } as never,
  );
  const emitted: { room: string; payload: unknown }[] = [];
  (gateway as unknown as { server: unknown }).server = {
    to: (room: string) => ({
      emit: (_event: string, payload: unknown) =>
        emitted.push({ room, payload }),
    }),
  };
  return { gateway, emitted };
}

function socket(token: string | null) {
  const joined: string[] = [];
  return {
    joined,
    client: {
      data: {},
      handshake: { auth: token ? { token } : {}, headers: {} },
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(async (room: string) => {
        joined.push(room);
      }),
      leave: jest.fn(async () => undefined),
    },
  };
}

describe('CharityGateway', () => {
  afterEach(() => jest.useRealTimers());

  it('join gửi ngay khi nối (xác thực chưa xong) vẫn được xét sau khi xác thực xong', async () => {
    const { gateway } = makeGateway();
    const owner = socket('owner');
    const connecting = gateway.handleConnection(owner.client as never);
    const joined = gateway.join(owner.client as never, {
      campaignId: 'c1',
      scope: 'workspace',
    });
    await connecting;
    expect(await joined).toEqual({ joined: true });
  });

  it('gộp tín hiệu trong 1 giây: một lần phát mỗi phòng; thay đổi công khai tới cả workspace', () => {
    jest.useFakeTimers();
    const { gateway, emitted } = makeGateway();
    gateway.signal('c1', ['POSTS'], 'public');
    gateway.signal('c1', ['TIMELINE'], 'public');
    gateway.signal('c1', ['CHECKLIST'], 'workspace');
    expect(emitted).toHaveLength(0);
    jest.advanceTimersByTime(1000);
    expect(emitted).toEqual([
      {
        room: 'charity:c1:public',
        payload: expect.objectContaining({
          campaignId: 'c1',
          sections: ['POSTS', 'TIMELINE'],
        }),
      },
      {
        room: 'charity:c1:workspace',
        payload: expect.objectContaining({
          sections: ['POSTS', 'TIMELINE', 'CHECKLIST'],
        }),
      },
    ]);
  });

  it('chỉ workspace: không phát phòng công khai', () => {
    jest.useFakeTimers();
    const { gateway, emitted } = makeGateway();
    gateway.signal('c1', ['PARTICIPANTS'], 'workspace');
    jest.advanceTimersByTime(1000);
    expect(emitted.map((row) => row.room)).toEqual(['charity:c1:workspace']);
  });

  it('không token → ngắt; quá số kết nối mỗi người → ngắt', async () => {
    const { gateway } = makeGateway();
    const anonymous = socket(null);
    await gateway.handleConnection(anonymous.client as never);
    expect(anonymous.client.disconnect).toHaveBeenCalled();

    const sockets = Array.from({ length: 6 }, () => socket('u1'));
    for (const item of sockets)
      await gateway.handleConnection(item.client as never);
    expect(sockets[4].client.disconnect).not.toHaveBeenCalled();
    expect(sockets[5].client.disconnect).toHaveBeenCalled();

    gateway.handleDisconnect(sockets[0].client as never);
    const again = socket('u1');
    await gateway.handleConnection(again.client as never);
    expect(again.client.disconnect).not.toHaveBeenCalled();
  });

  it('join: public cần dự án hiện ra ngoài; workspace cần vai với dự án', async () => {
    const { gateway } = makeGateway({ visible: null });
    const viewer = socket('viewer');
    await gateway.handleConnection(viewer.client as never);
    expect(
      await gateway.join(viewer.client as never, {
        campaignId: 'c1',
        scope: 'public',
      }),
    ).toEqual({ joined: false });
    expect(
      await gateway.join(viewer.client as never, {
        campaignId: 'c1',
        scope: 'workspace',
      }),
    ).toEqual({ joined: false });

    const owner = socket('owner');
    await gateway.handleConnection(owner.client as never);
    expect(
      await gateway.join(owner.client as never, {
        campaignId: 'c1',
        scope: 'workspace',
      }),
    ).toEqual({ joined: true });
    expect(owner.joined).toEqual(['charity:c1:workspace']);
  });
});
