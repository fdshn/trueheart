import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { GetAdminDashboardUseCase } from './admin-dashboard.use-case';

const ActorId = '10000000-0000-4000-8000-000000000001';

function makeDeps(granted = true) {
  const permissions = { hasPermission: jest.fn().mockResolvedValue(granted) };
  const dashboard = {
    read: jest.fn(async (windowDays: number) => ({ windowDays })),
  };
  return { permissions, dashboard };
}

async function windowFor(windowDays: number | undefined) {
  const { permissions, dashboard } = makeDeps();
  await new GetAdminDashboardUseCase(
    permissions as never,
    dashboard as never,
  ).handle({ actorUserId: ActorId, windowDays });
  return dashboard.read.mock.calls[0][0];
}

describe(GetAdminDashboardUseCase.name, () => {
  it('đòi dashboard.read và không đọc số liệu khi thiếu quyền', async () => {
    const { permissions, dashboard } = makeDeps(false);

    await expect(
      new GetAdminDashboardUseCase(
        permissions as never,
        dashboard as never,
      ).handle({ actorUserId: ActorId, windowDays: 7 }),
    ).rejects.toThrow(ForbiddenException);
    expect(permissions.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'dashboard.read',
    );
    expect(dashboard.read).not.toHaveBeenCalled();
  });

  it('bọc kết quả của repository vào dashboard', async () => {
    const { permissions, dashboard } = makeDeps();

    const result = await new GetAdminDashboardUseCase(
      permissions as never,
      dashboard as never,
    ).handle({ actorUserId: ActorId, windowDays: 7 });

    expect(dashboard.read).toHaveBeenCalledWith(7);
    expect(result).toEqual({ dashboard: { windowDays: 7 } });
  });

  it('không gửi windowDays thì dùng 30 ngày', async () => {
    expect(await windowFor(undefined)).toBe(30);
  });

  it('kẹp chứ không ném: quá dài về 365, quá ngắn về 1, số lẻ bị cắt', async () => {
    expect(await windowFor(99999)).toBe(365);
    expect(await windowFor(365)).toBe(365);
    expect(await windowFor(0)).toBe(1);
    expect(await windowFor(-5)).toBe(1);
    expect(await windowFor(7.9)).toBe(7);
    expect(await windowFor(0.5)).toBe(1);
  });

  // NaN lọt qua phép kẹp (Math.max/Math.min với NaN trả NaN) thì repository nhận
  // NaN và gửi 'NaN' vào SQL. Đường HTTP có @IsInt chặn, CLI và job nền thì không.
  it('windowDays NaN rơi về mặc định thay vì đi thẳng xuống SQL', async () => {
    expect(await windowFor(Number.NaN)).toBe(30);
  });

  it('Infinity cũng rơi về mặc định, không bị kẹp thành 365', async () => {
    expect(await windowFor(Number.POSITIVE_INFINITY)).toBe(30);
  });
});
