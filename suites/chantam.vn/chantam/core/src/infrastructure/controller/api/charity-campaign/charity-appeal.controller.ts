import {
  IActOnCharityAppealUseCase,
  IDecideAdminCharityAppealUseCase,
  IGetCharityAppealUseCase,
  IListAdminCharityAppealsUseCase,
  IListCharityAppealsUseCase,
  IListMyCharityAppealsUseCase,
  ISubmitCharityAppealUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityAppealConflictOfInterestException,
  CharityAppealDuplicatedException,
  CharityAppealInvalidStateException,
  CharityAppealNotAllowedException,
  CharityAppealNotFoundException,
  CharityAppealRateLimitedException,
  CharityAppealWindowClosedException,
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
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
  CharityAdminAppealDecisionBodyDto,
  CharityAdminAppealsQueryDto,
  CharityAdminAppealsResponseDto,
  CharityAppealCreateBodyDto,
  CharityAppealDecisionBodyDto,
  CharityAppealDetailResponseDto,
  CharityAppealParamsDto,
  CharityAppealResponseDto,
  CharityAppealsResponseDto,
} from '../../dto/charity-campaign/charity-appeal.dto';
import { CharityProjectParamsDto } from '../../dto/charity-campaign/charity-project.dto';
import { RequiresPermission } from '../../guards';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();

/**
 * Khiếu nại mức hoàn thành và giá trị xác nhận — hai tầng (docs/plan/CHARITY-PROJECT-LIFECYCLE.md
 * §3.16; API.md §18.5).
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@ApiBearerAuth()
@Controller('charity-campaigns')
export class CharityProjectAppealController {
  public constructor(
    @Inject(ISubmitCharityAppealUseCase)
    private readonly submitUseCase: ISubmitCharityAppealUseCase,
    @Inject(IListCharityAppealsUseCase)
    private readonly listUseCase: IListCharityAppealsUseCase,
  ) {}

  @Post(':id/appeals')
  @ApiOperation({
    summary: 'Khiếu nại mức hoàn thành / giá trị xác nhận',
    description:
      'Chỉ chính người bị đánh giá, với lần chấm HIỆN HÀNH của mình hoặc lượt giao nhận của mình, trong `charity.appeal_window_days` ngày (mặc định 7). Mỗi đối tượng một khiếu nại; tối đa 5 khiếu nại / 24 giờ. Ban tổ chức có `charity.appeal_organizer_sla_days` ngày (mặc định 3) để xét, quá hạn tự chuyển Admin.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityAppealResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityAppealNotAllowedException,
    CharityAppealWindowClosedException,
    CharityAppealDuplicatedException,
    CharityAppealRateLimitedException,
  )
  public async submit(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityAppealCreateBodyDto,
  ) {
    return ok({
      appeal: await this.submitUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        targetType: body.appeal.targetType,
        targetId: body.appeal.targetId,
        requestedValue: body.appeal.requestedValue ?? null,
        description: body.appeal.description,
        evidenceUrls: body.appeal.evidenceUrls ?? [],
      }),
    });
  }

  @Get(':id/appeals')
  @ApiOperation({
    summary: 'Khiếu nại của dự án (ban tổ chức)',
    description: 'Người tạo, coordinator, Admin `campaign.read`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityAppealsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      appeals: await this.listUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }
}

@ApiTags('Dự án từ thiện 4 giai đoạn')
@ApiBearerAuth()
@Controller()
export class CharityAppealController {
  public constructor(
    @Inject(IListMyCharityAppealsUseCase)
    private readonly mineUseCase: IListMyCharityAppealsUseCase,
    @Inject(IGetCharityAppealUseCase)
    private readonly getUseCase: IGetCharityAppealUseCase,
    @Inject(IActOnCharityAppealUseCase)
    private readonly actUseCase: IActOnCharityAppealUseCase,
  ) {}

  @Get('me/charity-appeals')
  @ApiOperation({ summary: 'Khiếu nại tôi đã gửi' })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityAppealsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async mine(@CurrentUser() principal: IAuthPrincipal) {
    return ok({
      appeals: await this.mineUseCase.handle({ userId: principal.userId }),
    });
  }

  @Get('charity-appeals/:appealId')
  @ApiOperation({
    summary: 'Chi tiết khiếu nại và nhật ký từng bước',
    description:
      'Người khiếu nại, người có vai với dự án, Admin `report.read`. Người khiếu nại thấy lý do của mọi quyết định.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityAppealDetailResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityAppealNotFoundException)
  public async detail(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityAppealParamsDto,
  ) {
    return ok(
      await this.getUseCase.handle({
        userId: principal.userId,
        appealId: params.appealId,
      }),
    );
  }

  @Patch('charity-appeals/:appealId')
  @ApiOperation({
    summary: 'Xử khiếu nại tầng 1',
    description:
      'Ban tổ chức/coordinator/Admin khi `ORGANIZER_REVIEW`: `ADJUST` (giá trị mới có hiệu lực NGAY, điểm ghi bút toán chênh) hoặc `KEEP`, bắt buộc lý do; người đã chấm không tự xét nếu ban tổ chức còn người khác. Người khiếu nại khi `AWAITING_APPELLANT`: `ACCEPT` (đóng) hoặc `ESCALATE` (lên Admin); im lặng quá `charity.appeal_auto_close_days` ngày thì tự đóng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityAppealResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityAppealNotFoundException,
    CharityAppealInvalidStateException,
    CharityAppealConflictOfInterestException,
    CharityProjectForbiddenException,
    CharityProjectInactiveException,
  )
  public async act(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityAppealParamsDto,
    @Body() body: CharityAppealDecisionBodyDto,
  ) {
    return ok({
      appeal: await this.actUseCase.handle({
        userId: principal.userId,
        appealId: params.appealId,
        action: body.decision.action,
        value: body.decision.value ?? null,
        reason: body.decision.reason ?? null,
      }),
    });
  }
}

@ApiTags('Admin - Dự án từ thiện')
@ApiBearerAuth()
@Controller('admin/charity-appeals')
export class AdminCharityAppealController {
  public constructor(
    @Inject(IListAdminCharityAppealsUseCase)
    private readonly listUseCase: IListAdminCharityAppealsUseCase,
    @Inject(IDecideAdminCharityAppealUseCase)
    private readonly decideUseCase: IDecideAdminCharityAppealUseCase,
  ) {}

  @Get()
  @RequiresPermission('report.read')
  @ApiOperation({
    summary: 'Hàng đợi khiếu nại dự án từ thiện',
    description:
      'Lọc `status` (thường là `ADMIN_REVIEW`). Kèm số khiếu nại bị bác của người khiếu nại và số lần ban tổ chức bị khiếu nại thành công — để THẤY, không tự động phạt.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityAdminAppealsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: CharityAdminAppealsQueryDto,
  ) {
    return ok({
      appeals: await this.listUseCase.handle({
        userId: principal.userId,
        status: query.status ?? null,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      }),
    });
  }

  @Patch(':appealId')
  @RequiresPermission('report.resolve')
  @ApiOperation({
    summary: 'Quyết định tầng 2 / mở lại',
    description:
      '`KEEP` / `ADJUST` (kèm `value`) / `REJECT` khi `ADMIN_REVIEW` — quyết cuối, đóng khiếu nại. `REOPEN` mở lại khiếu nại đã đóng. Luôn có lý do, ghi nhật ký, báo hai bên.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityAppealResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    CharityAppealNotFoundException,
    CharityAppealInvalidStateException,
  )
  public async decide(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityAppealParamsDto,
    @Body() body: CharityAdminAppealDecisionBodyDto,
  ) {
    return ok({
      appeal: await this.decideUseCase.handle({
        userId: principal.userId,
        appealId: params.appealId,
        action: body.decision.action,
        value: body.decision.value ?? null,
        reason: body.decision.reason,
      }),
    });
  }
}
