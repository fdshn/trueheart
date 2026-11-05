import {
  ICheckInCharityParticipationUseCase,
  IDecideCharityParticipationUseCase,
  IGetMyCharityParticipationUseCase,
  IListCharityParticipationsUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityCampaignNotFoundException,
  CharityParticipationInvalidStateException,
  CharityParticipationNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotApprovedException,
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
  CharityMyParticipationResponseDto,
  CharityParticipationDecisionBodyDto,
  CharityParticipationParamsDto,
  CharityParticipationResponseDto,
  CharityParticipationsQueryDto,
  CharityParticipationsResponseDto,
} from '../../dto/charity-campaign/charity-participation.dto';
import { CharityProjectParamsDto } from '../../dto/charity-campaign/charity-project.dto';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();

const OperateErrors = [
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotApprovedException,
  CharityParticipationNotFoundException,
  CharityParticipationInvalidStateException,
] as const;

/**
 * Vòng đời participant — đợt 5a, quyết định 05/11 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.11,
 * §7.2; API.md §18.6). Đăng ký / huỷ vẫn ở `POST :id/participation` và `:id/participation/cancel`.
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@ApiBearerAuth()
@Controller('charity-campaigns')
export class CharityParticipationController {
  public constructor(
    @Inject(IListCharityParticipationsUseCase)
    private readonly listUseCase: IListCharityParticipationsUseCase,
    @Inject(IDecideCharityParticipationUseCase)
    private readonly decideUseCase: IDecideCharityParticipationUseCase,
    @Inject(ICheckInCharityParticipationUseCase)
    private readonly checkInUseCase: ICheckInCharityParticipationUseCase,
    @Inject(IGetMyCharityParticipationUseCase)
    private readonly mineUseCase: IGetMyCharityParticipationUseCase,
  ) {}

  @Get(':id/participation')
  @ApiOperation({
    summary: 'Lượt tham gia của tôi',
    description:
      '`participation: null` khi chưa từng đăng ký. `REGISTERED` = đang chờ ban tổ chức duyệt.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityMyParticipationResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async mine(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      participation: await this.mineUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Get(':id/participations')
  @ApiOperation({
    summary: 'Danh sách participant (ban tổ chức)',
    description:
      'Người tạo, coordinator, Admin `campaign.read`. Lọc `status`. Kèm vị trí tuyển người đang nhận.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityParticipationsResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Query() query: CharityParticipationsQueryDto,
  ) {
    return ok({
      participations: await this.listUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        status: query.status ?? null,
      }),
    });
  }

  @Patch(':id/participations/:participationId')
  @ApiOperation({
    summary: 'Duyệt / danh sách chờ / từ chối / vắng mặt / hoàn thành',
    description:
      'Người tạo, coordinator, Admin. Từ chối và vắng mặt bắt buộc lý do. Participant nhận thông báo `CHARITY_PARTICIPATION_UPDATED`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityParticipationResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...OperateErrors)
  public async decide(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityParticipationParamsDto,
    @Body() body: CharityParticipationDecisionBodyDto,
  ) {
    return ok({
      participation: await this.decideUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        participationId: params.participationId,
        action: body.decision.action,
        reason: body.decision.reason ?? null,
      }),
    });
  }

  @Post(':id/participations/:participationId/check-in')
  @ApiOperation({
    summary: 'Check-in participant tại sự kiện',
    description:
      'Người tạo, coordinator, Admin; chỉ người đã được xác nhận (`CONFIRMED`). Mở quyền đăng ảnh/clip sự kiện và chấm mức hoàn thành. Gọi lại khi đã check-in trả nguyên trạng (an toàn khi gửi lại sau mất mạng).',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityParticipationResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, ...OperateErrors)
  public async checkIn(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityParticipationParamsDto,
  ) {
    return ok({
      participation: await this.checkInUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        participationId: params.participationId,
      }),
    });
  }
}
