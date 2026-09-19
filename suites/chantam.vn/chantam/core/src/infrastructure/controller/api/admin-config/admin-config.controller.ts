import {
  IGetAdminAuditLogsUseCase,
  IGetAdminConfigsUseCase,
  IPublishAdminConfigUseCase,
} from '@/application/contracts/admin-config';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
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
  PublishSystemConfigBodyDto,
} from '../../dto/admin-config/admin-config.dto';

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
  ) {}

  @Get('system-configs')
  @ApiOperation({ summary: 'Danh sách system config đang hiệu lực' })
  @ApiOkResponse()
  @ApiErrorResponses(...ApiTokenErrors)
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
  @ApiOperation({ summary: 'Publish system config revision mới' })
  @ApiCreatedResponse()
  @ApiErrorResponses(...ApiTokenErrors)
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
  @ApiOperation({ summary: 'Xem audit log Admin' })
  @ApiOkResponse()
  @ApiErrorResponses(...ApiTokenErrors)
  public async getAuditLogs(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: GetAdminAuditLogsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminAuditLogsUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit,
        }),
      )
      .build();
  }
}
