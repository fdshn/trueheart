import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { EntitlementRepository } from './entitlement.repository';

describe('EntitlementRepository', () => {
  it('maps the published rank policy into user entitlements', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        rank: UserRanks.SILVER,
        revision_id: '7',
        code: 'POST_OFFER',
        allowed: true,
        limit_value: '10',
      },
      {
        rank: UserRanks.SILVER,
        revision_id: '7',
        code: 'CREATE_GROUP',
        allowed: false,
        limit_value: null,
      },
    ]);
    const repository = new EntitlementRepository({ query } as never);

    await expect(
      repository.getOwnEntitlements('10000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({
      rank: UserRanks.SILVER,
      policyRevisionId: 7,
      capabilities: [
        {
          code: 'POST_OFFER',
          allowed: true,
          limit: 10,
          used: 0,
          remaining: 10,
          reasonCode: null,
        },
        {
          code: 'CREATE_GROUP',
          allowed: false,
          limit: null,
          used: 0,
          remaining: null,
          reasonCode: 'RANK_REQUIREMENT_NOT_MET',
        },
      ],
    });
  });
});
