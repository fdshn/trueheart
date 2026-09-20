import {
  IAssignAdminRoleCommand,
  IAssignAdminRoleResult,
  IAssignAdminRoleUseCase,
  IListAdminRolesCommand,
  IListAdminRolesResult,
  IListAdminRolesUseCase,
} from '@/application/contracts/admin-config';
import { SelfRoleChangeException } from '@/domain/exceptions';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const ManagePermission = 'admin.manage';

@Injectable()
export class ListAdminRolesUseCase implements IListAdminRolesUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminRolesCommand,
  ): Promise<IListAdminRolesResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        ManagePermission,
      ))
    )
      throw new ForbiddenException();

    return { roles: await this.repository.listRoles() };
  }
}

@Injectable()
export class AssignAdminRoleUseCase implements IAssignAdminRoleUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IAssignAdminRoleCommand,
  ): Promise<IAssignAdminRoleResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        ManagePermission,
      ))
    )
      throw new ForbiddenException();

    // Tự sửa quyền của chính mình là đường nâng quyền và cũng là đường tự khoá
    // mình ra ngoài. Cả hai chiều đều phải đi qua một admin khác.
    if (command.actorUserId === command.targetUserId)
      throw new SelfRoleChangeException();

    const { roleCode, reason } = command.assignment;
    if (!reason?.trim())
      throw new ValidationFailedException(['reason không được để trống']);

    const assignment = {
      actorUserId: command.actorUserId,
      targetUserId: command.targetUserId,
      roleCode,
      reason: reason.trim(),
    };

    if (command.grant) await this.repository.grantRole(assignment);
    else await this.repository.revokeRole(assignment);

    return { roles: await this.repository.listRoles() };
  }
}
