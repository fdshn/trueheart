import { Module } from '@nestjs/common';
import { AdminReportController } from './admin-report.controller';
import { ReportController } from './report.controller';

@Module({ controllers: [ReportController, AdminReportController] })
export class ReportControllerModule {}
