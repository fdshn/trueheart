import {
  IAdminRoleMatrixResult,
  ICreateAdminRoleUseCase,
  ICreateAdminRoleUseCaseCommand,
  IListAdminPermissionsCommand,
  IListAdminPermissionsResult,
  IListAdminPermissionsUseCase,
  IUpdateAdminRoleUseCase,
  IUpdateAdminRoleUseCaseCommand,
} from '@/application/contracts/admin-config';
import { AdminRoleProtectedException } from '@/domain/exceptions';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const ManagePermission = 'admin.manage';

/**
 * Role gốc do migration quản lý: quyền mới nào cũng được gắn cho nó lúc deploy.
 * Mở cho CMS sửa là mở đường tắt role gốc hoặc rút quyền khỏi người cấp quyền.
 */
const ProtectedRoleCodes: ReadonlySet<string> = new Set(['SUPER_ADMIN']);

async function assertCanManage(
  repository: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  if (!(await repository.hasPermission(actorUserId, ManagePermission)))
    throw new ForbiddenException();
}

function requireReason(reason: string | undefined): string {
  const trimmed = reason?.trim();
  if (!trimmed)
    throw new ValidationFailedException(['reason không được để trống']);
  return trimmed;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed)
    throw new ValidationFailedException(['name không được để trống']);
  return trimmed;
}

@Injectable()
export class ListAdminPermissionsUseCase implements IListAdminPermissionsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminPermissionsCommand,
  ): Promise<IListAdminPermissionsResult> {
    await assertCanManage(this.repository, command.actorUserId);
    return { permissions: await this.repository.listPermissions() };
  }
}

@Injectable()
export class CreateAdminRoleUseCase implements ICreateAdminRoleUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateAdminRoleUseCaseCommand,
  ): Promise<IAdminRoleMatrixResult> {
    await assertCanManage(this.repository, command.actorUserId);

    const { role } = command;
    const reason = requireReason(role.reason);

    await this.repository.createRole({
      actorUserId: command.actorUserId,
      code: role.code,
      name: requireName(role.name),
      permissions: [...new Set(role.permissions)],
      reason,
    });

    return { roles: await this.repository.listRoles() };
  }
}

@Injectable()
export class UpdateAdminRoleUseCase implements IUpdateAdminRoleUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateAdminRoleUseCaseCommand,
  ): Promise<IAdminRoleMatrixResult> {
    await assertCanManage(this.repository, command.actorUserId);

    if (ProtectedRoleCodes.has(command.roleCode))
      throw new AdminRoleProtectedException(command.roleCode);

    const { role } = command;
    const reason = requireReason(role.reason);

    // Không đổi gì mà vẫn ghi audit là làm nhiễu lịch sử phân quyền.
    if (
      role.name === undefined &&
      role.isActive === undefined &&
      role.permissions === undefined
    )
      throw new ValidationFailedException([
        'Cần gửi ít nhất một trong name, isActive, permissions',
      ]);

    await this.repository.updateRole({
      actorUserId: command.actorUserId,
      code: command.roleCode,
      name: role.name === undefined ? undefined : requireName(role.name),
      isActive: role.isActive,
      permissions:
        role.permissions === undefined
          ? undefined
          : [...new Set(role.permissions)],
      reason,
    });

    return { roles: await this.repository.listRoles() };
  }
}
