import { Module } from '@nestjs/common';
import { AdminReferralController } from './admin-referral.controller';
import { ReferralController } from './referral.controller';

@Module({ controllers: [ReferralController, AdminReferralController] })
export class ReferralControllerModule {}
