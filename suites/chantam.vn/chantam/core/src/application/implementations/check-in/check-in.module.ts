import {
  IGetCheckInHistoryUseCase,
  IGetCheckInPolicyUseCase,
  IGetCheckInStateUseCase,
  IPublishCheckInPolicyUseCase,
  IRecordCheckInUseCase,
  IRepairCheckInUseCase,
} from '@/application/contracts/check-in';
import { Global, Module } from '@nestjs/common';
import {
  GetCheckInPolicyUseCase,
  PublishCheckInPolicyUseCase,
} from './admin-check-in-policy.use-cases';
import {
  GetCheckInHistoryUseCase,
  GetCheckInStateUseCase,
  RecordCheckInUseCase,
  RepairCheckInUseCase,
} from './check-in.use-cases';

@Global()
@Module({
  providers: [
    { provide: IGetCheckInStateUseCase, useClass: GetCheckInStateUseCase },
    { provide: IGetCheckInHistoryUseCase, useClass: GetCheckInHistoryUseCase },
    { provide: IRecordCheckInUseCase, useClass: RecordCheckInUseCase },
    { provide: IRepairCheckInUseCase, useClass: RepairCheckInUseCase },
    { provide: IGetCheckInPolicyUseCase, useClass: GetCheckInPolicyUseCase },
    {
      provide: IPublishCheckInPolicyUseCase,
      useClass: PublishCheckInPolicyUseCase,
    },
  ],
  exports: [
    IGetCheckInStateUseCase,
    IGetCheckInHistoryUseCase,
    IRecordCheckInUseCase,
    IRepairCheckInUseCase,
    IGetCheckInPolicyUseCase,
    IPublishCheckInPolicyUseCase,
  ],
})
export class CheckInModule {}
