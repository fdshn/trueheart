import {
  IGetAdminPointRulesUseCase,
  IPublishAdminPointRuleUseCase,
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
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetAdminPointRulesResponseDto,
  PublishAdminPointRuleBodyDto,
  PublishAdminPointRuleResponseDto,
} from '../../dto/admin-config/admin-point-rule.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Quy tắc điểm')
@ApiBearerAuth()
@Controller('admin/points/rules')
export class AdminPointRuleController {
  public constructor(
    @Inject(IGetAdminPointRulesUseCase)
    private readonly getAdminPointRulesUseCase: IGetAdminPointRulesUseCase,
    @Inject(IPublishAdminPointRuleUseCase)
    private readonly publishAdminPointRuleUseCase: IPublishAdminPointRuleUseCase,
  ) {}

  @Get()
  @RequiresPermission('config.read')
  @ApiOperation({ summary: 'Danh sách point rule đang hiệu lực' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAdminPointRulesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getAdminPointRules(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminPointRulesUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post()
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Publish version mới cho một point rule',
    description:
      'Không sửa version cũ. Point ledger tiếp theo sẽ chụp version mới; bút toán cũ giữ nguyên.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(PublishAdminPointRuleResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['Point rule không tồn tại: UNKNOWN']],
  )
  public async publishAdminPointRule(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishAdminPointRuleBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.publishAdminPointRuleUseCase.handle({
          actorUserId: principal.userId,
          pointRule: body.pointRule,
        }),
      )
      .build();
  }
}
