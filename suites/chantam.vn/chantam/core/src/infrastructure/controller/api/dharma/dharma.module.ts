import { Module } from '@nestjs/common';
import { DharmaPublicController } from './dharma-public.controller';
import { AdminDharmaController, DharmaController } from './dharma.controller';

@Module({
  controllers: [
    AdminDharmaController,
    DharmaController,
    DharmaPublicController,
  ],
})
export class DharmaControllerModule {}
