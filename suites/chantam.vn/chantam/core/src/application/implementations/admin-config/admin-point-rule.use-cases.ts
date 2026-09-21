import {
  IGetAdminPointRulesCommand,
  IGetAdminPointRulesResult,
  IGetAdminPointRulesUseCase,
  IPublishAdminPointRuleCommand,
  IPublishAdminPointRuleResult,
  IPublishAdminPointRuleUseCase,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetAdminPointRulesUseCase implements IGetAdminPointRulesUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAdminPointRulesCommand,
  ): Promise<IGetAdminPointRulesResult> {
    if (
      !(await this.repository.hasPermission(command.actorUserId, 'config.read'))
    )
      throw new ForbiddenException();
    return { pointRules: await this.repository.getPointRules() };
  }
}

@Injectable()
export class PublishAdminPointRuleUseCase implements IPublishAdminPointRuleUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IPublishAdminPointRuleCommand,
  ): Promise<IPublishAdminPointRuleResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        'config.write',
      ))
    )
      throw new ForbiddenException();

    const input = command.pointRule;
    const existing = (await this.repository.getPointRules()).find(
      (rule) => rule.code === input.code,
    );
    const problems = [
      !existing && `Point rule không tồn tại: ${input.code}`,
      !Number.isInteger(input.points) && 'pointRule.points phải là số nguyên',
      input.points < 0 && 'pointRule.points không được nhỏ hơn 0',
      input.dailyCap !== null &&
        (!Number.isInteger(input.dailyCap) || input.dailyCap < 0) &&
        'pointRule.dailyCap phải là số nguyên không âm hoặc null',
      input.changeReason.trim().length === 0 &&
        'pointRule.changeReason không được để trống',
    ].filter(Boolean) as string[];
    if (problems.length > 0) throw new ValidationFailedException(problems);

    return {
      pointRule: await this.repository.publishPointRule({
        actorUserId: command.actorUserId,
        changeReason: input.changeReason.trim(),
        rule: {
          code: input.code,
          points: input.points,
          enabled: input.enabled,
          affectsLifetime: input.affectsLifetime,
          dailyCap: input.dailyCap,
        },
      }),
    };
  }
}
