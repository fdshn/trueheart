import {
  ICloseCharityDisputeUseCase,
  IListCharityDisputesUseCase,
  IOpenCharityDisputeUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityContributionNotFoundException,
  CharityDisputeAlreadyOpenException,
  CharityDisputeInvalidStateException,
  CharityDisputeNotAllowedException,
  CharityDisputeNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CharityContributionIdParamsDto,
  CharityDisputeBodyDto,
  CharityDisputeDecisionBodyDto,
  CharityDisputeParamsDto,
  CharityDisputeResponseDto,
  CharityDisputesQueryDto,
  CharityDisputesResponseDto,
} from '../../dto/charity-campaign/charity-dispute.dto';
import { CharityProjectParamsDto } from '../../dto/charity-campaign/charity-project.dto';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();

/**
 * Tranh chấp đóng góp — đợt 5c, quyết định 05/11 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.18;
 * API.md §18.8). Khác khiếu nại (§3.16): đây là hai bên không thống nhất về việc giao nhận.
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@ApiBearerAuth()
@Controller()
export class CharityDisputeController {
  public constructor(
    @Inject(IOpenCharityDisputeUseCase)
    private readonly openUseCase: IOpenCharityDisputeUseCase,
    @Inject(IListCharityDisputesUseCase)
    private readonly listUseCase: IListCharityDisputesUseCase,
    @Inject(ICloseCharityDisputeUseCase)
    private readonly closeUseCase: ICloseCharityDisputeUseCase,
  ) {}

  @Post('charity-contributions/:id/disputes')
  @ApiOperation({
    summary: 'Mở tranh chấp về một đóng góp',
    description:
      'Người đóng góp hoặc người tạo / coordinator của dự án; đóng góp phải đã được chấp nhận (toàn phần hay một phần). Mỗi đóng góp tối đa một tranh chấp đang mở. Bên kia nhận `CHARITY_CONTRIBUTION_DISPUTE_UPDATED`. Tranh chấp mở chặn hoàn tất dự án.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityDisputeResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityContributionNotFoundException,
    CharityDisputeNotAllowedException,
    CharityDisputeAlreadyOpenException,
  )
  public async open(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityContributionIdParamsDto,
    @Body() body: CharityDisputeBodyDto,
  ) {
    return ok({
      dispute: await this.openUseCase.handle({
        userId: principal.userId,
        contributionId: params.id,
        reason: body.dispute.reason,
        description: body.dispute.description,
        evidenceUrls: body.dispute.evidenceUrls ?? [],
      }),
    });
  }

  @Get('charity-contributions/:id/disputes')
  @ApiOperation({
    summary: 'Tranh chấp của một đóng góp',
    description: 'Hai bên của đóng góp, Admin `campaign.read`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityDisputesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityContributionNotFoundException)
  public async byContribution(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityContributionIdParamsDto,
    @Query() query: CharityDisputesQueryDto,
  ) {
    return ok({
      disputes: await this.listUseCase.handle({
        userId: principal.userId,
        campaignId: null,
        contributionId: params.id,
        status: query.status ?? null,
      }),
    });
  }

  @Get('charity-campaigns/:id/disputes')
  @ApiOperation({
    summary: 'Tranh chấp đóng góp của dự án',
    description: 'Người tạo, coordinator, Admin `campaign.read`. Lọc `status`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityDisputesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityDisputeNotFoundException)
  public async byCampaign(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Query() query: CharityDisputesQueryDto,
  ) {
    return ok({
      disputes: await this.listUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        contributionId: null,
        status: query.status ?? null,
      }),
    });
  }

  @Patch('charity-disputes/:disputeId')
  @ApiOperation({
    summary: 'Giải quyết / rút tranh chấp',
    description:
      '`RESOLVE` (bắt buộc `resolution`): bên kia của người mở hoặc Admin `report.resolve` — bên mở không tự kết luận. `WITHDRAW`: chỉ người mở. Bên kia nhận thông báo.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityDisputeResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityDisputeNotFoundException,
    CharityDisputeNotAllowedException,
    CharityDisputeInvalidStateException,
  )
  public async close(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityDisputeParamsDto,
    @Body() body: CharityDisputeDecisionBodyDto,
  ) {
    return ok({
      dispute: await this.closeUseCase.handle({
        userId: principal.userId,
        disputeId: params.disputeId,
        action: body.decision.action,
        resolution: body.decision.resolution ?? null,
      }),
    });
  }
}
