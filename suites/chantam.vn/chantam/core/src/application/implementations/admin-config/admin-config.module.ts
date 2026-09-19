import {
  IGetAdminAuditLogsUseCase,
  IGetAdminConfigsUseCase,
  IPublishAdminConfigUseCase,
} from '@/application/contracts/admin-config';
import { Global, Module } from '@nestjs/common';
import {
  GetAdminAuditLogsUseCase,
  GetAdminConfigsUseCase,
  PublishAdminConfigUseCase,
} from './admin-config.use-cases';

@Global()
@Module({
  providers: [
    { provide: IGetAdminConfigsUseCase, useClass: GetAdminConfigsUseCase },
    {
      provide: IPublishAdminConfigUseCase,
      useClass: PublishAdminConfigUseCase,
    },
    { provide: IGetAdminAuditLogsUseCase, useClass: GetAdminAuditLogsUseCase },
  ],
  exports: [
    IGetAdminConfigsUseCase,
    IPublishAdminConfigUseCase,
    IGetAdminAuditLogsUseCase,
  ],
})
export class AdminConfigModule {}
