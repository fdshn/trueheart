import {
  IGetAdminReportUseCase,
  IListAdminReportsUseCase,
  IReviewReportUseCase,
} from '@/application/contracts/report';
import {
  ReportInvalidStateException,
  ReportNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminReportParamsDto,
  GetAdminReportResponseDto,
  ListAdminReportsQueryDto,
  ListAdminReportsResponseDto,
  ReviewReportBodyDto,
  ReviewReportResponseDto,
} from '../../dto/report/report.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Báo cáo vi phạm')
@ApiBearerAuth()
@Controller('admin/reports')
export class AdminReportController {
  public constructor(
    @Inject(IListAdminReportsUseCase)
    private readonly listAdminReportsUseCase: IListAdminReportsUseCase,
    @Inject(IGetAdminReportUseCase)
    private readonly getAdminReportUseCase: IGetAdminReportUseCase,
    @Inject(IReviewReportUseCase)
    private readonly reviewReportUseCase: IReviewReportUseCase,
  ) {}

  @Get()
  @RequiresPermission('report.read')
  @ApiOperation({ summary: 'Hàng đợi báo cáo vi phạm' })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminReportsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listAdminReports(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminReportsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listAdminReportsUseCase.handle({
          actorUserId: principal.userId,
          ...query,
        }),
      )
      .build();
  }

  @Get(':reportId')
  @RequiresPermission('report.read')
  @ApiOperation({ summary: 'Chi tiết report và bằng chứng' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAdminReportResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ReportNotFoundException],
  )
  public async getAdminReport(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminReportParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminReportUseCase.handle({
          actorUserId: principal.userId,
          reportId: params.reportId,
        }),
      )
      .build();
  }

  @Patch(':reportId/review')
  @RequiresPermission('report.resolve')
  @ApiOperation({ summary: 'Kết luận hoặc bác bỏ report, có audit' })
  @ApiOkResponse({ type: ResponseDto.forApi(ReviewReportResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ReportNotFoundException],
    [ReportInvalidStateException],
  )
  public async reviewReport(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminReportParamsDto,
    @Body() body: ReviewReportBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.reviewReportUseCase.handle({
          actorUserId: principal.userId,
          reportId: params.reportId,
          ...body,
        }),
      )
      .build();
  }
}
