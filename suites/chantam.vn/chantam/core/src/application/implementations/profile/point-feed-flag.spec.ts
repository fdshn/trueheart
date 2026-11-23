import { toOwnProfileDto } from './profile.mapper';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

const UserId = '10000000-0000-4000-8000-000000000002';

function makeUser(showInPublicPointFeed: boolean) {
  return {
    globalId: UserId,
    username: 'nguoi-demo',
    fullName: null,
    avatarUrl: null,
    email: null,
    phone: null,
    defaultLocation: null,
    rank: 'MEMBER',
    status: 'ACTIVE',
    showOnlineStatus: false,
    showInPublicPointFeed,
  };
}

describe('showInPublicPointFeed (CR 22/11/2026 — bảng tin điểm)', () => {
  it('/profile/me trả cờ cho chính chủ', () => {
    expect(toOwnProfileDto(makeUser(true) as never).showInPublicPointFeed).toBe(
      true,
    );
    expect(
      toOwnProfileDto(makeUser(false) as never).showInPublicPointFeed,
    ).toBe(false);
  });

  it('PATCH /profile/me ghi cờ', async () => {
    const repository = {
      findOneBy: jest.fn(async () => makeUser(true)),
      findOneByOrFail: jest.fn(async () => makeUser(false)),
      update: jest.fn(async () => undefined),
    };
    await new UpdateOwnProfileUseCase(
      repository as never,
      {} as never,
      { handle: jest.fn() } as never,
      () => new Date('2026-11-23T00:00:00.000Z'),
      { clearUser: jest.fn(async () => true) } as never,
    ).handle({ userId: UserId, profile: { showInPublicPointFeed: false } });
    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { showInPublicPointFeed: false },
    );
  });
});
