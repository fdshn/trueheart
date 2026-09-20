import { IAdminRoleSummary } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListAdminRolesCommand {
  actorUserId: string;
}
export interface IListAdminRolesResult {
  roles: IAdminRoleSummary[];
}
export interface IListAdminRolesUseCase extends IUseCase<
  IListAdminRolesCommand,
  IListAdminRolesResult
> {}
export const IListAdminRolesUseCase = Symbol('IListAdminRolesUseCase');

export interface IAssignAdminRoleDto {
  roleCode: string;
  reason: string;
}

export interface IAssignAdminRoleCommand {
  actorUserId: string;
  targetUserId: string;
  assignment: IAssignAdminRoleDto;
  /** `true` là cấp, `false` là thu hồi. */
  grant: boolean;
}
export interface IAssignAdminRoleResult {
  roles: IAdminRoleSummary[];
}
export interface IAssignAdminRoleUseCase extends IUseCase<
  IAssignAdminRoleCommand,
  IAssignAdminRoleResult
> {}
export const IAssignAdminRoleUseCase = Symbol('IAssignAdminRoleUseCase');
