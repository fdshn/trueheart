import {
  IPointLedgerRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { GetPublicProfileUseCase } from './get-public-profile.use-case';

const User = {
  globalId: '22222222-2222-2222-2222-222222222222',
  username: 'member',
  fullName: 'Member',
  avatarUrl: null,
  rank: 'MEMBER',
};

describe('GetPublicProfileUseCase canonical post count', () => {
  it('counts published canonical posts rather than the retired gift_posts table', async () => {
    const users = {
      findActiveByUsername: jest.fn(async () => User),
    } as unknown as jest.Mocked<IUserRepository>;
    const posts = {
      countPublishedByAuthor: jest.fn(async () => 3),
    } as unknown as jest.Mocked<IPostRepository>;
    const ledger = {
      getSummary: jest.fn(async () => ({ balance: 0, lifetime: 224 })),
    } as unknown as jest.Mocked<IPointLedgerRepository>;

    const result = await new GetPublicProfileUseCase(
      users,
      posts,
      ledger,
      { web: { publicBaseUrl: '' } } as never,
      {
        getAccuracy: async () => ({
          percent: null,
          samples: 0,
          reviewRequired: false,
        }),
        getRating: async () => ({
          asGiver: { average: null, samples: 0 },
          asReceiver: { average: null, samples: 0 },
        }),
      } as never,
      { getConfigValue: async () => null } as never,
    ).handle({
      username: User.username,
    });

    expect(posts.countPublishedByAuthor).toHaveBeenCalledWith(User.globalId);
    expect(result.profile.publishedGiftPostCount).toBe(3);
  });
});
