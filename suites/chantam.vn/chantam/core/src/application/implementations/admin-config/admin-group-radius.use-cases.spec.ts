import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  GetGroupRadiusPolicyUseCase,
  PublishGroupRadiusPolicyUseCase,
} from './admin-group-radius.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const Reason = 'Bên A chốt thang bán kính, ngày 30/09';

/** Đúng thang đang seed: 3/5/7/10 km. */
const Seeded: Record<string, number> = {
  'group.default_radius_meters': 10_000,
  'group.min_radius_meters': 1_000,
  'group.max_radius_meters': 50_000,
  'group.radius_meters.member': 3_000,
  'group.radius_meters.silver': 5_000,
  'group.radius_meters.gold': 7_000,
  'group.radius_meters.diamond': 10_000,
};

function makeDeps(options: {
  granted: string[];
  values?: Record<string, number | null>;
}) {
  const values = { ...Seeded, ...(options.values ?? {}) };

  return {
    configs: {
      hasPermission: jest.fn(async (_id: string, code: string) =>
        options.granted.includes(code),
      ),
      getConfigValue: jest.fn(async (key: string) => values[key] ?? null),
      publishSystemConfig: jest.fn(async () => ({}) as never),
    },
    entitlements: {
      getPolicyRevision: jest.fn(async () => ({
        revisionId: 1,
        effectiveFrom: new Date(),
        changeReason: null,
        capabilities: [
          {
            code: 'CREATE_GROUP',
            enabled: true,
            ranks: [
              { rank: UserRanks.MEMBER, allowed: false, limit: null },
              { rank: UserRanks.SILVER, allowed: false, limit: null },
              { rank: UserRanks.GOLD, allowed: false, limit: null },
              { rank: UserRanks.DIAMOND, allowed: true, limit: null },
            ],
          },
        ],
      })),
    },
  };
}

const publish = (deps: ReturnType<typeof makeDeps>) =>
  new PublishGroupRadiusPolicyUseCase(
    deps.configs as never,
    deps.entitlements as never,
  );

describe('GetGroupRadiusPolicyUseCase', () => {
  it('đòi config.read', async () => {
    const deps = makeDeps({ granted: [] });

    await expect(
      new GetGroupRadiusPolicyUseCase(
        deps.configs as never,
        deps.entitlements as never,
      ).handle({ actorUserId: ActorId }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('trả cả thang, đánh dấu bậc thừa hưởng và bậc tạo được nhóm', async () => {
    const deps = makeDeps({
      granted: ['config.read'],
      values: { 'group.radius_meters.silver': null },
    });
    const { radiusPolicy } = await new GetGroupRadiusPolicyUseCase(
      deps.configs as never,
      deps.entitlements as never,
    ).handle({ actorUserId: ActorId });

    const silver = radiusPolicy.ladder.find(
      (rung) => rung.rank === UserRanks.SILVER,
    );
    // Bậc chưa có số riêng thì thừa hưởng mặc định, KHÔNG về 0 — 0 km là vùng
    // rỗng và làm điều kiện địa lý của affiliate tắt lặng lẽ.
    expect(silver).toEqual(
      expect.objectContaining({ meters: 10_000, inherited: true }),
    );

    // Hôm nay chỉ Kim Cương tạo được nhóm; ba bậc dưới là số chờ sẵn.
    expect(
      radiusPolicy.ladder
        .filter((rung) => rung.canCreateGroup)
        .map((r) => r.rank),
    ).toEqual([UserRanks.DIAMOND]);

    expect(radiusPolicy.columnBoundsMeters).toEqual({
      min: 1_000,
      max: 50_000,
    });
  });
});

describe('PublishGroupRadiusPolicyUseCase', () => {
  it('đòi config.write', async () => {
    const deps = makeDeps({ granted: ['config.read'] });

    await expect(
      publish(deps).handle({
        actorUserId: ActorId,
        radiusPolicy: { ladder: [], reason: Reason },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('TỪ CHỐI thang nghịch — bậc cao mà vùng hẹp hơn bậc thấp', async () => {
    // Đây là lý do chính endpoint này tồn tại: ghi từng khoá qua
    // POST /admin/system-configs không có gì để so với ba bậc kia.
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      publish(deps).handle({
        actorUserId: ActorId,
        radiusPolicy: {
          ladder: [{ rank: UserRanks.GOLD, meters: 3_000 }],
          reason: Reason,
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(deps.configs.publishSystemConfig).not.toHaveBeenCalled();
  });

  it('kiểm đơn điệu trên thang ĐÃ TRỘN, không chỉ phần gửi lên', async () => {
    // Gửi một bậc duy nhất và nó hợp lệ tự thân (5000 nằm giữa 1000 và 50000),
    // nhưng nó phá quan hệ với bậc Vàng đang là 7000.
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      publish(deps).handle({
        actorUserId: ActorId,
        radiusPolicy: {
          ladder: [{ rank: UserRanks.DIAMOND, meters: 5_000 }],
          reason: Reason,
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('nhận thang đi lên', async () => {
    const deps = makeDeps({ granted: ['config.write'] });
    await publish(deps).handle({
      actorUserId: ActorId,
      radiusPolicy: {
        ladder: [
          { rank: UserRanks.GOLD, meters: 8_000 },
          { rank: UserRanks.DIAMOND, meters: 12_000 },
        ],
        reason: Reason,
      },
    });

    expect(deps.configs.publishSystemConfig).toHaveBeenCalledTimes(2);
  });

  it('TỪ CHỐI giá trị ngoài cận cứng của cột', async () => {
    // Cột có CHECK (radius_km BETWEEN 1 AND 50); 60000 m làm database từ chối ghi.
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      publish(deps).handle({
        actorUserId: ActorId,
        radiusPolicy: {
          ladder: [{ rank: UserRanks.DIAMOND, meters: 60_000 }],
          reason: Reason,
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('TỪ CHỐI bậc VIEWER', async () => {
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      publish(deps).handle({
        actorUserId: ActorId,
        radiusPolicy: {
          ladder: [{ rank: UserRanks.VIEWER, meters: 2_000 }],
          reason: Reason,
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('TỪ CHỐI lý do quá ngắn — audit log không có gì để đọc', async () => {
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      publish(deps).handle({
        actorUserId: ActorId,
        radiusPolicy: {
          ladder: [{ rank: UserRanks.DIAMOND, meters: 11_000 }],
          reason: 'sửa',
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('đổi defaultMeters kéo theo bậc đang THỪA HƯỞNG, và vẫn canh đơn điệu', async () => {
    // Bạc thừa hưởng mặc định. Hạ mặc định xuống 2000 làm Bạc thành 2000 — thấp
    // hơn Thành viên 3000, tức thang nghịch dù Admin không hề gửi bậc nào.
    const deps = makeDeps({
      granted: ['config.write'],
      values: { 'group.radius_meters.silver': null },
    });

    await expect(
      publish(deps).handle({
        actorUserId: ActorId,
        radiusPolicy: { defaultMeters: 2_000, ladder: [], reason: Reason },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });
});
