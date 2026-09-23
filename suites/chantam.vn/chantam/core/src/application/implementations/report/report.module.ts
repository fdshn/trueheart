import {
  ICreateReportUseCase,
  IGetAdminReportUseCase,
  IListAdminReportsUseCase,
  IReviewReportUseCase,
} from '@/application/contracts/report';
import { Global, Module } from '@nestjs/common';
import {
  CreateReportUseCase,
  GetAdminReportUseCase,
  ListAdminReportsUseCase,
  ReviewReportUseCase,
} from './report.use-cases';

@Global()
@Module({
  providers: [
    { provide: ICreateReportUseCase, useClass: CreateReportUseCase },
    { provide: IListAdminReportsUseCase, useClass: ListAdminReportsUseCase },
    { provide: IGetAdminReportUseCase, useClass: GetAdminReportUseCase },
    { provide: IReviewReportUseCase, useClass: ReviewReportUseCase },
  ],
  exports: [
    ICreateReportUseCase,
    IListAdminReportsUseCase,
    IGetAdminReportUseCase,
    IReviewReportUseCase,
  ],
})
export class ReportModule {}
