import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { RankController } from './rank.controller';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('RankController', () => {
  it('routes only the authenticated principal ID to the summary use case', async () => {
    const useCase = {
      handle: jest.fn(async () => ({
        rank: {
          rank: UserRanks.MEMBER,
          lifetimePoints: 224,
          postQuota: 3,
          nextRank: null,
          maintenanceCycle: null,
        },
      })),
    };
    const controller = new RankController(
      useCase as never,
      { handle: jest.fn() } as never,
      { rankOperator: { usernames: [] } } as never,
    );

    const response = await controller.getOwnRankSummary({
      userId: UserId,
    } as never);

    expect(useCase.handle).toHaveBeenCalledWith({ userId: UserId });
    expect(response.body).toEqual({
      rank: {
        rank: UserRanks.MEMBER,
        lifetimePoints: 224,
        postQuota: 3,
        nextRank: null,
        maintenanceCycle: null,
      },
    });
  });
});
