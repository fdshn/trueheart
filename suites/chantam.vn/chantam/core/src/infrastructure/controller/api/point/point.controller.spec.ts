import { PointController } from './point.controller';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('PointController', () => {
  it('passes only the authenticated principal ID to the summary use case', async () => {
    const summary = {
      handle: jest.fn(async () => ({ point: { balance: 0, lifetime: 0 } })),
    };
    const ledger = { handle: jest.fn() };
    const controller = new PointController(summary as never, ledger as never);

    await controller.getOwnPointSummary({ userId: UserId } as never);

    expect(summary.handle).toHaveBeenCalledWith({ userId: UserId });
  });

  it('passes only the authenticated principal ID to the ledger use case', async () => {
    const summary = { handle: jest.fn() };
    const ledger = { handle: jest.fn(async () => ({ entries: [], meta: {} })) };
    const controller = new PointController(summary as never, ledger as never);

    await controller.getOwnPointLedger(
      { userId: UserId } as never,
      { page: 2, pageSize: 10, userId: 'caller-controlled-id' } as never,
    );

    expect(ledger.handle).toHaveBeenCalledWith({
      userId: UserId,
      page: 2,
      pageSize: 10,
    });
  });
});
