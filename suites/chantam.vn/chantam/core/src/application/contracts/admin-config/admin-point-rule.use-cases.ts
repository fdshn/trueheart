import { IAdminPointRule } from '@/domain/ports/repository';
import { IPublishAdminPointRuleBodyDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetAdminPointRulesCommand {
  readonly actorUserId: string;
}
export interface IGetAdminPointRulesResult {
  readonly pointRules: IAdminPointRule[];
}
export interface IGetAdminPointRulesUseCase extends IUseCase<
  IGetAdminPointRulesCommand,
  IGetAdminPointRulesResult
> {}
export const IGetAdminPointRulesUseCase = Symbol('IGetAdminPointRulesUseCase');

export interface IPublishAdminPointRuleCommand extends IPublishAdminPointRuleBodyDto {
  readonly actorUserId: string;
}
export interface IPublishAdminPointRuleResult {
  readonly pointRule: IAdminPointRule;
}
export interface IPublishAdminPointRuleUseCase extends IUseCase<
  IPublishAdminPointRuleCommand,
  IPublishAdminPointRuleResult
> {}
export const IPublishAdminPointRuleUseCase = Symbol(
  'IPublishAdminPointRuleUseCase',
);
