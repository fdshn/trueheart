import {
  IGetAdminReportUseCase,
  IListAdminReportsUseCase,
  IListReporterStatsUseCase,
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
  ListReporterStatsQueryDto,
  ListReporterStatsResponseDto,
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
    @Inject(IListReporterStatsUseCase)
    private readonly listReporterStatsUseCase: IListReporterStatsUseCase,
  ) {}

  // Đặt TRƯỚC `@Get(':reportId')`: Nest khớp route theo thứ tự khai, nên để sau
  // thì `reporters` sẽ bị nuốt làm một `reportId` và trả 400 vì không phải UUID.
  @Get('reporters')
  @RequiresPermission('report.read')
  @ApiOperation({
    summary: 'Ai đang báo xấu bừa',
    description:
      'Tỷ lệ bị BÁC của từng người báo, xếp giảm dần. Ngưỡng ở cấu hình động `report.abuse` (mặc định: từ 5 lượt đã có kết luận, bị bác ≥ 80%). ' +
      'Chỉ đếm những lượt ĐÃ có kết luận: một người vừa gửi 20 báo còn đang chờ xử lý không phải người báo bừa, họ chỉ là người đang chờ. ' +
      '**KHÔNG tự động phạt** — danh sách này chỉ đưa hồ sơ lên bàn Admin, y như cờ Giver Accuracy. Một người báo sai nhiều có thể là người hiểu sai luật chứ không phải người xấu, và phân biệt hai cái là việc của con người. ' +
      'Tính SỐNG từ bảng `reports`, không lưu thành cột: chỉ Admin đọc nên không có áp lực hiệu năng, mà lưu sẵn thì kéo theo migration backfill, đường tính lại, và job đối soát cho lần đổi ngưỡng. Tính sống thì con số không bao giờ lệch được với nguồn, và đổi ngưỡng có hiệu lực ngay.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListReporterStatsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listReporterStats(@Query() query: ListReporterStatsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.listReporterStatsUseCase.handle({ ...query }))
      .build();
  }

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
