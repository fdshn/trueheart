import { Module } from '@nestjs/common';
import { AdminLunarController, LunarController } from './lunar.controller';

@Module({ controllers: [LunarController, AdminLunarController] })
export class LunarControllerModule {}
