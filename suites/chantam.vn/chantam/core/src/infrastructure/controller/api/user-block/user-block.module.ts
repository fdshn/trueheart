import { Module } from '@nestjs/common';
import { UserBlockController } from './user-block.controller';

@Module({ controllers: [UserBlockController] })
export class UserBlockControllerModule {}
