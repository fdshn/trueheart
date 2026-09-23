import { IAdminConfigRepository } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { PublishAdminPointRuleUseCase } from './admin-point-rule.use-cases';

const currentRule = {
  code: 'REFERRAL_QUALIFIED',
  points: 56,
  enabled: true,
  affectsLifetime: true,
  dailyCap: 3,
  version: 1,
  updatedAt: new Date(),
};

function repository(): jest.Mocked<IAdminConfigRepository> {
  return {
    hasPermission: jest.fn().mockResolvedValue(true),
    getPointRules: jest.fn().mockResolvedValue([currentRule]),
    publishPointRule: jest.fn().mockResolvedValue(currentRule),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

describe(PublishAdminPointRuleUseCase.name, () => {
  it('publishes a new version for an existing rule', async () => {
    const adminConfigRepository = repository();
    const useCase = new PublishAdminPointRuleUseCase(adminConfigRepository);
    await useCase.handle({
      actorUserId: 'actor',
      pointRule: {
        code: currentRule.code,
        points: 60,
        enabled: true,
        affectsLifetime: true,
        dailyCap: 4,
        changeReason: 'Điều chỉnh quý IV',
      },
    });
    expect(adminConfigRepository.publishPointRule).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'actor',
        changeReason: 'Điều chỉnh quý IV',
      }),
    );
  });

  it('rejects unknown rules', async () => {
    const useCase = new PublishAdminPointRuleUseCase(repository());
    await expect(
      useCase.handle({
        actorUserId: 'actor',
        pointRule: {
          code: 'UNKNOWN',
          points: 1,
          enabled: true,
          affectsLifetime: true,
          dailyCap: null,
          changeReason: 'Không hợp lệ',
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});
