import { Module } from '@nestjs/common';
import { AdminConfigController } from './admin-config.controller';
import { NotificationChannelController } from './notification-channel.controller';

@Module({
  controllers: [AdminConfigController, NotificationChannelController],
})
export class AdminConfigControllerModule {}
