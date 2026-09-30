import { SelfRoleChangeException } from '@/domain/exceptions';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  ChangeAdminUserStatusUseCase,
  DeleteAdminUserUseCase,
  GetAdminUserUseCase,
  ListAdminUsersUseCase,
} from './admin-user.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const TargetId = '20000000-0000-4000-8000-000000000002';

const UserSummary = {
  userId: TargetId,
  username: 'nguoi-demo',
  fullName: 'Người Demo',
  email: null,
  phone: null,
  rank: 'MEMBER' as never,
  status: UserStatuses.BANNED,
  phoneVerified: false,
  suspendedUntil: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  deletedAt: null,
  adminRoles: [],
};

function makeDeps(granted: string[]) {
  const execute = jest.fn(async () => ({ affected: 3 }));
  const builder = {
    update: () => builder,
    set: () => builder,
    where: () => builder,
    andWhere: () => builder,
    execute,
  };

  return {
    permissions: {
      hasPermission: jest.fn(async (_userId: string, permission: string) =>
        granted.includes(permission),
      ),
    },
    users: {
      search: jest.fn(async (_query: unknown) => ({
        entries: [UserSummary],
        total: 1,
      })),
      findOne: jest.fn(async (_userId: string) => UserSummary),
      changeStatus: jest.fn(async (_change: unknown) => UserSummary),
      softDelete: jest.fn(async (_deletion: unknown) => UserSummary),
    },
    sessions: { createQueryBuilder: () => builder },
    denyList: { revokeIssuedBefore: jest.fn(async () => undefined) },
    referrals: {
      getOwnSummary: jest.fn(async () => ({
        code: 'AB12CD34EF',
        totalCount: 4,
        qualifiedCount: 2,
        rewardedCount: 2,
        invitees: [],
      })),
      countSharedSignupFingerprints: jest.fn(async () => 1),
    },
  };
}

describe('Admin user management authorization', () => {
  it('từ chối liệt kê user khi thiếu admin.manage', async () => {
    const deps = makeDeps([]);
    const useCase = new ListAdminUsersUseCase(
      deps.permissions as never,
      deps.users as never,
    );

    await expect(
      useCase.handle({ actorUserId: ActorId, page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.users.search).not.toHaveBeenCalled();
  });

  it('từ chối xem chi tiết khi thiếu quyền', async () => {
    const deps = makeDeps(['audit.read']);
    const useCase = new GetAdminUserUseCase(
      deps.permissions as never,
      deps.users as never,
      deps.referrals as never,
    );

    await expect(
      useCase.handle({ actorUserId: ActorId, targetUserId: TargetId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Admin user status changes', () => {
  function makeStatusUseCase(deps: ReturnType<typeof makeDeps>) {
    return new ChangeAdminUserStatusUseCase(
      deps.permissions as never,
      deps.users as never,
      deps.sessions as never,
      deps.denyList as never,
    );
  }

  it('khoá tài khoản thì thu hồi CẢ access token lẫn phiên', async () => {
    // Thiếu vế token thì token cũ sống tới lúc hết hạn; thiếu vế phiên thì gọi
    // /refresh là có token mới.
    const deps = makeDeps(['admin.manage']);

    const result = await makeStatusUseCase(deps).handle({
      actorUserId: ActorId,
      targetUserId: TargetId,
      statusChange: {
        status: UserStatuses.BANNED,
        reason: 'Gian lận điểm',
      },
    });

    expect(deps.denyList.revokeIssuedBefore).toHaveBeenCalledWith(TargetId);
    expect(result.revokedSessions).toBe(3);
  });

  it('mở khoá lại thì không cần thu hồi gì', async () => {
    const deps = makeDeps(['admin.manage']);

    const result = await makeStatusUseCase(deps).handle({
      actorUserId: ActorId,
      targetUserId: TargetId,
      statusChange: {
        status: UserStatuses.ACTIVE,
        reason: 'Đã xác minh lại',
      },
    });

    expect(deps.denyList.revokeIssuedBefore).not.toHaveBeenCalled();
    expect(result.revokedSessions).toBe(0);
  });

  it('tạm khoá bắt buộc có mốc hết hạn', async () => {
    const deps = makeDeps(['admin.manage']);

    await expect(
      makeStatusUseCase(deps).handle({
        actorUserId: ActorId,
        targetUserId: TargetId,
        statusChange: {
          status: UserStatuses.SUSPENDED,
          reason: 'Cảnh cáo',
        },
      }),
    ).rejects.toThrow();
    expect(deps.users.changeStatus).not.toHaveBeenCalled();
  });

  it('bỏ khoá thì xoá luôn mốc tạm khoá cũ', async () => {
    // Còn mốc cũ là lần sau hệ thống lại tự coi như đang bị khoá.
    const deps = makeDeps(['admin.manage']);

    await makeStatusUseCase(deps).handle({
      actorUserId: ActorId,
      targetUserId: TargetId,
      statusChange: {
        status: UserStatuses.ACTIVE,
        suspendedUntil: new Date('2026-10-01T00:00:00.000Z'),
        reason: 'Gỡ khoá',
      },
    });

    expect(deps.users.changeStatus).toHaveBeenCalledWith(
      expect.objectContaining({ suspendedUntil: null }),
    );
  });

  it('không tự khoá chính mình', async () => {
    const deps = makeDeps(['admin.manage']);

    await expect(
      makeStatusUseCase(deps).handle({
        actorUserId: ActorId,
        targetUserId: ActorId,
        statusChange: { status: UserStatuses.BANNED, reason: 'Nhầm' },
      }),
    ).rejects.toBeInstanceOf(SelfRoleChangeException);
    expect(deps.users.changeStatus).not.toHaveBeenCalled();
  });
});

describe('Admin user deletion', () => {
  function makeDeleteUseCase(deps: ReturnType<typeof makeDeps>) {
    return new DeleteAdminUserUseCase(
      deps.permissions as never,
      deps.users as never,
      deps.sessions as never,
      deps.denyList as never,
    );
  }

  it('xoá thì luôn thu hồi token và phiên', async () => {
    const deps = makeDeps(['admin.manage']);

    const result = await makeDeleteUseCase(deps).handle({
      actorUserId: ActorId,
      targetUserId: TargetId,
      deletion: { reason: 'Yêu cầu của người dùng' },
    });

    expect(deps.users.softDelete).toHaveBeenCalledTimes(1);
    expect(deps.denyList.revokeIssuedBefore).toHaveBeenCalledWith(TargetId);
    expect(result.revokedSessions).toBe(3);
  });

  it('không tự xoá chính mình', async () => {
    const deps = makeDeps(['admin.manage']);

    await expect(
      makeDeleteUseCase(deps).handle({
        actorUserId: ActorId,
        targetUserId: ActorId,
        deletion: { reason: 'Nhầm' },
      }),
    ).rejects.toBeInstanceOf(SelfRoleChangeException);
    expect(deps.users.softDelete).not.toHaveBeenCalled();
  });

  it('bắt buộc có lý do', async () => {
    const deps = makeDeps(['admin.manage']);

    await expect(
      makeDeleteUseCase(deps).handle({
        actorUserId: ActorId,
        targetUserId: TargetId,
        deletion: { reason: '   ' },
      }),
    ).rejects.toThrow();
    expect(deps.users.softDelete).not.toHaveBeenCalled();
  });
});
