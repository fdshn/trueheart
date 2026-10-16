import {
  IAdminPermissionSummary,
  IAdminRoleSummary,
} from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListAdminPermissionsCommand {
  actorUserId: string;
}
export interface IListAdminPermissionsResult {
  permissions: IAdminPermissionSummary[];
}
export interface IListAdminPermissionsUseCase extends IUseCase<
  IListAdminPermissionsCommand,
  IListAdminPermissionsResult
> {}
export const IListAdminPermissionsUseCase = Symbol(
  'IListAdminPermissionsUseCase',
);

export interface ICreateAdminRoleDto {
  code: string;
  name: string;
  permissions: string[];
  reason: string;
}
export interface ICreateAdminRoleUseCaseCommand {
  actorUserId: string;
  role: ICreateAdminRoleDto;
}
export interface IAdminRoleMatrixResult {
  roles: IAdminRoleSummary[];
}
export interface ICreateAdminRoleUseCase extends IUseCase<
  ICreateAdminRoleUseCaseCommand,
  IAdminRoleMatrixResult
> {}
export const ICreateAdminRoleUseCase = Symbol('ICreateAdminRoleUseCase');

export interface IUpdateAdminRoleDto {
  name?: string;
  isActive?: boolean;
  /** Trọn bộ quyền mới của role, không phải phần thêm/bớt. */
  permissions?: string[];
  reason: string;
}
export interface IUpdateAdminRoleUseCaseCommand {
  actorUserId: string;
  roleCode: string;
  role: IUpdateAdminRoleDto;
}
export interface IUpdateAdminRoleUseCase extends IUseCase<
  IUpdateAdminRoleUseCaseCommand,
  IAdminRoleMatrixResult
> {}
export const IUpdateAdminRoleUseCase = Symbol('IUpdateAdminRoleUseCase');
