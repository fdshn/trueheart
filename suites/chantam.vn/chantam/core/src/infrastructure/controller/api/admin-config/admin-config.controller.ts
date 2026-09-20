import {
  IGetAdminAuditLogsUseCase,
  IGetAdminConfigsUseCase,
  IGetSystemLogsUseCase,
  IPublishAdminConfigUseCase,
} from '@/application/contracts/admin-config';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetAdminAuditLogsQueryDto,
  GetAdminAuditLogsResponseDto,
  GetAdminConfigsResponseDto,
  PublishSystemConfigBodyDto,
  PublishSystemConfigResponseDto,
} from '../../dto/admin-config/admin-config.dto';
import {
  GetSystemLogsQueryDto,
  GetSystemLogsResponseDto,
} from '../../dto/admin-config/system-log.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - System Config')
@ApiBearerAuth()
@Controller('admin')
export class AdminConfigController {
  public constructor(
    @Inject(IGetAdminConfigsUseCase)
    private readonly getAdminConfigsUseCase: IGetAdminConfigsUseCase,
    @Inject(IPublishAdminConfigUseCase)
    private readonly publishAdminConfigUseCase: IPublishAdminConfigUseCase,
    @Inject(IGetAdminAuditLogsUseCase)
    private readonly getAdminAuditLogsUseCase: IGetAdminAuditLogsUseCase,
    @Inject(IGetSystemLogsUseCase)
    private readonly getSystemLogsUseCase: IGetSystemLogsUseCase,
  ) {}

  @Get('system-configs')
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Danh sách system config đang hiệu lực',
    description:
      'Chỉ trả bản đang hiệu lực của mỗi khoá, không trả lịch sử. Giá trị của khoá được đánh dấu nhạy cảm KHÔNG bao giờ đọc ra được qua API — chỉ báo là đã cấu hình hay chưa.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAdminConfigsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getConfigs(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminConfigsUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post('system-configs')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Publish system config revision mới',
    description:
      'Copy-on-write, không sửa tại chỗ: bản đang hiệu lực được đóng lại và bản mới tăng version, nên luôn trả lời được ai đổi giá trị nào, lúc nào, vì lý do gì. Lý do là bắt buộc và đi thẳng vào audit log.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(PublishSystemConfigResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['key không nằm trong danh sách cấu hình được phép: point.secret'],
    ],
  )
  public async publishConfig(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishSystemConfigBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.publishAdminConfigUseCase.handle({
          actorUserId: principal.userId,
          systemConfig: body.systemConfig,
        }),
      )
      .build();
  }

  @Get('audit-logs')
  @RequiresPermission('audit.read')
  @ApiOperation({
    summary: 'Xem audit log Admin',
    description:
      'Lọc được theo người thực hiện, hành động, loại tài nguyên và khoảng thời gian. Bỏ trống một bộ lọc nghĩa là không lọc theo trường đó.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAdminAuditLogsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getAuditLogs(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: GetAdminAuditLogsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminAuditLogsUseCase.handle({
          actorUserId: principal.userId,
          actorFilter: query.actorFilter,
          action: query.action,
          resourceType: query.resourceType,
          from: query.from,
          to: query.to,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get('system-logs')
  @RequiresPermission('audit.read')
  @ApiOperation({
    summary: 'Nhật ký hệ thống theo từng loại',
    description:
      'Đọc thẳng từ nguồn thật của mỗi loại: thao tác quản trị, biến động điểm, đổi hạng và vòng đời giao dịch. ' +
      'Lọc được theo người liên quan, hành động và khoảng thời gian; bỏ trống một bộ lọc nghĩa là không lọc theo nó.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetSystemLogsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getSystemLogs(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: GetSystemLogsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getSystemLogsUseCase.handle({
          actorUserId: principal.userId,
          logType: query.logType,
          userId: query.userId,
          action: query.action,
          from: query.from,
          to: query.to,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }
}
