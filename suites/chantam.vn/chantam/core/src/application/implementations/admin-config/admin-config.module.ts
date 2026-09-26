import {
  IAssignAdminRoleUseCase,
  IChangeAdminUserStatusUseCase,
  ICountPendingAdminCommentsUseCase,
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
  IListAdminCommentsUseCase,
  IListAdminRolesUseCase,
  IListAdminUsersUseCase,
  IListNotificationTemplatesUseCase,
  IModerateAdminCommentUseCase,
  IPublishAdminConfigUseCase,
  IPublishAdminMaintenancePolicyUseCase,
  IPublishAdminPointRuleUseCase,
  IPublishAdminRankPolicyUseCase,
  IReleaseVerifiedPhoneUseCase,
  ISetCandidateSelectionUseCase,
  IUpdateNotificationChannelUseCase,
  IUpdateNotificationTemplateUseCase,
} from '@/application/contracts/admin-config';
import { Global, Module } from '@nestjs/common';
import {
  CountPendingAdminCommentsUseCase,
  ListAdminCommentsUseCase,
  ModerateAdminCommentUseCase,
} from './admin-comment.use-cases';
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
  ReleaseVerifiedPhoneUseCase,
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

import {
  ListNotificationTemplatesUseCase,
  UpdateNotificationTemplateUseCase,
} from './notification-template.use-cases';

@Global()
@Module({
  providers: [
    {
      provide: IListNotificationTemplatesUseCase,
      useClass: ListNotificationTemplatesUseCase,
    },
    {
      provide: IUpdateNotificationTemplateUseCase,
      useClass: UpdateNotificationTemplateUseCase,
    },
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
      provide: ICountPendingAdminCommentsUseCase,
      useClass: CountPendingAdminCommentsUseCase,
    },
    {
      provide: IListAdminCommentsUseCase,
      useClass: ListAdminCommentsUseCase,
    },
    {
      provide: IModerateAdminCommentUseCase,
      useClass: ModerateAdminCommentUseCase,
    },
    {
      provide: IReleaseVerifiedPhoneUseCase,
      useClass: ReleaseVerifiedPhoneUseCase,
    },
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
    IListNotificationTemplatesUseCase,
    IUpdateNotificationTemplateUseCase,
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
    IReleaseVerifiedPhoneUseCase,
    ICountPendingAdminCommentsUseCase,
    IListAdminCommentsUseCase,
    IModerateAdminCommentUseCase,
    IGetNotificationChannelsUseCase,
    IUpdateNotificationChannelUseCase,
  ],
})
export class AdminConfigModule {}
