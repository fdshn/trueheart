import {
  IGetAdminAuditLogsUseCase,
  IGetAdminConfigsUseCase,
  IGetNotificationChannelsUseCase,
  IGetSystemLogsUseCase,
  IPublishAdminConfigUseCase,
  IUpdateNotificationChannelUseCase,
} from '@/application/contracts/admin-config';
import { Global, Module } from '@nestjs/common';
import {
  GetAdminAuditLogsUseCase,
  GetAdminConfigsUseCase,
  PublishAdminConfigUseCase,
} from './admin-config.use-cases';
import { GetSystemLogsUseCase } from './get-system-logs.use-case';
import {
  GetNotificationChannelsUseCase,
  UpdateNotificationChannelUseCase,
} from './notification-channel.use-cases';

@Global()
@Module({
  providers: [
    { provide: IGetAdminConfigsUseCase, useClass: GetAdminConfigsUseCase },
    {
      provide: IPublishAdminConfigUseCase,
      useClass: PublishAdminConfigUseCase,
    },
    { provide: IGetAdminAuditLogsUseCase, useClass: GetAdminAuditLogsUseCase },
    { provide: IGetSystemLogsUseCase, useClass: GetSystemLogsUseCase },
    {
      provide: IGetNotificationChannelsUseCase,
      useClass: GetNotificationChannelsUseCase,
    },
    {
      provide: IUpdateNotificationChannelUseCase,
      useClass: UpdateNotificationChannelUseCase,
    },
  ],
  exports: [
    IGetAdminConfigsUseCase,
    IPublishAdminConfigUseCase,
    IGetAdminAuditLogsUseCase,
    IGetSystemLogsUseCase,
    IGetNotificationChannelsUseCase,
    IUpdateNotificationChannelUseCase,
  ],
})
export class AdminConfigModule {}
