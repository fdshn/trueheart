import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminPermissionGuard } from '../../guards';
import { AdminConfigController } from './admin-config.controller';
import { AdminRoleController } from './admin-role.controller';
import { AdminUserController } from './admin-user.controller';
import { NotificationChannelController } from './notification-channel.controller';

@Module({
  controllers: [
    AdminConfigController,
    AdminRoleController,
    AdminUserController,
    NotificationChannelController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AdminPermissionGuard }],
})
export class AdminConfigControllerModule {}
