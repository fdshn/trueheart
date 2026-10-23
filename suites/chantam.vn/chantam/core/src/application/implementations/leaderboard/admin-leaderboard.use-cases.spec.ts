import {
  LeaderboardBadgeNotFoundException,
  LeaderboardExclusionExistsException,
  LeaderboardExclusionNotFoundException,
  LeaderboardMonthClosedException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  LeaderboardBoards,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  CreateLeaderboardExclusionUseCase,
  GetAdminMonthlyLeaderboardUseCase,
  RemoveLeaderboardExclusionUseCase,
  RevokeLeaderboardBadgeUseCase,
} from './admin-leaderboard.use-cases';

const Admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const Cheater = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const now = () => new Date('2026-10-24T05:00:00Z');

const exclusion = {
  exclusionId: 'x-1',
  month: '2026-10-01',
  board: LeaderboardBoards.GIVERS,
  userId: Cheater,
  reason: 'Tự trao qua lại',
  createdBy: Admin,
  createdAt: new Date(),
  removedAt: null,
  removedBy: null,
};

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    repository: {
      findSnapshot: jest.fn(async () => null),
      createExclusion: jest.fn(async () => exclusion),
      removeExclusion: jest.fn(async () => ({
        ...exclusion,
        removedAt: new Date(),
        removedBy: Admin,
      })),
      revokeBadge: jest.fn(async () => ({
        badgeId: 'b-1',
        userId: Cheater,
        board: LeaderboardBoards.GIVERS,
        month: '2026-09-01',
        rank: 1,
        isAnonymous: false,
        awardedAt: new Date(),
        expiresAt: new Date(),
        revokedAt: new Date(),
        revokeReason: 'Gian lận',
      })),
      computeLive: jest.fn(async () => []),
      listSnapshotEntries: jest.fn(async () => ({ items: [], total: 0 })),
      ...overrides,
    },
    adminConfig: {
      appendAudit: jest.fn(async () => undefined),
      getConfigValue: jest.fn(async () => null),
    },
    users: {
      findOneBy: jest.fn(async () => ({ globalId: Cheater, deletedAt: null })),
    },
  };
}

const create = (deps = makeDeps()) =>
  new CreateLeaderboardExclusionUseCase(
    deps.repository as never,
    deps.adminConfig as never,
    deps.users as never,
  );

const command = {
  actorUserId: Admin,
  month: '2026-10',
  board: LeaderboardBoards.GIVERS,
  userId: Cheater,
  reason: 'Tự trao qua lại với tài khoản phụ',
};

describe('CreateLeaderboardExclusionUseCase', () => {
  it('loại hợp lệ: ghi lượt loại và audit kèm lý do', async () => {
    const deps = makeDeps();

    const result = await create(deps).handle(command);

    expect(result.exclusion.exclusionId).toBe('x-1');
    expect(result.exclusion.month).toBe('2026-10');
    expect(deps.repository.createExclusion).toHaveBeenCalledWith({
      month: '2026-10-01',
      board: LeaderboardBoards.GIVERS,
      userId: Cheater,
      reason: 'Tự trao qua lại với tài khoản phụ',
      actorUserId: Admin,
    });
    expect(deps.adminConfig.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: Admin,
        action: 'LEADERBOARD_EXCLUDE',
        resourceType: 'LEADERBOARD_EXCLUSION',
        resourceId: 'x-1',
        reason: 'Tự trao qua lại với tài khoản phụ',
      }),
    );
  });

  it('tháng đã chốt (repository trả null dưới khoá) thì từ chối, không audit', async () => {
    // Phép kiểm "đã chốt" nằm TRONG repository, dưới cùng khoá với lượt chốt — kiểm ở use
    // case thì job có thể chốt ở khe giữa lúc kiểm và lúc ghi. `test:leaderboard` nhóm 11
    // canh phần SQL, gồm cả ca loại "mọi bảng".
    const deps = makeDeps({ createExclusion: jest.fn(async () => null) });

    await expect(create(deps).handle(command)).rejects.toBeInstanceOf(
      LeaderboardMonthClosedException,
    );
    expect(deps.adminConfig.appendAudit).not.toHaveBeenCalled();
  });

  it('loại trùng (ràng buộc unique) thì 409 có nghĩa, không 500', async () => {
    const duplicate = Object.assign(new Error('duplicate key'), {
      driverError: { constraint: 'UQ_leaderboard_exclusions_active' },
    });
    const deps = makeDeps({
      createExclusion: jest.fn(async () => {
        throw duplicate;
      }),
    });

    await expect(create(deps).handle(command)).rejects.toBeInstanceOf(
      LeaderboardExclusionExistsException,
    );
    expect(deps.adminConfig.appendAudit).not.toHaveBeenCalled();
  });

  it('người không tồn tại thì 404, không để khoá ngoại ra 500', async () => {
    const deps = makeDeps();
    deps.users.findOneBy.mockResolvedValue(null as never);

    await expect(create(deps).handle(command)).rejects.toBeInstanceOf(
      UserNotFoundException,
    );
  });

  it('tháng sai dạng thì 400', async () => {
    await expect(
      create().handle({ ...command, month: '10/2026' }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});

describe('RemoveLeaderboardExclusionUseCase', () => {
  it('bỏ lượt loại ghi audit; không có thì 404', async () => {
    const deps = makeDeps();
    const useCase = new RemoveLeaderboardExclusionUseCase(
      deps.repository as never,
      deps.adminConfig as never,
    );

    await useCase.handle({ actorUserId: Admin, exclusionId: 'x-1' });
    expect(deps.adminConfig.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEADERBOARD_EXCLUSION_REMOVE' }),
    );

    deps.repository.removeExclusion.mockResolvedValue(null as never);
    await expect(
      useCase.handle({ actorUserId: Admin, exclusionId: 'x-1' }),
    ).rejects.toBeInstanceOf(LeaderboardExclusionNotFoundException);
  });
});

describe('RevokeLeaderboardBadgeUseCase', () => {
  it('gỡ huy hiệu ghi audit kèm lý do và KHÔNG đụng tới bản chốt', async () => {
    const deps = makeDeps();
    const useCase = new RevokeLeaderboardBadgeUseCase(
      deps.repository as never,
      deps.adminConfig as never,
    );

    const result = await useCase.handle({
      actorUserId: Admin,
      badgeId: 'b-1',
      reason: 'Gian lận',
    });

    expect(result.badge.status).toBe('REVOKED');
    expect(deps.adminConfig.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BADGE_REVOKE',
        resourceType: 'USER_BADGE',
        resourceId: 'b-1',
        reason: 'Gian lận',
      }),
    );
    expect(deps.repository.listSnapshotEntries).not.toHaveBeenCalled();
  });

  it('huy hiệu không có hoặc đã gỡ thì 404', async () => {
    const deps = makeDeps({ revokeBadge: jest.fn(async () => null) });

    await expect(
      new RevokeLeaderboardBadgeUseCase(
        deps.repository as never,
        deps.adminConfig as never,
      ).handle({ actorUserId: Admin, badgeId: 'b-1', reason: 'Gian lận' }),
    ).rejects.toBeInstanceOf(LeaderboardBadgeNotFoundException);
  });
});

describe('GetAdminMonthlyLeaderboardUseCase', () => {
  it('tháng chưa chốt: danh tính thật và cả người bị loại, kể cả khi tính năng tắt', async () => {
    const deps = makeDeps({
      computeLive: jest.fn(async () => [
        {
          rank: 1,
          count: 3,
          reachedAt: new Date(),
          userId: Cheater,
          isAnonymous: true,
          isInactive: false,
          excluded: true,
          identity: {
            username: 'gian',
            fullName: null,
            avatarUrl: null,
            rank: UserRanks.MEMBER,
          },
        },
      ]),
    });
    deps.adminConfig.getConfigValue.mockImplementation((async (key: string) =>
      key === 'leaderboard.enabled' ? 0 : null) as never);

    const result = await new GetAdminMonthlyLeaderboardUseCase(
      deps.repository as never,
      deps.adminConfig as never,
      now,
    ).handle({ board: LeaderboardBoards.GIVERS });

    expect(deps.repository.computeLive).toHaveBeenCalledWith(
      expect.objectContaining({ revealIdentity: true, includeExcluded: true }),
    );
    expect(result.enabled).toBe(false);
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        userId: Cheater,
        excluded: true,
        isAnonymous: true,
        user: expect.objectContaining({ username: 'gian' }),
      }),
    );
  });
});

describe('audit gỡ huy hiệu ghi đúng trạng thái TRƯỚC khi gỡ', () => {
  it.each([
    ['còn hạn', new Date('2099-01-01T00:00:00Z'), 'ACTIVE'],
    ['đã hết hạn', new Date('2020-01-01T00:00:00Z'), 'EXPIRED'],
  ])('huy hiệu %s → before.status %s', async (_label, expiresAt, status) => {
    const deps = makeDeps();
    deps.repository.revokeBadge.mockResolvedValue({
      badgeId: 'b-1',
      userId: Cheater,
      board: LeaderboardBoards.GIVERS,
      month: '2026-09-01',
      rank: 1,
      isAnonymous: false,
      awardedAt: new Date('2026-10-01T00:00:00Z'),
      expiresAt,
      revokedAt: new Date(),
      revokeReason: 'Gian lận',
    } as never);

    await new RevokeLeaderboardBadgeUseCase(
      deps.repository as never,
      deps.adminConfig as never,
    ).handle({ actorUserId: Admin, badgeId: 'b-1', reason: 'Gian lận' });

    expect(deps.adminConfig.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ status, revokeReason: null }),
        after: expect.objectContaining({ status: 'REVOKED' }),
      }),
    );
  });
});
