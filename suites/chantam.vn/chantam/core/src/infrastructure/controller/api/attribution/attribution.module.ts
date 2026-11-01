import { Module } from '@nestjs/common';
import {
  AdminAttributionController,
  AttributionController,
} from './attribution.controller';

@Module({ controllers: [AttributionController, AdminAttributionController] })
export class AttributionControllerModule {}
