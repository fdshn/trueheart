import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminPermissionGuard } from '../../guards';
import { AdminChatFlagController } from './admin-chat-flag.controller';
import { AdminChatController } from './admin-chat.controller';
import { AdminCommentController } from './admin-comment.controller';
import { AdminConfigController } from './admin-config.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminGroupRadiusController } from './admin-group-radius.controller';
import { AdminGroupRoleController } from './admin-group-role.controller';
import { AdminPointAdjustController } from './admin-point-adjust.controller';
import { AdminPointLedgerController } from './admin-point-ledger.controller';
import { AdminPointRuleController } from './admin-point-rule.controller';
import { AdminRankPolicyController } from './admin-rank-policy.controller';
import { AdminRoleController } from './admin-role.controller';
import { AdminTransactionController } from './admin-transaction.controller';
import { AdminUserController } from './admin-user.controller';
import { EntitlementPolicyController } from './entitlement-policy.controller';
import { NotificationChannelController } from './notification-channel.controller';
import { NotificationTemplateController } from './notification-template.controller';

@Module({
  controllers: [
    AdminConfigController,
    AdminChatFlagController,
    AdminGroupRadiusController,
    AdminGroupRoleController,
    AdminRankPolicyController,
    AdminPointLedgerController,
    AdminPointAdjustController,
    NotificationTemplateController,
    AdminPointRuleController,
    AdminRoleController,
    AdminUserController,
    AdminChatController,
    AdminDashboardController,
    AdminCommentController,
    AdminTransactionController,
    EntitlementPolicyController,
    NotificationChannelController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AdminPermissionGuard }],
})
export class AdminConfigControllerModule {}
