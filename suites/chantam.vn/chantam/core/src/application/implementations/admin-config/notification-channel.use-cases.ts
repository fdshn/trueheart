import {
  IGetNotificationChannelsCommand,
  IGetNotificationChannelsResult,
  IGetNotificationChannelsUseCase,
  IUpdateNotificationChannelResult,
  IUpdateNotificationChannelUseCase,
  IUpdateNotificationChannelUseCaseCommand,
} from '@/application/contracts/admin-config';
import {
  IAdminConfigRepository,
  INotificationChannelRepository,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const ManagePermission = 'notification.manage';

@Injectable()
export class GetNotificationChannelsUseCase implements IGetNotificationChannelsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(INotificationChannelRepository)
    private readonly channels: INotificationChannelRepository,
  ) {}

  public async handle(
    command: IGetNotificationChannelsCommand,
  ): Promise<IGetNotificationChannelsResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        ManagePermission,
      ))
    )
      throw new ForbiddenException();

    return { channels: await this.channels.list() };
  }
}

@Injectable()
export class UpdateNotificationChannelUseCase implements IUpdateNotificationChannelUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(INotificationChannelRepository)
    private readonly channels: INotificationChannelRepository,
  ) {}

  public async handle(
    command: IUpdateNotificationChannelUseCaseCommand,
  ): Promise<IUpdateNotificationChannelResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        ManagePermission,
      ))
    )
      throw new ForbiddenException();

    const { reason, ...changes } = command.channelConfig;

    // Audit không có lý do thì sáu tháng sau không ai biết vì sao kênh bị tắt.
    if (!reason?.trim())
      throw new ValidationFailedException(['reason không được để trống']);

    return {
      channel: await this.channels.update({
        actorUserId: command.actorUserId,
        channel: command.channel,
        reason: reason.trim(),
        ...changes,
      }),
    };
  }
}
