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
  SystemConfigValueRanges,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
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

    // Payload hỏng là lỗi của dữ liệu gửi lên, không phải thiếu quyền. Trả 403
    // ở đây khiến admin đi tìm quyền bị thiếu trong khi thứ cần sửa là body.
    const { key, value, valueType } = command.systemConfig;
    const range = SystemConfigValueRanges[key];
    const problems = [
      !SupportedSystemConfigKeys.includes(key as never) &&
        `key không nằm trong danh sách cấu hình được phép: ${key}`,
      valueType !== 'INTEGER' && 'valueType hiện chỉ hỗ trợ INTEGER',
      !Number.isInteger(value) && 'value phải là số nguyên',
      Number.isInteger(value) &&
        Number(value) < 0 &&
        'value không được nhỏ hơn 0',
      // Cận cứng của tầng dưới, không phải số tuỳ chọn. Thiếu phép kiểm này thì
      // một số ngoài khoảng được lưu thành công, rồi sập ở chỗ khác — và Admin
      // không có lý do nào để nối hai việc đó với nhau.
      ...(Number.isInteger(value) &&
      range &&
      (Number(value) < range.min || Number(value) > range.max)
        ? [
            `value cho ${key} phải nằm trong khoảng ${range.min}–${range.max} (cận cứng của dữ liệu, không nới rộng bằng cấu hình)`,
          ]
        : []),
    ].filter(Boolean) as string[];
    if (problems.length > 0) throw new ValidationFailedException(problems);

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

    const { skip, take } = toSkipTake(command);
    const { entries, total } = await this.repository.getAuditLogs({
      actorUserId: command.actorFilter,
      action: command.action,
      resourceType: command.resourceType,
      from: command.from,
      to: command.to,
      skip,
      take,
    });

    return {
      logs: entries,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
