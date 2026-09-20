import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { GetSystemLogsUseCase } from './get-system-logs.use-case';

const ActorId = '10000000-0000-4000-8000-000000000001';
const SubjectId = '20000000-0000-4000-8000-000000000002';

function makeDeps(granted: string[]) {
  return {
    permissions: {
      hasPermission: jest.fn(async (_userId: string, permission: string) =>
        granted.includes(permission),
      ),
    },
    logs: {
      query: jest.fn(async (_query: unknown) => ({
        entries: [],
        total: 0,
      })),
    },
  };
}

describe('GetSystemLogsUseCase', () => {
  it('từ chối khi thiếu audit.read và không chạm tới nhật ký', async () => {
    // Nhật ký gộp cả điểm lẫn giao dịch của người dùng, nên quyền đọc cấu hình
    // là chưa đủ.
    const deps = makeDeps(['config.read']);
    const useCase = new GetSystemLogsUseCase(
      deps.permissions as never,
      deps.logs as never,
    );

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        logType: 'POINT',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.logs.query).not.toHaveBeenCalled();
  });

  it('chuyển đủ bộ lọc xuống tầng nhật ký kèm phân trang', async () => {
    const deps = makeDeps(['audit.read']);
    const useCase = new GetSystemLogsUseCase(
      deps.permissions as never,
      deps.logs as never,
    );
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T00:00:00.000Z');

    const result = await useCase.handle({
      actorUserId: ActorId,
      logType: 'TRANSACTION',
      userId: SubjectId,
      action: 'COMPLETED',
      from,
      to,
      page: 3,
      pageSize: 20,
    });

    expect(deps.logs.query).toHaveBeenCalledWith({
      logType: 'TRANSACTION',
      userId: SubjectId,
      action: 'COMPLETED',
      from,
      to,
      skip: 40,
      take: 20,
    });
    expect(result.meta.page).toBe(3);
  });
});
