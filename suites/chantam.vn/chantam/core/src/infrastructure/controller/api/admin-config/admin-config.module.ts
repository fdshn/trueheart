import { Module } from '@nestjs/common';
import { AdminConfigController } from './admin-config.controller';

@Module({ controllers: [AdminConfigController] })
export class AdminConfigControllerModule {}
