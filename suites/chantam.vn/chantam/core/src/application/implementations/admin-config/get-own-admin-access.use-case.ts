import {
  IGetOwnAdminAccessCommand,
  IGetOwnAdminAccessResult,
  IGetOwnAdminAccessUseCase,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetOwnAdminAccessUseCase implements IGetOwnAdminAccessUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetOwnAdminAccessCommand,
  ): Promise<IGetOwnAdminAccessResult> {
    const access = await this.repository.getAccess(command.actorUserId);
    if (!access.permissions.includes('admin.access'))
      throw new ForbiddenException();

    return {
      userId: command.actorUserId,
      username: command.username,
      ...access,
    };
  }
}
