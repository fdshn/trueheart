import { IAdminRankTierPolicy } from '@/domain/ports/repository';
import { IPublishAdminRankPolicyBodyDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetAdminRankPolicyCommand {
  readonly actorUserId: string;
}

export interface IGetAdminRankPolicyResult {
  readonly rankPolicy: IAdminRankTierPolicy[];
}

export interface IGetAdminRankPolicyUseCase extends IUseCase<
  IGetAdminRankPolicyCommand,
  IGetAdminRankPolicyResult
> {}
export const IGetAdminRankPolicyUseCase = Symbol('IGetAdminRankPolicyUseCase');

export interface IPublishAdminRankPolicyCommand extends IPublishAdminRankPolicyBodyDto {
  readonly actorUserId: string;
}

export interface IPublishAdminRankPolicyResult extends IGetAdminRankPolicyResult {}

export interface IPublishAdminRankPolicyUseCase extends IUseCase<
  IPublishAdminRankPolicyCommand,
  IPublishAdminRankPolicyResult
> {}
export const IPublishAdminRankPolicyUseCase = Symbol(
  'IPublishAdminRankPolicyUseCase',
);
