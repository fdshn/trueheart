import { Module } from '@nestjs/common';
import {
  AdminDharmaForumController,
  DharmaForumController,
  DharmaForumPublicController,
} from './dharma-forum.controller';
import { DharmaPublicController } from './dharma-public.controller';
import { AdminDharmaController, DharmaController } from './dharma.controller';

@Module({
  controllers: [
    AdminDharmaController,
    AdminDharmaForumController,
    DharmaController,
    DharmaForumController,
    DharmaPublicController,
    DharmaForumPublicController,
  ],
})
export class DharmaControllerModule {}
