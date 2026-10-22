import { Module } from '@nestjs/common';
import {
  AdminDharmaForumController,
  DharmaForumController,
  DharmaForumPublicController,
} from './dharma-forum.controller';
import { DharmaPublicController } from './dharma-public.controller';
import { DharmaThreadInteractionController } from './dharma-thread-interaction.controller';
import { AdminDharmaController, DharmaController } from './dharma.controller';

@Module({
  controllers: [
    AdminDharmaController,
    AdminDharmaForumController,
    DharmaController,
    DharmaForumController,
    DharmaPublicController,
    DharmaForumPublicController,
    DharmaThreadInteractionController,
  ],
})
export class DharmaControllerModule {}
