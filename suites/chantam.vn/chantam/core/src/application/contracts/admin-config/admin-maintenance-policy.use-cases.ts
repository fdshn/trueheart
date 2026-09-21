import { IAdminRankTierPolicy } from '@/domain/ports/repository';
import { IPublishAdminMaintenancePolicyBodyDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IPublishAdminMaintenancePolicyCommand extends IPublishAdminMaintenancePolicyBodyDto {
  readonly actorUserId: string;
}
export interface IPublishAdminMaintenancePolicyResult {
  readonly rankPolicy: IAdminRankTierPolicy[];
}
export interface IPublishAdminMaintenancePolicyUseCase extends IUseCase<
  IPublishAdminMaintenancePolicyCommand,
  IPublishAdminMaintenancePolicyResult
> {}
export const IPublishAdminMaintenancePolicyUseCase = Symbol(
  'IPublishAdminMaintenancePolicyUseCase',
);
