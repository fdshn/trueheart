import { Module } from '@nestjs/common';
import { AdminBroadcastController } from './admin-broadcast.controller';
import { NotificationController } from './notification.controller';

@Module({ controllers: [NotificationController, AdminBroadcastController] })
export class NotificationControllerModule {}
