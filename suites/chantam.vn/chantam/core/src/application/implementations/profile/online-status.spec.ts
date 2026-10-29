import { toOwnProfileDto } from './profile.mapper';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

function makeUser(showOnlineStatus: boolean) {
  return {
    globalId: UserId,
    username: 'nguoi-demo',
    fullName: 'Người Demo',
    avatarUrl: null,
    email: null,
    phone: null,
    defaultLocation: null,
    rank: 'MEMBER',
    status: 'ACTIVE',
    showOnlineStatus,
  };
}

function make(before: boolean, after: boolean) {
  const repository = {
    findOneBy: jest.fn(async () => makeUser(before)),
    findOneByOrFail: jest.fn(async () => makeUser(after)),
    update: jest.fn(async () => undefined),
  };
  const presence = { clearUser: jest.fn(async () => true) };
  const useCase = new UpdateOwnProfileUseCase(
    repository as never,
    {} as never,
    { handle: jest.fn() } as never,
    () => new Date('2026-10-29T00:00:00.000Z'),
    presence as never,
  );
  return { repository, presence, useCase };
}

describe('showOnlineStatus (PR #46 §10.5)', () => {
  it('mặc định tắt; /profile/me trả cờ cho chính chủ', () => {
    expect(toOwnProfileDto(makeUser(false) as never).showOnlineStatus).toBe(
      false,
    );
    expect(toOwnProfileDto(makeUser(true) as never).showOnlineStatus).toBe(
      true,
    );
  });

  it('bật: ghi cờ, không đụng Redis — heartbeat kế tiếp mới đưa vào danh sách hiện', async () => {
    const { repository, presence, useCase } = make(false, true);

    await useCase.handle({
      userId: UserId,
      profile: { showOnlineStatus: true },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { showOnlineStatus: true },
    );
    expect(presence.clearUser).not.toHaveBeenCalled();
  });

  it('tắt: xoá NGAY mọi session presence của người này khỏi Redis', async () => {
    const { repository, presence, useCase } = make(true, false);

    await useCase.handle({
      userId: UserId,
      profile: { showOnlineStatus: false },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { showOnlineStatus: false },
    );
    expect(presence.clearUser).toHaveBeenCalledWith(UserId);
  });

  it('gửi lại false khi vốn đã tắt: không xoá gì', async () => {
    const { presence, useCase } = make(false, false);

    await useCase.handle({
      userId: UserId,
      profile: { showOnlineStatus: false },
    });

    expect(presence.clearUser).not.toHaveBeenCalled();
  });
});
