import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  GetTrustThresholdsUseCase,
  SetTrustThresholdUseCase,
} from './trust-threshold.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function makeRepository(
  stored: Record<string, unknown> = {},
  granted: string[] = ['config.read', 'config.write'],
) {
  return {
    hasPermission: jest.fn(async (_id: string, code: string) =>
      granted.includes(code),
    ),
    getConfigValue: jest.fn(async (key: string) => stored[key] ?? null),
    publishSystemConfig: jest.fn(
      async (command: { key: string; value: unknown }) => {
        stored[command.key] = command.value;
        return {};
      },
    ),
  };
}

describe('GetTrustThresholdsUseCase (CMS A13)', () => {
  it('đòi config.read', async () => {
    const repository = makeRepository({}, []);
    await expect(
      new GetTrustThresholdsUseCase(repository as never).handle({
        actorUserId: ActorId,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('chưa ai publish thì trả mặc định và isConfigured false', async () => {
    const result = await new GetTrustThresholdsUseCase(
      makeRepository() as never,
    ).handle({ actorUserId: ActorId });

    expect(result.giverAccuracy).toEqual({
      value: { minSamples: 5, reviewThresholdPercent: 75 },
      isConfigured: false,
    });
    expect(result.reviewRating.value).toEqual({ minSamples: 3 });
    expect(result.reportAbuse.value).toEqual({
      minReports: 5,
      dismissedRatioPercent: 80,
    });
  });

  it('trả giá trị ĐÃ chuẩn hoá — đúng thứ hệ thống đang chạy', async () => {
    const result = await new GetTrustThresholdsUseCase(
      makeRepository({
        'accuracy.giver': { minSamples: 500, reviewThresholdPercent: 60.7 },
      }) as never,
    ).handle({ actorUserId: ActorId });

    expect(result.giverAccuracy).toEqual({
      value: { minSamples: 100, reviewThresholdPercent: 60 },
      isConfigured: true,
    });
  });
});

describe('SetTrustThresholdUseCase (CMS A13)', () => {
  it('đòi config.write', async () => {
    const repository = makeRepository({}, ['config.read']);
    await expect(
      new SetTrustThresholdUseCase(repository as never).handle({
        actorUserId: ActorId,
        section: 'reviewRating',
        value: { minSamples: 4 },
        reason: 'Nâng ngưỡng công bố sao',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.publishSystemConfig).not.toHaveBeenCalled();
  });

  it('ghi JSON vào đúng khoá kèm lý do, rồi trả cả ba phần', async () => {
    const repository = makeRepository();
    const result = await new SetTrustThresholdUseCase(
      repository as never,
    ).handle({
      actorUserId: ActorId,
      section: 'reportAbuse',
      value: { minReports: 8, dismissedRatioPercent: 70 },
      reason: 'Giảm cờ oan cho người mới',
    });

    expect(repository.publishSystemConfig).toHaveBeenCalledWith({
      actorUserId: ActorId,
      key: 'report.abuse',
      value: { minReports: 8, dismissedRatioPercent: 70 },
      valueType: 'JSON',
      reason: 'Giảm cờ oan cho người mới',
    });
    expect(result.reportAbuse).toEqual({
      value: { minReports: 8, dismissedRatioPercent: 70 },
      isConfigured: true,
    });
    expect(result.giverAccuracy.isConfigured).toBe(false);
  });
});
