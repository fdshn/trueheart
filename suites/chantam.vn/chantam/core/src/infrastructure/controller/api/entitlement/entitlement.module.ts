import { Module } from '@nestjs/common';
import { EntitlementController } from './entitlement.controller';

@Module({ controllers: [EntitlementController] })
export class EntitlementControllerModule {}
