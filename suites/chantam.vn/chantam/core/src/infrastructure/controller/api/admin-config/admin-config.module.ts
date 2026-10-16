import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminPermissionGuard } from '../../guards';
import { AdminChatFlagController } from './admin-chat-flag.controller';
import { AdminChatController } from './admin-chat.controller';
import { AdminCommentController } from './admin-comment.controller';
import { AdminConfigController } from './admin-config.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminGroupListController } from './admin-group-list.controller';
import { AdminGroupRadiusController } from './admin-group-radius.controller';
import { AdminGroupRoleController } from './admin-group-role.controller';
import { AdminMediaController } from './admin-media.controller';
import { AdminPointAdjustController } from './admin-point-adjust.controller';
import {
  AdminPointLedgerController,
  AdminUserPointLedgerController,
} from './admin-point-ledger.controller';
import { AdminPointRuleController } from './admin-point-rule.controller';
import { AdminRankPolicyController } from './admin-rank-policy.controller';
import { AdminRoleController } from './admin-role.controller';
import { AdminTransactionController } from './admin-transaction.controller';
import { AdminTrustThresholdController } from './admin-trust-threshold.controller';
import { AdminUserController } from './admin-user.controller';
import { EntitlementPolicyController } from './entitlement-policy.controller';
import { NotificationChannelController } from './notification-channel.controller';
import { NotificationTemplateController } from './notification-template.controller';

@Module({
  controllers: [
    AdminConfigController,
    AdminChatFlagController,
    AdminMediaController,
    AdminTrustThresholdController,
    AdminGroupRadiusController,
    AdminGroupRoleController,
    // SAU hai controller trên: `GET /admin/groups/:groupId` không được đứng trước
    // `/admin/groups/radius-policy` và `/admin/groups/role-permissions`.
    AdminGroupListController,
    AdminRankPolicyController,
    AdminPointLedgerController,
    AdminUserPointLedgerController,
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
