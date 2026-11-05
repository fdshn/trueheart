import {
  IEvaluateCharityParticipantUseCase,
  IGetCharitySummaryUseCase,
  IGetMyCharityEvaluationUseCase,
  IListCharityEvaluationsUseCase,
  IListCharityHomeCardsUseCase,
  IPublishCharitySummaryUseCase,
  IRequestCharityPromotionUseCase,
  ISaveCharityFinancialReportUseCase,
  ISaveCharitySummaryUseCase,
  ISetCharityPromotionUseCase,
  ISetCharityPublicNameUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityCampaignNotFoundException,
  CharityContributionNotFoundException,
  CharityEvaluationTargetInvalidException,
  CharityFinancialReportNotFoundException,
  CharityNotRegisteredException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotApprovedException,
  CharitySummaryEmptyException,
  CharitySummaryFinancialRequiredException,
  CharitySummaryNotOpenException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CharityProjectParamsDto } from '../../dto/charity-campaign/charity-project.dto';
import {
  CharityEvaluationBoardResponseDto,
  CharityEvaluationBodyDto,
  CharityEvaluationResponseDto,
  CharityFinancialReportBodyDto,
  CharityFinancialReportResponseDto,
  CharityHomeCardsQueryDto,
  CharityHomeCardsResponseDto,
  CharityMyEvaluationResponseDto,
  CharityProjectContributionParamsDto,
  CharityProjectReportParamsDto,
  CharityProjectUserParamsDto,
  CharityPromotionRequestBodyDto,
  CharityPromotionResponseDto,
  CharityPromotionSetBodyDto,
  CharityPublicNameBodyDto,
  CharitySummaryBoardResponseDto,
  CharitySummaryBodyDto,
  CharitySummaryResponseDto,
  CharityUpdatedResponseDto,
} from '../../dto/charity-campaign/charity-summary.dto';
import { RequiresPermission } from '../../guards';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();
const ProjectErrors = [
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
] as const;

/**
 * Dự án từ thiện 4 giai đoạn — đợt 4a (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.6, §3.14,
 * §3.17; API.md §18.4): tổng kết, báo cáo tài chính, chấm mức hoàn thành, nickname công khai,
 * đề xuất card Home.
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@Controller('charity-campaigns')
export class CharitySummaryController {
  public constructor(
    @Inject(IGetCharitySummaryUseCase)
    private readonly getSummaryUseCase: IGetCharitySummaryUseCase,
    @Inject(ISaveCharitySummaryUseCase)
    private readonly saveSummaryUseCase: ISaveCharitySummaryUseCase,
    @Inject(IPublishCharitySummaryUseCase)
    private readonly publishSummaryUseCase: IPublishCharitySummaryUseCase,
    @Inject(ISaveCharityFinancialReportUseCase)
    private readonly reportUseCase: ISaveCharityFinancialReportUseCase,
    @Inject(IListCharityEvaluationsUseCase)
    private readonly evaluationsUseCase: IListCharityEvaluationsUseCase,
    @Inject(IEvaluateCharityParticipantUseCase)
    private readonly evaluateUseCase: IEvaluateCharityParticipantUseCase,
    @Inject(IGetMyCharityEvaluationUseCase)
    private readonly myEvaluationUseCase: IGetMyCharityEvaluationUseCase,
    @Inject(ISetCharityPublicNameUseCase)
    private readonly publicNameUseCase: ISetCharityPublicNameUseCase,
    @Inject(IRequestCharityPromotionUseCase)
    private readonly promotionRequestUseCase: IRequestCharityPromotionUseCase,
  ) {}

  @Get(':id/summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tổng kết + báo cáo tài chính (workspace)',
    description:
      'Bản nháp lẫn đã công khai. `financialReportRequired`: dự án có nhận tiền → cần ít nhất một báo cáo kèm sao kê trước khi công khai tổng kết. Người tạo, coordinator, Admin `campaign.read`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySummaryBoardResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async summary(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok(
      await this.getSummaryUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    );
  }

  @Put(':id/summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lưu tổng kết (tab D)',
    description:
      'Người tạo, Admin; dự án ở Tổng kết (kể cả đã đóng). Sửa sau khi đã công khai thì ghi lịch sử sửa (chữ đỏ) và người xem thấy ngay.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySummaryResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityProjectNotApprovedException,
    CharitySummaryNotOpenException,
  )
  public async saveSummary(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharitySummaryBodyDto,
  ) {
    return ok({
      summary: await this.saveSummaryUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        content: {
          summary: body.summary.summary ?? null,
          usageReport: body.summary.usageReport ?? null,
          thanksMessage: body.summary.thanksMessage ?? null,
          lessonsLearned: body.summary.lessonsLearned ?? null,
          evidenceUrls: body.summary.evidenceUrls ?? [],
        },
      }),
    });
  }

  @Post(':id/summary/publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Công khai tổng kết',
    description:
      'Cần nội dung; dự án có nhận tiền thì cần báo cáo tài chính kèm sao kê. Lần đầu công khai báo người tham gia, người góp, người quan tâm (`CHARITY_SUMMARY_PUBLISHED`).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySummaryResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharitySummaryNotOpenException,
    CharitySummaryEmptyException,
    CharitySummaryFinancialRequiredException,
  )
  public async publishSummary(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      summary: await this.publishSummaryUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Post(':id/financial-reports')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thêm báo cáo tài chính',
    description:
      'Kỳ báo cáo, tổng thu/chi (VNĐ, số dư database tính), diễn giải, sao kê (≥ 1 URL https). Người tạo, Admin.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityFinancialReportResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityProjectNotApprovedException,
  )
  public async createReport(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityFinancialReportBodyDto,
  ) {
    return ok({
      report: await this.reportUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        reportId: null,
        report: body.report,
      }),
    });
  }

  @Put(':id/financial-reports/:reportId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa báo cáo tài chính',
    description:
      'Tổng kết đã công khai thì ghi lịch sử sửa; đổi số thu/chi báo người theo dõi.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityFinancialReportResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityFinancialReportNotFoundException,
  )
  public async updateReport(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectReportParamsDto,
    @Body() body: CharityFinancialReportBodyDto,
  ) {
    return ok({
      report: await this.reportUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        reportId: params.reportId,
        report: body.report,
      }),
    });
  }

  @Get(':id/evaluations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mức hoàn thành của người tham gia (nội bộ)',
    description:
      'Điểm hiện hành (lần chấm mới nhất) và người còn chưa chấm. KHÔNG có trên đường công khai. Người tạo, coordinator, Admin `campaign.read`.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityEvaluationBoardResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async evaluations(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok(
      await this.evaluationsUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    );
  }

  @Get(':id/evaluations/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mức hoàn thành của tôi',
    description:
      'Chỉ điểm, không có ghi chú nội bộ. `null` khi chưa được chấm.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityMyEvaluationResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async myEvaluation(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      evaluation: await this.myEvaluationUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Put(':id/evaluations/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chấm mức hoàn thành 0–100',
    description:
      'Người tạo, coordinator, Admin; chỉ ở Tổng kết; chỉ người tham gia (đăng ký tham gia, tuyển người, cộng tác viên). Chấm lại = lần chấm mới, giữ lịch sử.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityEvaluationResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharitySummaryNotOpenException,
    CharityEvaluationTargetInvalidException,
  )
  public async evaluate(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectUserParamsDto,
    @Body() body: CharityEvaluationBodyDto,
  ) {
    return ok({
      evaluation: await this.evaluateUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        participantId: params.userId,
        completionScore: body.evaluation.completionScore,
        note: body.evaluation.note ?? null,
      }),
    });
  }

  @Patch(':id/contributions/:contributionId/public-name')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Hiện / ẩn tên tôi trong danh sách người ủng hộ (một đóng góp)',
    description:
      'Chỉ chính người góp. `show: null` = theo cài đặt chung `showInPublicSupporterLists`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityUpdatedResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityContributionNotFoundException)
  public async contributionPublicName(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectContributionParamsDto,
    @Body() body: CharityPublicNameBodyDto,
  ) {
    return ok(
      await this.publicNameUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        contributionId: params.contributionId,
        show: body.publicName.show ?? null,
      }),
    );
  }

  @Patch(':id/participation/public-name')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Hiện / ẩn tên tôi trong danh sách người tham gia',
    description: 'Đăng ký tham gia còn hiệu lực của chính mình.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityUpdatedResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityNotRegisteredException)
  public async participationPublicName(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityPublicNameBodyDto,
  ) {
    return ok(
      await this.publicNameUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        contributionId: null,
        show: body.publicName.show ?? null,
      }),
    );
  }

  @Post(':id/promotion-request')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đề xuất lên card Home',
    description:
      'Người tạo đề xuất; Admin mới bật/tắt (`PATCH /admin/charity-campaigns/:id/promotion`). Body có thể trống.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPromotionResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityProjectNotApprovedException,
  )
  public async requestPromotion(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityPromotionRequestBodyDto,
  ) {
    return ok({
      promotion: await this.promotionRequestUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        note: body?.promotion?.note ?? null,
      }),
    });
  }
}

@ApiTags('Admin - Dự án từ thiện')
@ApiBearerAuth()
@Controller('admin/charity-campaigns')
export class AdminCharityPromotionController {
  public constructor(
    @Inject(ISetCharityPromotionUseCase)
    private readonly promotionUseCase: ISetCharityPromotionUseCase,
  ) {}

  @Patch(':id/promotion')
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Bật / tắt card Home của một dự án',
    description:
      'Bật cần `featuredTitle` + `featuredCta`. Khung giờ `featuredFrom`/`featuredUntil` (bỏ trống = không giới hạn), `featuredPriority` cao hơn đứng trước. Có lý do, ghi audit.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPromotionResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    CharityCampaignNotFoundException,
  )
  public async setPromotion(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityPromotionSetBodyDto,
  ) {
    const promotion = body.promotion;
    return ok({
      promotion: await this.promotionUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        reason: promotion.reason,
        promotion: {
          featuredOnHome: promotion.featuredOnHome,
          featuredTitle: promotion.featuredTitle ?? null,
          featuredMessage: promotion.featuredMessage ?? null,
          featuredMediaUrl: promotion.featuredMediaUrl ?? null,
          featuredCta: promotion.featuredCta ?? null,
          featuredFrom: promotion.featuredFrom ?? null,
          featuredUntil: promotion.featuredUntil ?? null,
          featuredPriority: promotion.featuredPriority ?? 0,
        },
      }),
    });
  }
}

@ApiTags('Dự án từ thiện 4 giai đoạn')
@Controller('home')
export class CharityHomeController {
  public constructor(
    @Inject(IListCharityHomeCardsUseCase)
    private readonly cardsUseCase: IListCharityHomeCardsUseCase,
  ) {}

  @Get('charity-cards')
  @Public()
  @ApiOperation({
    summary: 'Card quảng bá dự án từ thiện trên Home',
    description:
      'Card ngắn Admin bật, đang trong khung giờ, dự án còn chạy. Không trả hồ sơ dự án — bấm vào thì mở `GET /charity-campaigns/:slug/public`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityHomeCardsResponseDto) })
  public async cards(@Query() query: CharityHomeCardsQueryDto) {
    return ok({
      cards: await this.cardsUseCase.handle({ limit: query.limit ?? 5 }),
    });
  }
}
