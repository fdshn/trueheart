import { Module } from '@nestjs/common';
import { AdminAffiliateController } from './admin-affiliate.controller';

@Module({ controllers: [AdminAffiliateController] })
export class AffiliateControllerModule {}
