import {
  GroupAlreadyMemberException,
  GroupCreateNotAllowedException,
  GroupDefaultLocationRequiredException,
  OnboardingIncompleteException,
  ProfileIncompleteException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { GroupCreationEligibility } from './group-creation-eligibility';

const UserId = '10000000-0000-4000-8000-000000000001';

/** Người dùng đủ mọi điều kiện; mỗi ca chỉ phá ĐÚNG một điều kiện. */
function eligibleUser(overrides: Record<string, unknown> = {}) {
  return {
    globalId: UserId,
    rank: 'DIAMOND',
    deletedAt: null,
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    phoneVerifiedAt: new Date(),
    email: 'a@chantam.test',
    avatarUrl: 'https://cdn.chantam.test/a.webp',
    defaultLocation: { lat: 10.77, lng: 106.69 },
    ...overrides,
  };
}

function makeDeps(
  options: {
    user?: Record<string, unknown> | null;
    allowed?: boolean;
    member?: boolean;
  } = {},
) {
  return {
    users: {
      findOneBy: jest.fn(async () =>
        options.user === null ? null : eligibleUser(options.user),
      ),
    },
    entitlements: {
      getCapability: jest.fn(async () => ({
        allowed: options.allowed ?? true,
      })),
    },
    groups: { hasMembership: jest.fn(async () => options.member ?? false) },
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new GroupCreationEligibility(
    deps.users as never,
    deps.entitlements as never,
    deps.groups as never,
  );

describe('GroupCreationEligibility (SRS 3.7A)', () => {
  it('đủ điều kiện thì canCreateGroup và reasonCode null', async () => {
    await expect(build(makeDeps()).evaluate(UserId)).resolves.toEqual({
      canCreateGroup: true,
      reasonCode: null,
    });
  });

  it.each([
    ['hạng chưa được tạo nhóm', { allowed: false }, 'GROUP_CREATE_NOT_ALLOWED'],
    ['đã thuộc hoặc sở hữu nhóm', { member: true }, 'GROUP_ALREADY_MEMBER'],
    [
      'chưa có Vị trí mặc định',
      { user: { defaultLocation: null } },
      'GROUP_DEFAULT_LOCATION_REQUIRED',
    ],
    ['còn ở bậc VIEWER', { user: { rank: 'VIEWER' } }, 'ONBOARDING_INCOMPLETE'],
  ])('%s → %s', async (_label, options, reason) => {
    await expect(build(makeDeps(options)).evaluate(UserId)).resolves.toEqual({
      canCreateGroup: false,
      reasonCode: reason,
    });
  });

  it('đã thuộc nhóm thì KHÔNG báo thiếu vị trí — thứ tự giữ đúng như POST /groups', async () => {
    const result = await build(
      makeDeps({ member: true, user: { defaultLocation: null } }),
    ).evaluate(UserId);
    expect(result.reasonCode).toBe('GROUP_ALREADY_MEMBER');
  });

  it('hạng không đủ thì không cần hỏi membership', async () => {
    const deps = makeDeps({ allowed: false });
    await build(deps).evaluate(UserId);
    expect(deps.groups.hasMembership).not.toHaveBeenCalled();
  });

  it.each([
    [{ allowed: false }, GroupCreateNotAllowedException],
    [{ member: true }, GroupAlreadyMemberException],
    [
      { user: { defaultLocation: null } },
      GroupDefaultLocationRequiredException,
    ],
    [{ user: { rank: 'VIEWER' } }, OnboardingIncompleteException],
  ])(
    'assertCanCreate ném ĐÚNG ngoại lệ của lý do chặn (%o)',
    async (options, exception) => {
      await expect(
        build(makeDeps(options)).assertCanCreate(UserId),
      ).rejects.toThrow(exception);
    },
  );

  it('hồ sơ thiếu thì PROFILE_INCOMPLETE và ngoại lệ mang đúng danh sách thiếu', async () => {
    const deps = makeDeps({ user: { fullName: null } });
    const result = await build(deps).evaluate(UserId);
    expect(result.reasonCode).toBe('PROFILE_INCOMPLETE');
    await expect(build(deps).assertCanCreate(UserId)).rejects.toThrow(
      ProfileIncompleteException,
    );
  });

  it('người dùng không tồn tại thì 404, không phải một lý do chặn', async () => {
    await expect(
      build(makeDeps({ user: null })).evaluate(UserId),
    ).rejects.toThrow(UserNotFoundException);
  });

  it('assertCanCreate trả người tạo khi đủ điều kiện', async () => {
    await expect(
      build(makeDeps()).assertCanCreate(UserId),
    ).resolves.toMatchObject({ globalId: UserId });
  });
});
