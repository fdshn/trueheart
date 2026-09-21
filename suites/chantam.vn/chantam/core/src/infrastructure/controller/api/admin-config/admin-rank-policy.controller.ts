import {
  IGetAdminRankPolicyUseCase,
  IPublishAdminMaintenancePolicyUseCase,
  IPublishAdminRankPolicyUseCase,
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
  GetAdminRankPolicyResponseDto,
  PublishAdminMaintenancePolicyBodyDto,
  PublishAdminMaintenancePolicyResponseDto,
  PublishAdminRankPolicyBodyDto,
  PublishAdminRankPolicyResponseDto,
} from '../../dto/admin-config/admin-rank-policy.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Chính sách cấp bậc')
@ApiBearerAuth()
@Controller('admin/ranks/policy')
export class AdminRankPolicyController {
  public constructor(
    @Inject(IGetAdminRankPolicyUseCase)
    private readonly getAdminRankPolicyUseCase: IGetAdminRankPolicyUseCase,
    @Inject(IPublishAdminRankPolicyUseCase)
    private readonly publishAdminRankPolicyUseCase: IPublishAdminRankPolicyUseCase,
    @Inject(IPublishAdminMaintenancePolicyUseCase)
    private readonly publishAdminMaintenancePolicyUseCase: IPublishAdminMaintenancePolicyUseCase,
  ) {}

  @Get()
  @RequiresPermission('config.read')
  @ApiOperation({ summary: 'Đọc chính sách thăng hạng hiện tại' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAdminRankPolicyResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getAdminRankPolicy(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminRankPolicyUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post()
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Cập nhật chính sách thăng hạng',
    description:
      'Cập nhật nguyên tử đủ 5 bậc và ghi audit trước/sau. Chỉ tiêu duy trì hạng chỉ đọc ở API này.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(PublishAdminRankPolicyResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['Ngưỡng điểm phải tăng dần theo thứ tự bậc']],
  )
  public async publishAdminRankPolicy(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishAdminRankPolicyBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.publishAdminRankPolicyUseCase.handle({
          actorUserId: principal.userId,
          rankPolicy: body.rankPolicy,
        }),
      )
      .build();
  }

  @Post('maintenance')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Cập nhật chỉ tiêu duy trì hạng',
    description:
      'Chỉ áp dụng cho chu kỳ mở sau thời điểm publish. Chu kỳ đang tồn tại giữ snapshot cũ.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(PublishAdminMaintenancePolicyResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['MEMBER không áp dụng chu kỳ duy trì']],
  )
  public async publishAdminMaintenancePolicy(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishAdminMaintenancePolicyBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.publishAdminMaintenancePolicyUseCase.handle({
          actorUserId: principal.userId,
          maintenancePolicy: body.maintenancePolicy,
        }),
      )
      .build();
  }
}
