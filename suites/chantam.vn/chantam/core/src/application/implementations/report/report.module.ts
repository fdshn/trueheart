import {
  ICreateReportUseCase,
  IGetAdminReportUseCase,
  IListAdminReportsUseCase,
  IListReporterStatsUseCase,
  IReviewReportUseCase,
} from '@/application/contracts/report';
import { Global, Module } from '@nestjs/common';
import {
  CreateReportUseCase,
  GetAdminReportUseCase,
  ListAdminReportsUseCase,
  ListReporterStatsUseCase,
  ReviewReportUseCase,
} from './report.use-cases';

@Global()
@Module({
  providers: [
    { provide: ICreateReportUseCase, useClass: CreateReportUseCase },
    { provide: IListAdminReportsUseCase, useClass: ListAdminReportsUseCase },
    { provide: IGetAdminReportUseCase, useClass: GetAdminReportUseCase },
    { provide: IReviewReportUseCase, useClass: ReviewReportUseCase },
    {
      provide: IListReporterStatsUseCase,
      useClass: ListReporterStatsUseCase,
    },
  ],
  exports: [
    ICreateReportUseCase,
    IListAdminReportsUseCase,
    IGetAdminReportUseCase,
    IReviewReportUseCase,
    IListReporterStatsUseCase,
  ],
})
export class ReportModule {}
