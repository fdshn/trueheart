import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { PublishAdminMaintenancePolicyUseCase } from './admin-maintenance-policy.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function validTiers() {
  return [
    [UserRanks.VIEWER, 0, 0, 0],
    [UserRanks.MEMBER, 0, 0, 0],
    [UserRanks.SILVER, 1, 1, 50],
    [UserRanks.GOLD, 2, 2, 100],
    [UserRanks.DIAMOND, 3, 3, 200],
  ].map(([rank, gifts, referrals, penalty]) => ({
    rank: rank as UserRanks,
    maintenanceGifts: gifts as number,
    maintenanceReferrals: referrals as number,
    maintenancePenaltyPoints: penalty as number,
  }));
}

function makeRepository(granted = true) {
  return {
    hasPermission: jest.fn().mockResolvedValue(granted),
    publishMaintenancePolicy: jest
      .fn()
      .mockResolvedValue([{ rank: UserRanks.SILVER }]),
  };
}

function problemsOf(error: unknown): string[] {
  const exception = error as { message: string; explains?: string[] };
  return [exception.message, ...(exception.explains ?? [])];
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected rejection');
}

describe(PublishAdminMaintenancePolicyUseCase.name, () => {
  it('đòi config.write và không ghi gì khi thiếu quyền', async () => {
    const repository = makeRepository(false);

    await expect(
      new PublishAdminMaintenancePolicyUseCase(repository as never).handle({
        actorUserId: ActorId,
        maintenancePolicy: { changeReason: 'Quý IV', tiers: validTiers() },
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'config.write',
    );
    expect(repository.publishMaintenancePolicy).not.toHaveBeenCalled();
  });

  it('ghi lý do đã trim cùng nguyên danh sách bậc, trả rankPolicy từ repository', async () => {
    const repository = makeRepository();
    const tiers = validTiers();

    const result = await new PublishAdminMaintenancePolicyUseCase(
      repository as never,
    ).handle({
      actorUserId: ActorId,
      maintenancePolicy: { changeReason: '  Siết chỉ tiêu  ', tiers },
    });

    expect(repository.publishMaintenancePolicy).toHaveBeenCalledWith({
      actorUserId: ActorId,
      changeReason: 'Siết chỉ tiêu',
      tiers,
    });
    expect(result).toEqual({ rankPolicy: [{ rank: UserRanks.SILVER }] });
  });

  it('thiếu bậc hoặc trùng bậc đều bị từ chối', async () => {
    const repository = makeRepository();
    const useCase = new PublishAdminMaintenancePolicyUseCase(
      repository as never,
    );
    const duplicated = validTiers();
    duplicated[4].rank = UserRanks.GOLD;

    for (const tiers of [validTiers().slice(0, 4), duplicated]) {
      const error = await rejectionOf(
        useCase.handle({
          actorUserId: ActorId,
          maintenancePolicy: { changeReason: 'Sai', tiers },
        }),
      );
      expect(error).toBeInstanceOf(ValidationFailedException);
      expect(problemsOf(error)).toContain(
        'maintenancePolicy.tiers phải chứa đúng một cấu hình cho mỗi bậc',
      );
    }
    expect(repository.publishMaintenancePolicy).not.toHaveBeenCalled();
  });

  it('lý do chỉ có khoảng trắng bị từ chối', async () => {
    const repository = makeRepository();

    const error = await rejectionOf(
      new PublishAdminMaintenancePolicyUseCase(repository as never).handle({
        actorUserId: ActorId,
        maintenancePolicy: { changeReason: '   ', tiers: validTiers() },
      }),
    );

    expect(error).toBeInstanceOf(ValidationFailedException);
    expect(problemsOf(error)).toEqual([
      'maintenancePolicy.changeReason không được để trống',
    ]);
    expect(repository.publishMaintenancePolicy).not.toHaveBeenCalled();
  });

  it('chỉ tiêu âm hoặc không nguyên bị từ chối theo từng trường', async () => {
    const repository = makeRepository();
    const tiers = validTiers();
    tiers[2].maintenanceGifts = -1;
    tiers[3].maintenanceReferrals = 1.5;
    tiers[4].maintenancePenaltyPoints = Number.NaN;

    const error = await rejectionOf(
      new PublishAdminMaintenancePolicyUseCase(repository as never).handle({
        actorUserId: ActorId,
        maintenancePolicy: { changeReason: 'Sai số', tiers },
      }),
    );

    expect(error).toBeInstanceOf(ValidationFailedException);
    expect(problemsOf(error)).toEqual(
      expect.arrayContaining([
        'SILVER.maintenanceGifts phải là số nguyên không âm',
        'GOLD.maintenanceReferrals phải là số nguyên không âm',
        'DIAMOND.maintenancePenaltyPoints phải là số nguyên không âm',
      ]),
    );
    expect(repository.publishMaintenancePolicy).not.toHaveBeenCalled();
  });

  it('VIEWER và MEMBER không được có chu kỳ duy trì', async () => {
    const repository = makeRepository();
    const tiers = validTiers();
    tiers[0].maintenancePenaltyPoints = 10;
    tiers[1].maintenanceGifts = 1;
    tiers[1].maintenancePenaltyPoints = 10;

    const error = await rejectionOf(
      new PublishAdminMaintenancePolicyUseCase(repository as never).handle({
        actorUserId: ActorId,
        maintenancePolicy: { changeReason: 'Sai bậc', tiers },
      }),
    );

    expect(problemsOf(error)).toEqual([
      'VIEWER không áp dụng chu kỳ duy trì',
      'MEMBER không áp dụng chu kỳ duy trì',
    ]);
    expect(repository.publishMaintenancePolicy).not.toHaveBeenCalled();
  });

  it('có chỉ tiêu mà mức phạt bằng 0 bị từ chối', async () => {
    const repository = makeRepository();
    const tiers = validTiers();
    tiers[2].maintenancePenaltyPoints = 0;
    tiers[3].maintenanceGifts = 0;
    tiers[3].maintenancePenaltyPoints = 0;

    const error = await rejectionOf(
      new PublishAdminMaintenancePolicyUseCase(repository as never).handle({
        actorUserId: ActorId,
        maintenancePolicy: { changeReason: 'Phạt 0', tiers },
      }),
    );

    expect(problemsOf(error)).toEqual([
      'SILVER có chỉ tiêu duy trì thì maintenancePenaltyPoints phải lớn hơn 0',
      'GOLD có chỉ tiêu duy trì thì maintenancePenaltyPoints phải lớn hơn 0',
    ]);
    expect(repository.publishMaintenancePolicy).not.toHaveBeenCalled();
  });

  it('bậc không có chỉ tiêu thì được để mức phạt bằng 0', async () => {
    const repository = makeRepository();
    const tiers = validTiers();
    tiers[2].maintenanceGifts = 0;
    tiers[2].maintenanceReferrals = 0;
    tiers[2].maintenancePenaltyPoints = 0;

    await new PublishAdminMaintenancePolicyUseCase(repository as never).handle({
      actorUserId: ActorId,
      maintenancePolicy: { changeReason: 'Bỏ chu kỳ Bạc', tiers },
    });

    expect(repository.publishMaintenancePolicy).toHaveBeenCalledTimes(1);
  });

  it('lỗi trùng lặp chỉ báo một lần', async () => {
    const repository = makeRepository();
    const tiers = validTiers();
    tiers.push({ ...tiers[2], maintenanceGifts: -1 });
    tiers[2].maintenanceGifts = -1;

    const error = await rejectionOf(
      new PublishAdminMaintenancePolicyUseCase(repository as never).handle({
        actorUserId: ActorId,
        maintenancePolicy: { changeReason: 'Trùng', tiers },
      }),
    );

    const problems = problemsOf(error);
    expect(problems).toEqual([...new Set(problems)]);
    expect(
      problems.filter(
        (problem) =>
          problem === 'SILVER.maintenanceGifts phải là số nguyên không âm',
      ),
    ).toHaveLength(1);
  });
});
