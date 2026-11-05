import {
  IAssignCharityRoundUseCase,
  ICheckCharityCompletionUseCase,
  IDecideCharitySupportOfferUseCase,
  IDeleteCharitySupportNeedUseCase,
  IListCharityRoundsUseCase,
  IListCharitySupportNeedsUseCase,
  IListCharitySupportOffersUseCase,
  IManageCharityRoundsUseCase,
  IManageCharitySupportNeedsUseCase,
  IOfferCharitySupportUseCase,
  IPostponeCharityDistributionUseCase,
  ISaveCharityRoundUseCase,
  ISaveCharitySupportNeedUseCase,
  ISetCharityRoundReadinessUseCase,
  ISetCharityRoundStatusUseCase,
  IWithdrawCharitySupportOfferUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotApprovedException,
  CharityRoundInvalidStateException,
  CharityRoundNotFoundException,
  CharityStageTransitionInvalidException,
  CharitySupportNeedClosedException,
  CharitySupportNeedInUseException,
  CharitySupportNeedNotFoundException,
  CharitySupportOfferInvalidStateException,
  CharitySupportOfferNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
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
  CharityCompletionResponseDto,
  CharityPostponeBodyDto,
  CharityPublicRoundsResponseDto,
  CharityRoundAssignmentsBodyDto,
  CharityRoundAssignmentsResponseDto,
  CharityRoundBodyDto,
  CharityRoundParamsDto,
  CharityRoundReadinessBodyDto,
  CharityRoundResponseDto,
  CharityRoundsResponseDto,
  CharityRoundStatusBodyDto,
  CharitySupportNeedBodyDto,
  CharitySupportNeedParamsDto,
  CharitySupportNeedResponseDto,
  CharitySupportNeedsResponseDto,
  CharitySupportOfferBodyDto,
  CharitySupportOfferDecisionBodyDto,
  CharitySupportOfferParamsDto,
  CharitySupportOfferResponseDto,
  CharitySupportOffersQueryDto,
  CharitySupportOffersResponseDto,
} from '../../dto/charity-campaign/charity-operations.dto';
import {
  CharityPhasesResponseDto,
  CharityProjectIdOrSlugParamsDto,
  CharityProjectParamsDto,
} from '../../dto/charity-campaign/charity-project.dto';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();

const ProjectErrors = [
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
] as const;

/**
 * Đợt 5b/5c — quyết định Product 05/11 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.2, §3.4,
 * §3.11, §3.18; API.md §18.7): hỗ trợ mở, hoãn bước trao, nhiều đợt trao, hoàn tất dự án.
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@Controller('charity-campaigns')
export class CharityOperationsController {
  public constructor(
    @Inject(IListCharitySupportNeedsUseCase)
    private readonly supportPublicUseCase: IListCharitySupportNeedsUseCase,
    @Inject(IManageCharitySupportNeedsUseCase)
    private readonly supportManageUseCase: IManageCharitySupportNeedsUseCase,
    @Inject(ISaveCharitySupportNeedUseCase)
    private readonly supportSaveUseCase: ISaveCharitySupportNeedUseCase,
    @Inject(IDeleteCharitySupportNeedUseCase)
    private readonly supportDeleteUseCase: IDeleteCharitySupportNeedUseCase,
    @Inject(IOfferCharitySupportUseCase)
    private readonly offerUseCase: IOfferCharitySupportUseCase,
    @Inject(IListCharitySupportOffersUseCase)
    private readonly offersUseCase: IListCharitySupportOffersUseCase,
    @Inject(IDecideCharitySupportOfferUseCase)
    private readonly offerDecideUseCase: IDecideCharitySupportOfferUseCase,
    @Inject(IWithdrawCharitySupportOfferUseCase)
    private readonly offerWithdrawUseCase: IWithdrawCharitySupportOfferUseCase,
    @Inject(IPostponeCharityDistributionUseCase)
    private readonly postponeUseCase: IPostponeCharityDistributionUseCase,
    @Inject(IListCharityRoundsUseCase)
    private readonly roundsPublicUseCase: IListCharityRoundsUseCase,
    @Inject(IManageCharityRoundsUseCase)
    private readonly roundsManageUseCase: IManageCharityRoundsUseCase,
    @Inject(ISaveCharityRoundUseCase)
    private readonly roundSaveUseCase: ISaveCharityRoundUseCase,
    @Inject(ISetCharityRoundStatusUseCase)
    private readonly roundStatusUseCase: ISetCharityRoundStatusUseCase,
    @Inject(ISetCharityRoundReadinessUseCase)
    private readonly roundReadinessUseCase: ISetCharityRoundReadinessUseCase,
    @Inject(IAssignCharityRoundUseCase)
    private readonly assignUseCase: IAssignCharityRoundUseCase,
    @Inject(ICheckCharityCompletionUseCase)
    private readonly completionUseCase: ICheckCharityCompletionUseCase,
  ) {}

  // ── Hỗ trợ mở ─────────────────────────────────────────────────────────

  @Get(':idOrSlug/other-support-needs')
  @Public()
  @ApiOperation({
    summary: 'Hạng mục hỗ trợ mở (công khai)',
    description:
      'Chuyến xe, công sức, kỹ năng/dịch vụ, địa điểm, thiết bị, suất ăn… — bổ sung cho tiền/hiện vật/nhân lực. Kèm số chờ xét / đã nhận / hoàn thành / nguồn ngoài / còn thiếu. Không có số điện thoại người phụ trách.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySupportNeedsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async publicSupportNeeds(
    @Param() params: CharityProjectIdOrSlugParamsDto,
  ) {
    return ok({
      otherSupportNeeds: await this.supportPublicUseCase.handle({
        idOrSlug: params.idOrSlug,
      }),
    });
  }

  @Get(':id/other-support-needs/manage')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Hạng mục hỗ trợ mở (ban tổ chức)',
    description: 'Người tạo, coordinator, Admin `campaign.read`. Đủ trường.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySupportNeedsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async manageSupportNeeds(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      otherSupportNeeds: await this.supportManageUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Post(':id/other-support-needs')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thêm hạng mục hỗ trợ mở',
    description: 'Người tạo, Admin `campaign.manage`.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharitySupportNeedResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors, [
    ValidationFailedException,
    ['supportNeed.endsAt: phải sau startsAt'],
  ])
  public async createSupportNeed(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharitySupportNeedBodyDto,
  ) {
    return ok({
      otherSupportNeed: await this.saveSupport(
        principal.userId,
        params.id,
        null,
        body,
      ),
    });
  }

  @Patch(':id/other-support-needs/:supportNeedId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa hạng mục hỗ trợ mở, ghi nguồn ngoài app, đóng/mở',
    description:
      'Nguồn ngoài app (`external.quantity > 0`) bắt buộc có bằng chứng `https://` — tính tiến độ, không sinh điểm.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySupportNeedResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharitySupportNeedNotFoundException,
    [
      ValidationFailedException,
      ['supportNeed.external.evidenceUrls: nguồn ngoài app phải có bằng chứng'],
    ],
  )
  public async updateSupportNeed(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharitySupportNeedParamsDto,
    @Body() body: CharitySupportNeedBodyDto,
  ) {
    return ok({
      otherSupportNeed: await this.saveSupport(
        principal.userId,
        params.id,
        params.supportNeedId,
        body,
      ),
    });
  }

  @Delete(':id/other-support-needs/:supportNeedId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xoá hạng mục hỗ trợ mở',
    description:
      'Chỉ khi chưa ai nhận hỗ trợ. Có rồi → `CHARITY_SUPPORT_NEED_IN_USE`: đóng hạng mục thay vì xoá.',
  })
  @ApiOkResponse({ description: '`{ deleted: true }`' })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharitySupportNeedNotFoundException,
    CharitySupportNeedInUseException,
  )
  public async deleteSupportNeed(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharitySupportNeedParamsDto,
  ) {
    return ok(
      await this.supportDeleteUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        supportNeedId: params.supportNeedId,
      }),
    );
  }

  @Post(':id/other-support-needs/:supportNeedId/offers')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Nhận hỗ trợ (một phần, nhiều lần được)',
    description:
      'Không cần đóng góp hay tham gia trước. Hạng mục phải đang mở, dự án chưa sang Tổng kết.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharitySupportOfferResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharitySupportNeedNotFoundException,
    CharitySupportNeedClosedException,
  )
  public async offer(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharitySupportNeedParamsDto,
    @Body() body: CharitySupportOfferBodyDto,
  ) {
    return ok({
      offer: await this.offerUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        supportNeedId: params.supportNeedId,
        quantity: body.offer.quantity,
        note: body.offer.note ?? null,
      }),
    });
  }

  @Get(':id/support-offers')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đề nghị hỗ trợ mở',
    description:
      '`mine=true`: của chính tôi. Không có: toàn bộ — người tạo, coordinator, Admin `campaign.read`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySupportOffersResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async offers(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Query() query: CharitySupportOffersQueryDto,
  ) {
    return ok({
      offers: await this.offersUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        supportNeedId: query.supportNeedId ?? null,
        mine: query.mine === true,
      }),
    });
  }

  @Patch(':id/support-offers/:offerId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Nhận / từ chối / ghi hoàn thành đề nghị hỗ trợ',
    description:
      'Người tạo, coordinator, Admin. Người hỗ trợ nhận thông báo `CHARITY_SUPPORT_OFFER_UPDATED`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySupportOfferResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharitySupportOfferNotFoundException,
    CharitySupportOfferInvalidStateException,
  )
  public async decideOffer(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharitySupportOfferParamsDto,
    @Body() body: CharitySupportOfferDecisionBodyDto,
  ) {
    return ok({
      offer: await this.offerDecideUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        offerId: params.offerId,
        action: body.decision.action,
        reason: body.decision.reason ?? null,
        completedQuantity: body.decision.completedQuantity ?? null,
      }),
    });
  }

  @Post(':id/support-offers/:offerId/withdraw')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rút đề nghị hỗ trợ của tôi',
    description: 'Khi đang chờ xét hoặc đã được nhận mà chưa hoàn thành.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharitySupportOfferResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharitySupportOfferNotFoundException,
    CharitySupportOfferInvalidStateException,
  )
  public async withdrawOffer(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharitySupportOfferParamsDto,
  ) {
    return ok({
      offer: await this.offerWithdrawUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        offerId: params.offerId,
      }),
    });
  }

  // ── Hoãn bước trao ────────────────────────────────────────────────────

  @Post(':id/stage/postpone')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Hoãn bước trao',
    description:
      'Người tạo, coordinator, Admin; trước khi bước trao bắt đầu. Bắt buộc lý do. Ghi lịch sử sửa (chữ đỏ) kèm lý do, báo người đã ủng hộ/tham gia; nhắc 48 giờ tự xếp lại cho mốc mới. Dự án chia đợt thì hoãn từng đợt qua `PATCH :id/rounds/:roundId`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityPhasesResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityProjectNotApprovedException,
    CharityStageTransitionInvalidException,
    [
      ValidationFailedException,
      ['postpone.startsAt: phải sau mốc trao hiện tại và sau lúc này'],
    ],
  )
  public async postpone(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityPostponeBodyDto,
  ) {
    return ok({
      phases: await this.postponeUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        startsAt: body.postpone.startsAt,
        endsAt: body.postpone.endsAt ?? null,
        reason: body.postpone.reason,
      }),
    });
  }

  // ── Đợt trao ──────────────────────────────────────────────────────────

  @Get(':idOrSlug/rounds')
  @Public()
  @ApiOperation({
    summary: 'Các đợt trao (công khai)',
    description:
      'Giờ, địa điểm, trạng thái, số người tham gia / giao nhận / giá trị đã xác nhận của từng đợt. Không có checklist, ghi chú sẵn sàng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPublicRoundsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async publicRounds(@Param() params: CharityProjectIdOrSlugParamsDto) {
    return ok({
      rounds: await this.roundsPublicUseCase.handle({
        idOrSlug: params.idOrSlug,
      }),
    });
  }

  @Get(':id/rounds/manage')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Các đợt trao (ban tổ chức)',
    description:
      'Kèm checklist, sẵn sàng và `warnings` (còn ≤ 48 giờ mà chưa xác nhận / checklist chưa xong / báo chưa sẵn sàng) — chỉ cảnh báo, không chặn.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityRoundsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async manageRounds(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      rounds: await this.roundsManageUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Post(':id/rounds')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thêm đợt trao',
    description:
      'Người tạo, coordinator, Admin. Mỗi đợt có timeline 10 bước riêng (`GET :idOrSlug/event-steps?roundId=`).',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityRoundResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors, [
    ValidationFailedException,
    ['round.endsAt: phải sau startsAt'],
  ])
  public async createRound(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityRoundBodyDto,
  ) {
    return ok({
      round: await this.saveRound(principal.userId, params.id, null, body),
    });
  }

  @Patch(':id/rounds/:roundId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa / hoãn đợt trao',
    description:
      'Đổi giờ hoặc địa điểm của đợt khi dự án đã duyệt: bắt buộc `reason`, người của đợt (participant, người có giao nhận gắn đợt — đợt chưa gắn ai thì cả dự án) nhận thông báo; nhắc 48 giờ xếp lại cho mốc mới.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityRoundResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityRoundNotFoundException,
    CharityRoundInvalidStateException,
    [
      ValidationFailedException,
      ['round.reason: bắt buộc khi đổi giờ / địa điểm đợt trao đã công khai'],
    ],
  )
  public async updateRound(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityRoundParamsDto,
    @Body() body: CharityRoundBodyDto,
  ) {
    return ok({
      round: await this.saveRound(
        principal.userId,
        params.id,
        params.roundId,
        body,
      ),
    });
  }

  @Post(':id/rounds/:roundId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ghi nhận xong / huỷ đợt trao',
    description:
      '`DONE` hoặc `CANCELLED` (bắt buộc lý do, báo người của đợt). Gắn kết participant/giao nhận giữ nguyên để ban tổ chức chuyển sang đợt khác.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityRoundResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityRoundNotFoundException,
    CharityRoundInvalidStateException,
  )
  public async roundStatus(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityRoundParamsDto,
    @Body() body: CharityRoundStatusBodyDto,
  ) {
    return ok({
      round: await this.roundStatusUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        roundId: params.roundId,
        status: body.status.status,
        reason: body.status.reason ?? null,
      }),
    });
  }

  @Put(':id/rounds/:roundId/readiness')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Checklist trước 48 giờ và xác nhận sẵn sàng của đợt',
    description:
      '`READY` hoặc `NOT_READY` (bắt buộc ghi chú). Chưa sẵn sàng chỉ tạo cảnh báo — không tự huỷ hay chặn sự kiện.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityRoundResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityRoundNotFoundException,
    CharityRoundInvalidStateException,
  )
  public async roundReadiness(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityRoundParamsDto,
    @Body() body: CharityRoundReadinessBodyDto,
  ) {
    return ok({
      round: await this.roundReadinessUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        roundId: params.roundId,
        readiness: body.readiness.status,
        note: body.readiness.note ?? null,
        checklist: (body.readiness.checklist ?? []).map((item) => ({
          key: item.key,
          done: item.done,
          note: item.note ?? null,
        })),
      }),
    });
  }

  @Put(':id/round-assignments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gắn participant / lượt giao nhận vào đợt trao',
    description:
      '`roundId: null` gỡ khỏi đợt. Chỉ dòng của chính dự án; trả số dòng đã gắn. Không gắn vào đợt đã huỷ.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityRoundAssignmentsResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityRoundNotFoundException,
    CharityRoundInvalidStateException,
  )
  public async assign(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityRoundAssignmentsBodyDto,
  ) {
    return ok(
      await this.assignUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        roundId: body.assignments.roundId ?? null,
        participationIds: body.assignments.participationIds ?? [],
        deliveryIds: body.assignments.deliveryIds ?? [],
      }),
    );
  }

  // ── Hoàn tất dự án ────────────────────────────────────────────────────

  @Get(':id/completion-check')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Điều kiện hoàn tất dự án',
    description:
      'Người tạo, coordinator, Admin `campaign.read`. Còn đề nghị chưa xử lý, giao nhận chưa đối soát, hạng mục mở, phần dư chưa giải trình, thiếu sao kê, khiếu nại mở, đề nghị hỗ trợ dở dang, đợt trao chưa ghi nhận → chưa công khai tổng kết được (`CHARITY_PROJECT_COMPLETION_BLOCKED`).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityCompletionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async completion(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok(
      await this.completionUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    );
  }

  private saveSupport(
    userId: string,
    campaignId: string,
    supportNeedId: string | null,
    body: CharitySupportNeedBodyDto,
  ) {
    const input = body.otherSupportNeed;
    return this.supportSaveUseCase.handle({
      userId,
      campaignId,
      supportNeedId,
      need: {
        supportType: input.supportType,
        title: input.title,
        description: input.description ?? null,
        unit: input.unit,
        targetQuantity: input.targetQuantity,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        locationLabel: input.locationLabel ?? null,
        requirements: input.requirements ?? null,
        handoverMethod: input.handoverMethod ?? null,
        picName: input.picName ?? null,
        picPhone: input.picPhone ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
      external: input.external
        ? {
            quantity: input.external.quantity,
            evidenceUrls: input.external.evidenceUrls,
            note: input.external.note ?? null,
          }
        : undefined,
      status: input.status,
    });
  }

  private saveRound(
    userId: string,
    campaignId: string,
    roundId: string | null,
    body: CharityRoundBodyDto,
  ) {
    const input = body.round;
    return this.roundSaveUseCase.handle({
      userId,
      campaignId,
      roundId,
      round: {
        title: input.title,
        locationLabel: input.locationLabel ?? null,
        address: input.address ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
      reason: input.reason ?? null,
    });
  }
}
