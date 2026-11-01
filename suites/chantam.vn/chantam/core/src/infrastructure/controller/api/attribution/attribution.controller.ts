import {
  IClaimAttributionUseCase,
  ICreateAttributionLinkUseCase,
  IListAttributionClaimsUseCase,
  IRecordAttributionClickUseCase,
  IResolveAttributionUseCase,
  IReviewAttributionClaimUseCase,
  IRevokeAttributionLinksUseCase,
} from '@/application/contracts/attribution';
import {
  AttributionAlreadyClaimedException,
  AttributionClaimAlreadyReviewedException,
  AttributionClaimNotFoundException,
  AttributionLinkNotFoundException,
  AttributionNotConfiguredException,
  AttributionNotEligibleException,
  AttributionReferrerExistsException,
  AttributionSelfReferralException,
  AttributionTargetNotFoundException,
  AttributionTokenExpiredException,
  AttributionTokenInvalidException,
  AttributionTokenRevokedException,
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
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AttributionClaimParamsDto,
  ClaimAttributionBodyDto,
  ClaimAttributionResponseDto,
  CreateAttributionLinkBodyDto,
  CreateAttributionLinkResponseDto,
  ListAttributionClaimsQueryDto,
  ListAttributionClaimsResponseDto,
  RecordAttributionClickBodyDto,
  RecordAttributionClickResponseDto,
  ResolveAttributionBodyDto,
  ResolveAttributionResponseDto,
  ReviewAttributionClaimBodyDto,
  ReviewAttributionClaimResponseDto,
  RevokeAttributionLinksBodyDto,
  RevokeAttributionLinksResponseDto,
} from '../../dto/attribution/attribution.dto';
import { RequiresPermission } from '../../guards';

/**
 * Deferred attribution: link giới thiệu sống sót qua bước cài app.
 *
 * Bốn bước: người giới thiệu tạo link → landing ghi lượt mở và nhận token → app mới cài
 * resolve token → app claim sau khi đăng ký. Không bước nào phát thưởng: claim chỉ ghi quan
 * hệ giới thiệu; thưởng trả khi người được mời hoàn tất onboarding, như giới thiệu bằng mã.
 * IP, User-Agent và mạng không bao giờ là khoá attribution — chỉ là tín hiệu chống gian lận.
 */
@ApiTags('Link giới thiệu (deferred attribution)')
@Controller('attribution')
export class AttributionController {
  public constructor(
    @Inject(ICreateAttributionLinkUseCase)
    private readonly createLinkUseCase: ICreateAttributionLinkUseCase,
    @Inject(IRecordAttributionClickUseCase)
    private readonly recordClickUseCase: IRecordAttributionClickUseCase,
    @Inject(IResolveAttributionUseCase)
    private readonly resolveUseCase: IResolveAttributionUseCase,
    @Inject(IClaimAttributionUseCase)
    private readonly claimUseCase: IClaimAttributionUseCase,
  ) {}

  @Post('links')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo link giới thiệu',
    description:
      'Người giới thiệu là người gọi (từ token đăng nhập). Đích tuỳ chọn: bài (`share.shareCode`), hồ sơ/người dùng (username), mời nhóm (mã mời). ' +
      'Link đang sống y hệt thì trả lại (`created: false`). URL dạng `https://chantam.vn/a/{code}`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CreateAttributionLinkResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['link: targetType và targetValue phải cùng có hoặc cùng bỏ trống'],
    ],
    AttributionTargetNotFoundException,
    [TooManyRequestsException, 60],
  )
  public async createLink(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateAttributionLinkBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createLinkUseCase.handle({
          userId: principal.userId,
          link: body.link,
        }),
      )
      .build();
  }

  @Post('clicks')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Landing ghi lượt mở link, nhận token',
    description:
      'Gọi từ trang `chantam.vn/a/{code}`. Mỗi lượt mở một token riêng (14 ngày). Landing đặt token vào `…/dl?t=<token>` và CHỈ copy vào clipboard khi người dùng bấm nút "Tải/Mở ứng dụng". ' +
      'Trả kèm người giới thiệu (không có id) và deep link để landing hiển thị. Có rate limit theo IP.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(RecordAttributionClickResponseDto),
  })
  @ApiErrorResponses(
    AttributionLinkNotFoundException,
    AttributionTokenRevokedException,
    AttributionNotConfiguredException,
    [TooManyRequestsException, 60],
  )
  public async recordClick(
    @Body() body: RecordAttributionClickBodyDto,
    @Ip() clientIp: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.recordClickUseCase.handle({
          code: body.click.code,
          clientIp,
          userAgent: userAgent ?? null,
        }),
      )
      .build();
  }

  @Post('resolve')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'App mới cài resolve token từ clipboard',
    description:
      'Không cần đăng nhập. Chuỗi không phải token của hệ thống (hoặc chữ ký sai) trả `matched: false`. ' +
      'Token thật nhưng hết hạn → `ATTRIBUTION_TOKEN_EXPIRED`; link bị thu hồi → `ATTRIBUTION_TOKEN_REVOKED`; dán nhầm claim token → `ATTRIBUTION_TOKEN_INVALID`. ' +
      'Cùng token + cùng `installId` gọi lại ra đúng kết quả cũ. Không dùng IP làm định danh: đổi Wi-Fi/4G/VPN không ảnh hưởng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ResolveAttributionResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['installId must be a UUID']],
    AttributionTokenInvalidException,
    AttributionTokenExpiredException,
    AttributionTokenRevokedException,
    AttributionNotConfiguredException,
    [TooManyRequestsException, 60],
  )
  public async resolve(
    @Body() body: ResolveAttributionBodyDto,
    @Ip() clientIp: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.resolveUseCase.handle({ ...body, clientIp }))
      .build();
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gắn người giới thiệu cho tài khoản vừa đăng ký',
    description:
      'Gọi ngay sau đăng ký với claim token từ resolve. Chỉ nhận tài khoản tạo trong 7 ngày và chưa hoàn tất onboarding. ' +
      'Gọi lại bởi đúng người đã claim → `claimed: true` (idempotent, kể cả khi token đã quá hạn); người khác → `ATTRIBUTION_ALREADY_CLAIMED`. ' +
      '**Không phát thưởng**: người giới thiệu được thưởng khi người được mời hoàn tất onboarding.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ClaimAttributionResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    AttributionTokenInvalidException,
    AttributionTokenExpiredException,
    AttributionTokenRevokedException,
    AttributionAlreadyClaimedException,
    AttributionReferrerExistsException,
    AttributionSelfReferralException,
    AttributionNotEligibleException,
    AttributionNotConfiguredException,
    [TooManyRequestsException, 60],
  )
  public async claim(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: ClaimAttributionBodyDto,
    @Ip() clientIp: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.claimUseCase.handle({
          userId: principal.userId,
          attributionToken: body.attributionToken,
          clientIp,
        }),
      )
      .build();
  }
}

@ApiTags('Admin - Link giới thiệu')
@ApiBearerAuth()
@Controller('admin/attribution')
export class AdminAttributionController {
  public constructor(
    @Inject(IListAttributionClaimsUseCase)
    private readonly listClaimsUseCase: IListAttributionClaimsUseCase,
    @Inject(IReviewAttributionClaimUseCase)
    private readonly reviewClaimUseCase: IReviewAttributionClaimUseCase,
    @Inject(IRevokeAttributionLinksUseCase)
    private readonly revokeLinksUseCase: IRevokeAttributionLinksUseCase,
  ) {}

  @Get('claims')
  // Cùng quyền với hàng đợi xem xét giới thiệu (`GET /admin/referrals/review`): cùng một việc.
  @RequiresPermission('report.read')
  @ApiOperation({
    summary: 'Các lượt claim link giới thiệu',
    description:
      'Mới nhất trước. Lọc `riskStatus=PENDING_REVIEW` để ra hàng đợi chờ duyệt — claim vướng tín hiệu gian lận chưa được ghi quan hệ giới thiệu.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAttributionClaimsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listClaims(@Query() query: ListAttributionClaimsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.listClaimsUseCase.handle({ ...query }))
      .build();
  }

  @Post('claims/:claimId/review')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('report.resolve')
  @ApiOperation({
    summary: 'Duyệt một claim đang chờ',
    description:
      '`APPROVE` ghi quan hệ giới thiệu (thưởng vẫn chờ onboarding). `REJECT` thì không bao giờ ghi. Ghi audit log Admin.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ReviewAttributionClaimResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    AttributionClaimNotFoundException,
    AttributionClaimAlreadyReviewedException,
    AttributionReferrerExistsException,
  )
  public async reviewClaim(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AttributionClaimParamsDto,
    @Body() body: ReviewAttributionClaimBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.reviewClaimUseCase.handle({
          reviewerId: principal.userId,
          claimId: params.claimId,
          decision: body.review.decision,
          note: body.review.note,
        }),
      )
      .build();
  }

  @Post('revocations')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('report.resolve')
  @ApiOperation({
    summary: 'Thu hồi link giới thiệu',
    description:
      'Theo đúng một tiêu chí: một link (`linkCode`), cả chiến dịch (`campaign`), hoặc mọi link của một người (`referrerUserId`). ' +
      'Token đã phát từ link bị thu hồi trả `ATTRIBUTION_TOKEN_REVOKED` ở resolve và claim mới. Claim đã ghi trước đó không bị gỡ.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(RevokeAttributionLinksResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['revocation: cần đúng một trong linkCode, campaign hoặc referrerUserId'],
    ],
  )
  public async revoke(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RevokeAttributionLinksBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.revokeLinksUseCase.handle({
          actorId: principal.userId,
          revocation: body.revocation,
        }),
      )
      .build();
  }
}
