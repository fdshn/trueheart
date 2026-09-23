import {
  IAssignAdminRoleUseCase,
  IChangeAdminUserStatusUseCase,
  IDeleteAdminUserUseCase,
  IGetAdminAuditLogsUseCase,
  IGetAdminConfigsUseCase,
  IGetAdminPointRulesUseCase,
  IGetAdminRankPolicyUseCase,
  IGetAdminUserUseCase,
  IGetCandidateSelectionUseCase,
  IGetNotificationChannelsUseCase,
  IGetOwnAdminAccessUseCase,
  IGetSystemLogsUseCase,
  IListAdminRolesUseCase,
  IListAdminUsersUseCase,
  IPublishAdminConfigUseCase,
  IPublishAdminMaintenancePolicyUseCase,
  IPublishAdminPointRuleUseCase,
  IPublishAdminRankPolicyUseCase,
  ISetCandidateSelectionUseCase,
  IUpdateNotificationChannelUseCase,
} from '@/application/contracts/admin-config';
import { Global, Module } from '@nestjs/common';
import {
  GetAdminAuditLogsUseCase,
  GetAdminConfigsUseCase,
  PublishAdminConfigUseCase,
} from './admin-config.use-cases';
import { PublishAdminMaintenancePolicyUseCase } from './admin-maintenance-policy.use-cases';
import {
  GetAdminPointRulesUseCase,
  PublishAdminPointRuleUseCase,
} from './admin-point-rule.use-cases';
import {
  GetAdminRankPolicyUseCase,
  PublishAdminRankPolicyUseCase,
} from './admin-rank-policy.use-cases';
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
import {
  GetCandidateSelectionUseCase,
  SetCandidateSelectionUseCase,
} from './candidate-selection.use-cases';
import { GetOwnAdminAccessUseCase } from './get-own-admin-access.use-case';
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
      provide: IGetCandidateSelectionUseCase,
      useClass: GetCandidateSelectionUseCase,
    },
    {
      provide: ISetCandidateSelectionUseCase,
      useClass: SetCandidateSelectionUseCase,
    },
    {
      provide: IPublishAdminConfigUseCase,
      useClass: PublishAdminConfigUseCase,
    },
    { provide: IGetAdminAuditLogsUseCase, useClass: GetAdminAuditLogsUseCase },
    {
      provide: IGetAdminRankPolicyUseCase,
      useClass: GetAdminRankPolicyUseCase,
    },
    {
      provide: IPublishAdminRankPolicyUseCase,
      useClass: PublishAdminRankPolicyUseCase,
    },
    {
      provide: IGetAdminPointRulesUseCase,
      useClass: GetAdminPointRulesUseCase,
    },
    {
      provide: IPublishAdminPointRuleUseCase,
      useClass: PublishAdminPointRuleUseCase,
    },
    {
      provide: IPublishAdminMaintenancePolicyUseCase,
      useClass: PublishAdminMaintenancePolicyUseCase,
    },
    { provide: IGetSystemLogsUseCase, useClass: GetSystemLogsUseCase },
    {
      provide: IGetOwnAdminAccessUseCase,
      useClass: GetOwnAdminAccessUseCase,
    },
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
    IGetCandidateSelectionUseCase,
    ISetCandidateSelectionUseCase,
    IPublishAdminConfigUseCase,
    IGetAdminAuditLogsUseCase,
    IGetAdminRankPolicyUseCase,
    IPublishAdminRankPolicyUseCase,
    IGetAdminPointRulesUseCase,
    IPublishAdminPointRuleUseCase,
    IPublishAdminMaintenancePolicyUseCase,
    IGetSystemLogsUseCase,
    IGetOwnAdminAccessUseCase,
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
