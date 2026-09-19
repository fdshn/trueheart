import {
  IGetAdminAuditLogsCommand,
  IGetAdminAuditLogsResult,
  IGetAdminAuditLogsUseCase,
  IGetAdminConfigsCommand,
  IGetAdminConfigsResult,
  IGetAdminConfigsUseCase,
  IPublishAdminConfigCommand,
  IPublishAdminConfigResult,
  IPublishAdminConfigUseCase,
  SupportedSystemConfigKeys,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetAdminConfigsUseCase implements IGetAdminConfigsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAdminConfigsCommand,
  ): Promise<IGetAdminConfigsResult> {
    if (
      !(await this.repository.hasPermission(command.actorUserId, 'config.read'))
    )
      throw new ForbiddenException();
    return { configs: await this.repository.getPublishedConfigs() };
  }
}

@Injectable()
export class PublishAdminConfigUseCase implements IPublishAdminConfigUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IPublishAdminConfigCommand,
  ): Promise<IPublishAdminConfigResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        'config.write',
      ))
    )
      throw new ForbiddenException();
    if (!SupportedSystemConfigKeys.includes(command.systemConfig.key as never))
      throw new ForbiddenException();
    if (
      command.systemConfig.valueType !== 'INTEGER' ||
      !Number.isInteger(command.systemConfig.value) ||
      Number(command.systemConfig.value) < 0
    )
      throw new ForbiddenException();
    return {
      config: await this.repository.publishSystemConfig({
        actorUserId: command.actorUserId,
        ...command.systemConfig,
      }),
    };
  }
}

@Injectable()
export class GetAdminAuditLogsUseCase implements IGetAdminAuditLogsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAdminAuditLogsCommand,
  ): Promise<IGetAdminAuditLogsResult> {
    if (
      !(await this.repository.hasPermission(command.actorUserId, 'audit.read'))
    )
      throw new ForbiddenException();
    return { logs: await this.repository.getAuditLogs(command.limit) };
  }
}
