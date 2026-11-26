import {
  ICompleteCharityMoneyPledgeUseCase,
  IDeclareCharityMoneyPledgeUseCase,
  IListCharityMoneyPledgesUseCase,
  IListMyCharityMoneyPledgesUseCase,
  IManageCharityMoneyPledgesUseCase,
  ISetCharityMoneyPledgeHiddenUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityCampaignNotFoundException,
  CharityContributionTypeDisabledException,
  CharityFundingNeedNotFoundException,
  CharityIntakeClosedException,
  CharityMoneyPledgeAlreadyCompletedException,
  CharityMoneyPledgeAlreadyHiddenException,
  CharityMoneyPledgeLockedException,
  CharityMoneyPledgeNotFoundException,
  CharityMoneyPledgeNotHiddenException,
  CharityMoneyPledgeSelfException,
  CharityNotAcceptingContributionsException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityReceivingAccountRequiredException,
  TooManyRequestsException,
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
  CharityManagedMoneyPledgeResponseDto,
  CharityManagedMoneyPledgesResponseDto,
  CharityMoneyPledgeListQueryDto,
  CharityMoneyPledgeParamsDto,
  CharityMyMoneyPledgeResponseDto,
  CharityMyMoneyPledgesResponseDto,
  CharityPublicMoneyPledgesResponseDto,
  DeclareCharityMoneyPledgeBodyDto,
  DeclareCharityMoneyPledgeResponseDto,
  HideCharityMoneyPledgeBodyDto,
  MyCharityMoneyPledgesQueryDto,
} from '../../dto/charity-campaign/charity-money-pledge.dto';
import {
  CharityProjectIdOrSlugParamsDto,
  CharityProjectParamsDto,
} from '../../dto/charity-campaign/charity-project.dto';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();
const CursorError: [typeof ValidationFailedException, string[]] = [
  ValidationFailedException,
  ['cursor: không hợp lệ'],
];
const HideErrors = [
  CharityMoneyPledgeNotFoundException,
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityMoneyPledgeLockedException,
] as const;

/**
 * Đăng ký ủng hộ tiền theo chiến dịch (CR 25/11/2026,
 * docs/plans/2026-11-25-charity-money-pledges.md; API.md §18.9).
 */
@ApiTags('Dự án từ thiện — ủng hộ tiền')
@Controller('charity-campaigns')
export class CharityCampaignMoneyPledgeController {
  public constructor(
    @Inject(IDeclareCharityMoneyPledgeUseCase)
    private readonly declareCharityMoneyPledgeUseCase: IDeclareCharityMoneyPledgeUseCase,
    @Inject(IListCharityMoneyPledgesUseCase)
    private readonly listCharityMoneyPledgesUseCase: IListCharityMoneyPledgesUseCase,
    @Inject(IManageCharityMoneyPledgesUseCase)
    private readonly manageCharityMoneyPledgesUseCase: IManageCharityMoneyPledgesUseCase,
  ) {}

  @Post(':id/money-pledges')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Khai đăng ký ủng hộ tiền',
    description:
      'Lời khai `INTENDED`, kèm `transfer` (tài khoản nhận đang hiệu lực, số tiền, nội dung chuyển khoản `CT <mã>`, `vietQrUrl` nếu tài khoản có BIN). App không giữ tiền: người ủng hộ chuyển thẳng vào tài khoản nhận rồi gọi `PATCH /charity-money-pledges/:pledgeId/complete`. Điều kiện: dự án đã duyệt, đang công khai, chưa đóng/đình chỉ/tổng kết; nhận `MONEY`; trước `intakeEndsAt`; có tài khoản nhận; không phải chủ dự án/điều phối viên. `fundingNeedId` (tuỳ chọn) phải là khoản tiền `OPEN`. Tối đa 10 lời khai / giờ / người.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(DeclareCharityMoneyPledgeResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotAcceptingContributionsException,
    [CharityContributionTypeDisabledException, 'MONEY'],
    CharityIntakeClosedException,
    CharityMoneyPledgeSelfException,
    CharityFundingNeedNotFoundException,
    CharityReceivingAccountRequiredException,
    [TooManyRequestsException, 3_600],
    [
      ValidationFailedException,
      ['pledge.pledgedAmount: số nguyên VNĐ từ 1.000 đến 10.000.000.000'],
    ],
  )
  public async declareCharityMoneyPledge(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: DeclareCharityMoneyPledgeBodyDto,
  ) {
    return ok(
      await this.declareCharityMoneyPledgeUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        pledge: body.pledge,
      }),
    );
  }

  @Get(':idOrSlug/money-pledges')
  @Public()
  @ApiOperation({
    summary: 'Danh sách người đăng ký ủng hộ tiền (công khai)',
    description:
      'Ai cũng xem được. Mỗi dòng: người ủng hộ (`null` = "Ẩn danh"), khoản tiền, số tiền, trạng thái lời khai, mốc khai/báo chuyển. Không có ghi chú, nội dung chuyển khoản. Lời khai bị chủ dự án ẩn không hiện. Mới nhất trước, phân trang bằng `cursor`.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityPublicMoneyPledgesResponseDto),
  })
  @ApiErrorResponses(CharityCampaignNotFoundException, CursorError)
  public async listCharityMoneyPledges(
    @Param() params: CharityProjectIdOrSlugParamsDto,
    @Query() query: CharityMoneyPledgeListQueryDto,
  ) {
    return ok(
      await this.listCharityMoneyPledgesUseCase.handle({
        idOrSlug: params.idOrSlug,
        fundingNeedId: query.fundingNeedId ?? null,
        status: query.status ?? null,
        cursor: query.cursor ?? null,
        limit: query.limit ?? 20,
      }),
    );
  }

  @Get(':id/money-pledges/manage')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách người đăng ký ủng hộ tiền (ban tổ chức)',
    description:
      'Như bản công khai, thêm `note`, `transferContent`, tài khoản nhận lúc khai và lời khai đang bị ẩn (`hiddenAt`, `hiddenReason`) để đối chiếu sao kê. Người tạo, điều phối viên, Admin `campaign.read`.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityManagedMoneyPledgesResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CursorError,
  )
  public async manageCharityMoneyPledges(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Query() query: CharityMoneyPledgeListQueryDto,
  ) {
    return ok(
      await this.manageCharityMoneyPledgesUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        fundingNeedId: query.fundingNeedId ?? null,
        status: query.status ?? null,
        cursor: query.cursor ?? null,
        limit: query.limit ?? 20,
      }),
    );
  }
}

/** Thao tác trên một lời khai: báo đã chuyển (người khai), ẩn/bỏ ẩn (ban tổ chức), lịch sử của tôi. */
@ApiTags('Dự án từ thiện — ủng hộ tiền')
@ApiBearerAuth()
@Controller('charity-money-pledges')
export class CharityMoneyPledgeController {
  public constructor(
    @Inject(ICompleteCharityMoneyPledgeUseCase)
    private readonly completeCharityMoneyPledgeUseCase: ICompleteCharityMoneyPledgeUseCase,
    @Inject(IListMyCharityMoneyPledgesUseCase)
    private readonly listMyCharityMoneyPledgesUseCase: IListMyCharityMoneyPledgesUseCase,
    @Inject(ISetCharityMoneyPledgeHiddenUseCase)
    private readonly setCharityMoneyPledgeHiddenUseCase: ISetCharityMoneyPledgeHiddenUseCase,
  ) {}

  // Route tĩnh khai TRƯỚC `:pledgeId`.
  @Get('me')
  @ApiOperation({
    summary: 'Lời khai ủng hộ tiền của tôi',
    description:
      'Mọi chiến dịch, hoặc lọc `campaignId`. Kèm `transfer` để mở lại màn chuyển khoản, và `hiddenAt`/`hiddenReason` nếu chủ dự án đã ẩn. Mới nhất trước.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityMyMoneyPledgesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CursorError)
  public async listMyCharityMoneyPledges(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: MyCharityMoneyPledgesQueryDto,
  ) {
    return ok(
      await this.listMyCharityMoneyPledgesUseCase.handle({
        userId: principal.userId,
        campaignId: query.campaignId ?? null,
        cursor: query.cursor ?? null,
        limit: query.limit ?? 20,
      }),
    );
  }

  @Patch(':pledgeId/complete')
  @ApiOperation({
    summary: 'Báo đã chuyển',
    description:
      '`INTENDED → COMPLETED`. Vẫn là LỜI KHAI — hệ thống không xác minh. Chỉ người khai; sau khi dự án kết thúc (công bố tổng kết) thì không báo được nữa.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityMyMoneyPledgeResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityMoneyPledgeNotFoundException,
    CharityMoneyPledgeAlreadyCompletedException,
    CharityMoneyPledgeLockedException,
  )
  public async completeCharityMoneyPledge(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityMoneyPledgeParamsDto,
  ) {
    return ok({
      pledge: await this.completeCharityMoneyPledgeUseCase.handle({
        userId: principal.userId,
        pledgeId: params.pledgeId,
      }),
    });
  }

  @Patch(':pledgeId/hide')
  @ApiOperation({
    summary: 'Ẩn lời khai vô lý (ban tổ chức)',
    description:
      'Chủ dự án, điều phối viên (hoặc Admin `campaign.manage`). Lời khai bị ẩn không công khai, không tính tổng, không tính người đóng góp, không cộng điểm. Người khai nhận thông báo `CHARITY_MONEY_PLEDGE_HIDDEN` kèm lý do. Chỉ trước khi dự án kết thúc.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityManagedMoneyPledgeResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...HideErrors,
    CharityMoneyPledgeAlreadyHiddenException,
  )
  public async hideCharityMoneyPledge(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityMoneyPledgeParamsDto,
    @Body() body: HideCharityMoneyPledgeBodyDto,
  ) {
    return ok({
      pledge: await this.setCharityMoneyPledgeHiddenUseCase.handle({
        userId: principal.userId,
        pledgeId: params.pledgeId,
        hidden: true,
        reason: body?.hide?.reason ?? null,
      }),
    });
  }

  @Patch(':pledgeId/unhide')
  @ApiOperation({
    summary: 'Bỏ ẩn lời khai (ban tổ chức)',
    description:
      'Người khai nhận thông báo `CHARITY_MONEY_PLEDGE_UNHIDDEN`. Chỉ trước khi dự án kết thúc.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityManagedMoneyPledgeResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...HideErrors,
    CharityMoneyPledgeNotHiddenException,
  )
  public async unhideCharityMoneyPledge(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityMoneyPledgeParamsDto,
  ) {
    return ok({
      pledge: await this.setCharityMoneyPledgeHiddenUseCase.handle({
        userId: principal.userId,
        pledgeId: params.pledgeId,
        hidden: false,
        reason: null,
      }),
    });
  }
}
