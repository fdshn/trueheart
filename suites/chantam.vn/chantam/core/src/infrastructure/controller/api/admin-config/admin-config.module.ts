import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminPermissionGuard } from '../../guards';
import { AdminConfigController } from './admin-config.controller';
import { AdminPointLedgerController } from './admin-point-ledger.controller';
import { AdminPointRuleController } from './admin-point-rule.controller';
import { AdminRankPolicyController } from './admin-rank-policy.controller';
import { AdminRoleController } from './admin-role.controller';
import { AdminUserController } from './admin-user.controller';
import { EntitlementPolicyController } from './entitlement-policy.controller';
import { NotificationChannelController } from './notification-channel.controller';

@Module({
  controllers: [
    AdminConfigController,
    AdminRankPolicyController,
    AdminPointLedgerController,
    AdminPointRuleController,
    AdminRoleController,
    AdminUserController,
    EntitlementPolicyController,
    NotificationChannelController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AdminPermissionGuard }],
})
export class AdminConfigControllerModule {}
