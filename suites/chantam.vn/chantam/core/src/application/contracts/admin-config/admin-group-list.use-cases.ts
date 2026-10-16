import { IAdminGroupListItem } from '@/domain/ports/repository';
import { GroupStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IListAdminGroupsCommand {
  readonly actorUserId: string;
  readonly keyword?: string;
  readonly status?: GroupStatuses;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface IListAdminGroupsResult {
  readonly groups: IAdminGroupListItem[];
  readonly meta: PaginationMetaDto;
}

export interface IListAdminGroupsUseCase extends IUseCase<
  IListAdminGroupsCommand,
  IListAdminGroupsResult
> {}

export const IListAdminGroupsUseCase = Symbol('IListAdminGroupsUseCase');
