import { Module } from '@nestjs/common';
import { AdminCheckInPolicyController } from './admin-check-in-policy.controller';
import { CheckInController } from './check-in.controller';

@Module({
  controllers: [CheckInController, AdminCheckInPolicyController],
})
export class CheckInControllerModule {}
