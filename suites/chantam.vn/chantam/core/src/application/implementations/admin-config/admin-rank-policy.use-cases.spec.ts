import { IAdminConfigRepository } from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { PublishAdminRankPolicyUseCase } from './admin-rank-policy.use-cases';

const validTiers = [
  [UserRanks.VIEWER, 0, 0, 0, 0],
  [UserRanks.MEMBER, 224, 180, 0, 0],
  [UserRanks.SILVER, 672, 560, 1, 1],
  [UserRanks.GOLD, 896, 760, 2, 2],
  [UserRanks.DIAMOND, 1792, 1500, 3, 3],
].map(
  ([
    rank,
    thresholdPoints,
    warningPoints,
    requiredGifts,
    requiredReferrals,
  ]) => ({
    rank: rank as UserRanks,
    thresholdPoints: thresholdPoints as number,
    warningPoints: warningPoints as number,
    requiredGifts: requiredGifts as number,
    requiredReferrals: requiredReferrals as number,
  }),
);

function repository(): jest.Mocked<IAdminConfigRepository> {
  return {
    hasPermission: jest.fn().mockResolvedValue(true),
    publishRankPolicy: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

describe(PublishAdminRankPolicyUseCase.name, () => {
  it('publishes one valid configuration for every rank', async () => {
    const adminConfigRepository = repository();
    const useCase = new PublishAdminRankPolicyUseCase(adminConfigRepository);

    await useCase.handle({
      actorUserId: 'actor',
      rankPolicy: { changeReason: 'Điều chỉnh quý IV', tiers: validTiers },
    });

    expect(adminConfigRepository.publishRankPolicy).toHaveBeenCalledWith({
      actorUserId: 'actor',
      changeReason: 'Điều chỉnh quý IV',
      tiers: validTiers,
    });
  });

  it('rejects missing or duplicated ranks', async () => {
    const useCase = new PublishAdminRankPolicyUseCase(repository());
    const duplicated = validTiers.map((tier) => ({ ...tier }));
    duplicated[4].rank = UserRanks.GOLD;

    await expect(
      useCase.handle({
        actorUserId: 'actor',
        rankPolicy: { changeReason: 'Sai danh sách', tiers: duplicated },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('rejects non-increasing thresholds and warning above threshold', async () => {
    const useCase = new PublishAdminRankPolicyUseCase(repository());
    const invalid = validTiers.map((tier) => ({ ...tier }));
    invalid[2].thresholdPoints = 200;
    invalid[2].warningPoints = 201;

    await expect(
      useCase.handle({
        actorUserId: 'actor',
        rankPolicy: { changeReason: 'Sai ngưỡng', tiers: invalid },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});
