import {
  IAdminGroupDetail,
  IAdminGroupListItem,
  IGroupMemberItem,
} from '@/domain/ports/repository';
import { GroupStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';
import { IGroupInviteLink } from '../group';

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

/** Chi tiết nhóm cho CMS, kèm link mời đầy đủ để Admin gửi lại cho Owner. */
export type IAdminGroupDetailResult = IAdminGroupDetail & IGroupInviteLink;

export interface IGetAdminGroupCommand {
  readonly actorUserId: string;
  readonly groupId: string;
}

export interface IGetAdminGroupUseCase extends IUseCase<
  IGetAdminGroupCommand,
  { readonly group: IAdminGroupDetailResult }
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
  { readonly group: IAdminGroupDetailResult }
> {}

export const IDissolveAdminGroupUseCase = Symbol('IDissolveAdminGroupUseCase');

export interface IRotateAdminGroupInviteCommand {
  readonly actorUserId: string;
  readonly groupId: string;
  readonly reason: string;
}

export interface IRotateAdminGroupInviteUseCase extends IUseCase<
  IRotateAdminGroupInviteCommand,
  { readonly group: IAdminGroupDetailResult }
> {}

export const IRotateAdminGroupInviteUseCase = Symbol(
  'IRotateAdminGroupInviteUseCase',
);
