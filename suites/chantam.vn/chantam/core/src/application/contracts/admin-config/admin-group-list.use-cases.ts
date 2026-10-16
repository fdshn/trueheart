import {
  IAdminGroupDetail,
  IAdminGroupListItem,
  IGroupMemberItem,
} from '@/domain/ports/repository';
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

export interface IGetAdminGroupCommand {
  readonly actorUserId: string;
  readonly groupId: string;
}

export interface IGetAdminGroupUseCase extends IUseCase<
  IGetAdminGroupCommand,
  { readonly group: IAdminGroupDetail }
> {}

export const IGetAdminGroupUseCase = Symbol('IGetAdminGroupUseCase');

export interface IListAdminGroupMembersCommand {
  readonly actorUserId: string;
  readonly groupId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface IListAdminGroupMembersResult {
  readonly members: IGroupMemberItem[];
  readonly meta: PaginationMetaDto;
}

export interface IListAdminGroupMembersUseCase extends IUseCase<
  IListAdminGroupMembersCommand,
  IListAdminGroupMembersResult
> {}

export const IListAdminGroupMembersUseCase = Symbol(
  'IListAdminGroupMembersUseCase',
);

export interface IDissolveAdminGroupCommand {
  readonly actorUserId: string;
  readonly groupId: string;
  readonly reason: string;
}

export interface IDissolveAdminGroupUseCase extends IUseCase<
  IDissolveAdminGroupCommand,
  { readonly group: IAdminGroupDetail }
> {}

export const IDissolveAdminGroupUseCase = Symbol('IDissolveAdminGroupUseCase');

export interface IRotateAdminGroupInviteCommand {
  readonly actorUserId: string;
  readonly groupId: string;
  readonly reason: string;
}

export interface IRotateAdminGroupInviteUseCase extends IUseCase<
  IRotateAdminGroupInviteCommand,
  { readonly group: IAdminGroupDetail }
> {}

export const IRotateAdminGroupInviteUseCase = Symbol(
  'IRotateAdminGroupInviteUseCase',
);
