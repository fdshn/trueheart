import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { UnavailableGiveActivityCounter } from './unavailable-give-activity.counter';

describe('UnavailableGiveActivityCounter', () => {
  it('returns unavailable for both cycle and lifetime queries without fabricating gift counts', async () => {
    const counter = new UnavailableGiveActivityCounter();

    await expect(
      counter.countCompletedGifts({
        userId: '10000000-0000-4000-8000-000000000001',
        cycleStart: new Date('2026-01-01T00:00:00.000Z'),
        cycleEnd: new Date('2026-04-01T00:00:00.000Z'),
        rank: UserRanks.SILVER,
      }),
    ).resolves.toEqual({ available: false });
    await expect(
      counter.countLifetimeCompletedGifts({
        userId: '10000000-0000-4000-8000-000000000001',
        rank: UserRanks.SILVER,
      }),
    ).resolves.toEqual({ available: false });
  });
});
