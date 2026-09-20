import {
  IAssignAdminRoleUseCase,
  IChangeAdminUserStatusUseCase,
  IDeleteAdminUserUseCase,
  IGetAdminAuditLogsUseCase,
  IGetAdminConfigsUseCase,
  IGetAdminUserUseCase,
  IGetNotificationChannelsUseCase,
  IGetSystemLogsUseCase,
  IListAdminRolesUseCase,
  IListAdminUsersUseCase,
  IPublishAdminConfigUseCase,
  IUpdateNotificationChannelUseCase,
} from '@/application/contracts/admin-config';
import { Global, Module } from '@nestjs/common';
import {
  GetAdminAuditLogsUseCase,
  GetAdminConfigsUseCase,
  PublishAdminConfigUseCase,
} from './admin-config.use-cases';
import {
  AssignAdminRoleUseCase,
  ListAdminRolesUseCase,
} from './admin-role.use-cases';
import {
  ChangeAdminUserStatusUseCase,
  DeleteAdminUserUseCase,
  GetAdminUserUseCase,
  ListAdminUsersUseCase,
} from './admin-user.use-cases';
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
    { provide: IListAdminRolesUseCase, useClass: ListAdminRolesUseCase },
    { provide: IAssignAdminRoleUseCase, useClass: AssignAdminRoleUseCase },
    { provide: IListAdminUsersUseCase, useClass: ListAdminUsersUseCase },
    { provide: IGetAdminUserUseCase, useClass: GetAdminUserUseCase },
    {
      provide: IChangeAdminUserStatusUseCase,
      useClass: ChangeAdminUserStatusUseCase,
    },
    { provide: IDeleteAdminUserUseCase, useClass: DeleteAdminUserUseCase },
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
    IListAdminRolesUseCase,
    IAssignAdminRoleUseCase,
    IListAdminUsersUseCase,
    IGetAdminUserUseCase,
    IChangeAdminUserStatusUseCase,
    IDeleteAdminUserUseCase,
    IGetNotificationChannelsUseCase,
    IUpdateNotificationChannelUseCase,
  ],
})
export class AdminConfigModule {}
