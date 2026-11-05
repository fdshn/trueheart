import {
  IAddCharityBankAccountUseCase,
  ICancelCharityVolunteerUseCase,
  ICloseCharityBankAccountUseCase,
  IConfirmCharityVolunteerUseCase,
  IGetCharityPublicProjectUseCase,
  IGetCharityWorkspaceUseCase,
  IMoveCharityStageUseCase,
  IPublishCharitySectionUseCase,
  IRegisterCharityVolunteerUseCase,
  IReplaceCharityCustomSectionsUseCase,
  IReplaceCharityPartiesUseCase,
  IReplaceCharityPhasesUseCase,
  IReplaceCharityTeamUseCase,
  ISaveCharityFundingNeedUseCase,
  ISaveCharitySectionUseCase,
  ISaveCharityVolunteerNeedUseCase,
  ISetCharityLimitsUseCase,
  ISubmitCharityProjectUseCase,
  IUpdateCharityItemNeedUseCase,
  IUpdateCharityProfileUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityBankAccountLimitException,
  CharityBankAccountNotFoundException,
  CharityCampaignCreateNotAllowedException,
  CharityCampaignNotFoundException,
  CharityFundingNeedNotFoundException,
  CharityNeedItemInvalidException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotDraftException,
  CharitySectionEmptyException,
  CharityStageScheduleConflictException,
  CharityStageTransitionInvalidException,
  CharityVolunteerClosedException,
  CharityVolunteerNeedNotFoundException,
  CharityVolunteerRegistrationNotFoundException,
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
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CharityCampaignWrapperResponseDto } from '../../dto/charity-campaign/charity-campaign.dto';
import {
  CharityBankAccountBodyDto,
  CharityBankAccountResponseDto,
  CharityCloseBodyDto,
  CharityCustomSectionsBodyDto,
  CharityCustomSectionsResponseDto,
  CharityFundingNeedBodyDto,
  CharityFundingNeedResponseDto,
  CharityItemNeedBodyDto,
  CharityItemNeedResponseDto,
  CharityLimitsBodyDto,
  CharityPartiesBodyDto,
  CharityPartiesResponseDto,
  CharityPhasesBodyDto,
  CharityPhasesResponseDto,
  CharityProfileBodyDto,
  CharityProfileResponseDto,
  CharityProjectAccountParamsDto,
  CharityProjectFundingParamsDto,
  CharityProjectIdOrSlugParamsDto,
  CharityProjectNeedItemParamsDto,
  CharityProjectParamsDto,
  CharityProjectSectionParamsDto,
  CharityProjectVolunteerParamsDto,
  CharityProjectVolunteerUserParamsDto,
  CharityPublicProjectResponseDto,
  CharitySectionResponseDto,
  CharityStageMoveBodyDto,
  CharityTeamBodyDto,
  CharityTeamResponseDto,
  CharityVolunteerNeedBodyDto,
  CharityVolunteerNeedResponseDto,
  CharityVolunteerRegistrationBodyDto,
  CharityWorkspaceResponseDto,
} from '../../dto/charity-campaign/charity-project.dto';
import { RequiresPermission } from '../../guards';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();
const ProjectErrors = [
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
] as const;

/**
 * Dự án từ thiện 4 giai đoạn — đợt 1 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.1, §3.2,
 * §3.11, §3.12; API.md §18). Workspace cho ban tổ chức, bản công khai cho người xem.
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@Controller('charity-campaigns')
export class CharityProjectController {
  public constructor(
    @Inject(ISubmitCharityProjectUseCase)
    private readonly submitUseCase: ISubmitCharityProjectUseCase,
    @Inject(IMoveCharityStageUseCase)
    private readonly stageUseCase: IMoveCharityStageUseCase,
    @Inject(IGetCharityWorkspaceUseCase)
    private readonly workspaceUseCase: IGetCharityWorkspaceUseCase,
    @Inject(IGetCharityPublicProjectUseCase)
    private readonly publicUseCase: IGetCharityPublicProjectUseCase,
    @Inject(IUpdateCharityProfileUseCase)
    private readonly profileUseCase: IUpdateCharityProfileUseCase,
    @Inject(IReplaceCharityPartiesUseCase)
    private readonly partiesUseCase: IReplaceCharityPartiesUseCase,
    @Inject(IAddCharityBankAccountUseCase)
    private readonly addBankUseCase: IAddCharityBankAccountUseCase,
    @Inject(ICloseCharityBankAccountUseCase)
    private readonly closeBankUseCase: ICloseCharityBankAccountUseCase,
    @Inject(IReplaceCharityTeamUseCase)
    private readonly teamUseCase: IReplaceCharityTeamUseCase,
    @Inject(IReplaceCharityPhasesUseCase)
    private readonly phasesUseCase: IReplaceCharityPhasesUseCase,
    @Inject(IUpdateCharityItemNeedUseCase)
    private readonly itemNeedUseCase: IUpdateCharityItemNeedUseCase,
    @Inject(ISaveCharityFundingNeedUseCase)
    private readonly fundingUseCase: ISaveCharityFundingNeedUseCase,
    @Inject(ISaveCharityVolunteerNeedUseCase)
    private readonly volunteerUseCase: ISaveCharityVolunteerNeedUseCase,
    @Inject(IRegisterCharityVolunteerUseCase)
    private readonly registerUseCase: IRegisterCharityVolunteerUseCase,
    @Inject(ICancelCharityVolunteerUseCase)
    private readonly cancelUseCase: ICancelCharityVolunteerUseCase,
    @Inject(IConfirmCharityVolunteerUseCase)
    private readonly confirmUseCase: IConfirmCharityVolunteerUseCase,
    @Inject(ISaveCharitySectionUseCase)
    private readonly saveSectionUseCase: ISaveCharitySectionUseCase,
    @Inject(IPublishCharitySectionUseCase)
    private readonly publishSectionUseCase: IPublishCharitySectionUseCase,
    @Inject(IReplaceCharityCustomSectionsUseCase)
    private readonly customUseCase: IReplaceCharityCustomSectionsUseCase,
  ) {}

  @Get(':idOrSlug/public')
  @Public()
  @ApiOperation({
    summary: 'Bản công khai của dự án',
    description:
      'Dự án đã duyệt, đang chạy hoặc ĐÃ ĐÓNG (tổng kết xem được sau khi đóng); đình chỉ thì `404`. Có `changedFields` (field công khai đã sửa sau duyệt — tô đỏ), `counters`, `isFollowing`. Mục chưa công khai trả `published: false` (chưa cập nhật), không lộ nháp. Nhu cầu hiện vật/tiền/người là số SỐNG; chỉ tài khoản nhận ĐANG hiệu lực; không có SĐT người nhận hàng hay thông tin riêng tư người thụ hưởng. Gửi kèm token thì có `myVolunteerRegistrations`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPublicProjectResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async getPublic(
    @Param() params: CharityProjectIdOrSlugParamsDto,
    @CurrentUser() principal?: IAuthPrincipal,
  ) {
    return ok({
      project: await this.publicUseCase.handle({
        idOrSlug: params.idOrSlug,
        userId: principal?.userId ?? null,
      }),
    });
  }

  @Get(':id/workspace')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Workspace ban tổ chức',
    description:
      'Toàn bộ hồ sơ, nháp, nhu cầu, đăng ký tham gia, nhật ký giai đoạn, trạng thái từng mục A/B/C/D và capabilities. Người tạo, coordinator, Admin `campaign.read`. Thông tin riêng tư người thụ hưởng chỉ người tạo và Admin thấy.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityWorkspaceResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async workspace(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      workspace: await this.workspaceUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gửi duyệt bản nháp',
    description:
      'Chỉ người tạo. Có capability `PUBLISH_CHARITY_WITHOUT_REVIEW` thì công khai ngay và sang giai đoạn Triển khai; không thì vào hàng đợi Admin.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityProjectNotDraftException,
    CharityCampaignCreateNotAllowedException,
  )
  public async submit(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      campaign: await this.submitUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Post(':id/stage')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chuyển giai đoạn',
    description:
      'Người tạo, coordinator, Admin. Tiến đúng một bước (sớm hơn lịch) hoặc lùi — luôn bắt buộc `reason` và báo người bị ảnh hưởng (chốt 05/11). Lùi thì lịch tiến độ không được đẩy dự án tới lại ngay (`CHARITY_STAGE_SCHEDULE_CONFLICT` — sửa bước trao trước). Không về Kế hoạch.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    [CharityStageTransitionInvalidException, 'chỉ tiến từng bước một'],
    CharityStageScheduleConflictException,
  )
  public async stage(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityStageMoveBodyDto,
  ) {
    return ok({
      campaign: await this.stageUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        to: body.stage.to,
        reason: body.stage.reason ?? null,
      }),
    });
  }

  @Put(':id/profile')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lời kêu gọi và loại kêu gọi tham gia',
    description: 'Bỏ trống = giữ nguyên; `null` = xoá.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityProfileResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors)
  public async profile(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityProfileBodyDto,
  ) {
    return ok({
      profile: await this.profileUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        profile: body.profile,
      }),
    });
  }

  @Put(':id/parties')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thay danh sách đơn vị liên quan',
    description:
      'Tổ chức, thụ hưởng, cấp phép, truyền thông. Dòng có `partyId` được giữ id. Người thụ hưởng của kêu gọi cá nhân KHÔNG sửa ở đây (dùng `PUT :id/beneficiary`).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPartiesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors, [
    ValidationFailedException,
    [
      'parties[0].beneficiaryKind: bắt buộc với BENEFICIARY, bỏ trống với vai khác',
    ],
  ])
  public async parties(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityPartiesBodyDto,
  ) {
    return ok({
      parties: await this.partiesUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        parties: body.parties.map((party) => ({
          partyId: party.partyId ?? null,
          role: party.role,
          name: party.name,
          address: party.address ?? null,
          phone: party.phone ?? null,
          email: party.email ?? null,
          hotline: party.hotline ?? null,
          picName: party.picName ?? null,
          picPhone: party.picPhone ?? null,
          picUserId: party.picUserId ?? null,
          beneficiaryKind: party.beneficiaryKind ?? null,
          evidenceUrls: party.evidenceUrls ?? [],
        })),
      }),
    });
  }

  @Post(':id/bank-accounts')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thêm (hoặc thay) tài khoản nhận',
    description:
      'Có phiên bản: không sửa số tài khoản tại chỗ. Thay = gửi `replacesAccountId` — đóng tài khoản cũ và tạo tài khoản mới trong một lượt. Giới hạn số tài khoản ĐANG hiệu lực theo cấu hình Admin (`charity.max_bank_accounts_per_campaign`, ghi đè từng dự án).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityBankAccountResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    [CharityBankAccountLimitException, 2],
    CharityBankAccountNotFoundException,
  )
  public async addBankAccount(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityBankAccountBodyDto,
  ) {
    const input = body.bankAccount;
    return ok({
      bankAccount: await this.addBankUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        account: {
          label: input.label ?? null,
          bankName: input.bankName,
          accountNo: input.accountNo,
          accountName: input.accountName,
        },
        replacesAccountId: input.replacesAccountId ?? null,
        replaceReason: input.replaceReason ?? null,
      }),
    });
  }

  @Post(':id/bank-accounts/:accountId/close')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đóng tài khoản nhận',
    description: 'Giữ lịch sử; bản công khai không còn hiện.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityBankAccountNotFoundException,
  )
  public async closeBankAccount(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectAccountParamsDto,
    @Body() body: CharityCloseBodyDto,
  ) {
    return ok(
      await this.closeBankUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        accountId: params.accountId,
        reason: body.close.reason,
      }),
    );
  }

  @Put(':id/team')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thay ban tổ chức (6 vai trò)',
    description: 'Thông tin công khai — khác quyền điều phối (`coordinators`).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityTeamResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors, [
    ValidationFailedException,
    ['team[0].userId: không tìm thấy tài khoản'],
  ])
  public async team(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityTeamBodyDto,
  ) {
    return ok({
      team: await this.teamUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        members: body.team.map((member) => ({
          memberId: member.memberId ?? null,
          role: member.role,
          displayName: member.displayName,
          address: member.address ?? null,
          phone: member.phone ?? null,
          email: member.email ?? null,
          position: member.position ?? null,
          userId: member.userId ?? null,
          bankAccountId: member.bankAccountId ?? null,
        })),
      }),
    });
  }

  @Put(':id/phases')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thay tiến độ 4 bước',
    description:
      'PLANNING → PREPARATION → DISTRIBUTION → REPORTING, không chồng thời gian. `DISTRIBUTION.startsAt` là mốc sang Sự kiện trao; `DISTRIBUTION.endsAt` là mốc sang Tổng kết.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPhasesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors, [
    ValidationFailedException,
    ['phases: PREPARATION bắt đầu trước khi PLANNING kết thúc'],
  ])
  public async phases(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityPhasesBodyDto,
  ) {
    return ok({
      phases: await this.phasesUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        phases: body.phases.map((phase) => ({
          phase: phase.phase,
          startsAt: phase.startsAt,
          endsAt: phase.endsAt,
          picName: phase.picName ?? null,
          picUserId: phase.picUserId ?? null,
          hotline: phase.hotline ?? null,
          deliveryMethod: phase.deliveryMethod ?? null,
          reportMode: phase.reportMode ?? null,
        })),
      }),
    });
  }

  @Patch(':id/item-needs/:needItemId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đơn giá, tình trạng, nguồn cung, tiếp nhận của một dòng hiện vật',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityItemNeedResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityNeedItemInvalidException,
  )
  public async itemNeed(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectNeedItemParamsDto,
    @Body() body: CharityItemNeedBodyDto,
  ) {
    const input = body.itemNeed;
    return ok({
      itemNeed: await this.itemNeedUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        needItemId: params.needItemId,
        profile: {
          unitPrice: input.unitPrice ?? null,
          estimatedValue: input.estimatedValue ?? null,
          itemCondition: input.itemCondition ?? null,
          conditionNote: input.conditionNote ?? null,
          supplySource: input.supplySource ?? null,
          intakeDeadline: input.intakeDeadline ?? null,
          dropoffAddress: input.dropoffAddress ?? null,
          deliveryInstruction: input.deliveryInstruction ?? null,
          receiverName: input.receiverName ?? null,
          receiverPhone: input.receiverPhone ?? null,
          intakeStatus: input.intakeStatus ?? 'OPEN',
        },
        targetQuantity: input.targetQuantity,
        surplusExplanation: input.surplusExplanation,
      }),
    });
  }

  @Post(':id/funding-needs')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thêm hạng mục kêu gọi tiền',
    description: 'App không giữ tiền — đây là hồ sơ minh bạch.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityFundingNeedResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors, [
    ValidationFailedException,
    [
      'fundingNeed.bankAccountId: phải là tài khoản ĐANG hiệu lực của dự án này',
    ],
  ])
  public async createFunding(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityFundingNeedBodyDto,
  ) {
    return ok({
      fundingNeed: await this.saveFunding(
        principal.userId,
        params.id,
        null,
        body,
      ),
    });
  }

  @Patch(':id/funding-needs/:fundingNeedId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa hạng mục kêu gọi tiền, ghi số đã nhận, đóng/mở',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityFundingNeedResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityFundingNeedNotFoundException,
  )
  public async updateFunding(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectFundingParamsDto,
    @Body() body: CharityFundingNeedBodyDto,
  ) {
    return ok({
      fundingNeed: await this.saveFunding(
        principal.userId,
        params.id,
        params.fundingNeedId,
        body,
      ),
    });
  }

  private saveFunding(
    userId: string,
    campaignId: string,
    fundingNeedId: string | null,
    body: CharityFundingNeedBodyDto,
  ) {
    const input = body.fundingNeed;
    return this.fundingUseCase.handle({
      userId,
      campaignId,
      fundingNeedId,
      need: {
        title: input.title,
        description: input.description ?? null,
        beneficiaryPartyId: input.beneficiaryPartyId ?? null,
        receivingUnit: input.receivingUnit ?? null,
        bankAccountId: input.bankAccountId ?? null,
        targetAmount: input.targetAmount,
        deadline: input.deadline ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
      confirmedAmount: input.confirmedAmount,
      externalAmount: input.externalAmount,
      status: input.status,
    });
  }

  @Post(':id/volunteer-needs')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm vị trí tuyển người' })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityVolunteerNeedResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors)
  public async createVolunteer(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityVolunteerNeedBodyDto,
  ) {
    return ok({
      volunteerNeed: await this.saveVolunteer(
        principal.userId,
        params.id,
        null,
        body,
      ),
    });
  }

  @Patch(':id/volunteer-needs/:volunteerNeedId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa vị trí tuyển người, đổi trạng thái OPEN/CLOSED/STARTED',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityVolunteerNeedResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityVolunteerNeedNotFoundException,
  )
  public async updateVolunteer(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectVolunteerParamsDto,
    @Body() body: CharityVolunteerNeedBodyDto,
  ) {
    return ok({
      volunteerNeed: await this.saveVolunteer(
        principal.userId,
        params.id,
        params.volunteerNeedId,
        body,
      ),
    });
  }

  private saveVolunteer(
    userId: string,
    campaignId: string,
    volunteerNeedId: string | null,
    body: CharityVolunteerNeedBodyDto,
  ) {
    const input = body.volunteerNeed;
    return this.volunteerUseCase.handle({
      userId,
      campaignId,
      volunteerNeedId,
      need: {
        title: input.title,
        description: input.description ?? null,
        requirements: input.requirements ?? null,
        neededCount: input.neededCount,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        locationLabel: input.locationLabel ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
      status: input.status,
    });
  }

  @Post(':id/volunteer-needs/:volunteerNeedId/registrations')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đăng ký tham gia một vị trí',
    description:
      'Cần ít nhất một đóng góp đã được ban tổ chức chấp nhận. Không nhận đăng ký mới từ khi bước trao bắt đầu. Đăng ký lại khi đang đăng ký là idempotent.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityVolunteerNeedNotFoundException,
    CharityVolunteerClosedException,
  )
  public async register(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectVolunteerParamsDto,
    @Body() body: CharityVolunteerRegistrationBodyDto,
  ) {
    return ok(
      await this.registerUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        volunteerNeedId: params.volunteerNeedId,
        note: body?.registration?.note ?? null,
      }),
    );
  }

  @Delete(':id/volunteer-needs/:volunteerNeedId/registrations/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Huỷ đăng ký của chính mình',
    description: 'Được cả khi sự kiện đang diễn ra.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityVolunteerRegistrationNotFoundException,
  )
  public async cancel(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectVolunteerParamsDto,
  ) {
    return ok(
      await this.cancelUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        volunteerNeedId: params.volunteerNeedId,
      }),
    );
  }

  @Post(':id/volunteer-needs/:volunteerNeedId/registrations/:userId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ban tổ chức xác nhận người tham gia' })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityVolunteerRegistrationNotFoundException,
  )
  public async confirm(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectVolunteerUserParamsDto,
  ) {
    return ok(
      await this.confirmUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        volunteerNeedId: params.volunteerNeedId,
        targetUserId: params.userId,
      }),
    );
  }

  @Put(':id/sections/:sectionKey')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lưu một mục (A/B/C/D)',
    description: 'Đánh dấu mục đã lưu (`READY`). Lưu KHÔNG tự công khai.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySectionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors)
  public async saveSection(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectSectionParamsDto,
  ) {
    return ok({
      section: await this.saveSectionUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        sectionKey: params.sectionKey,
      }),
    });
  }

  @Post(':id/sections/:sectionKey/publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Công khai một mục',
    description:
      'Chụp nội dung CÔNG KHAI của mục lúc này; bản công khai chỉ đọc bản chụp. Sửa sau đó chưa lộ ra cho tới khi công khai lại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharitySectionResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharitySectionEmptyException,
  )
  public async publishSection(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectSectionParamsDto,
  ) {
    return ok({
      section: await this.publishSectionUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        sectionKey: params.sectionKey,
      }),
    });
  }

  @Put(':id/custom-sections')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thay form mở (mục và trường tuỳ biến)',
    description:
      'Trường: TEXT, LONG_TEXT, NUMBER, DATE, SELECT, CHECKBOX, FILE, URL; hiển thị PUBLIC, PARTICIPANT, ORGANIZER_ONLY, ADMIN_ONLY.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityCustomSectionsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ProjectErrors, [
    ValidationFailedException,
    ['sections[0].fields[0].value: không hợp với kiểu NUMBER'],
  ])
  public async customSections(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityCustomSectionsBodyDto,
  ) {
    return ok({
      customSections: await this.customUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        sections: body.customSections.map((section) => ({
          parentSection: section.parentSection,
          title: section.title,
          visibility: section.visibility ?? 'PUBLIC',
          fields: section.fields.map((field) => ({
            label: field.label,
            fieldType: field.fieldType,
            visibility: field.visibility ?? 'PUBLIC',
            required: field.required ?? false,
            options: field.options ?? [],
            value: field.value ?? null,
          })),
        })),
      }),
    });
  }
}

@ApiTags('Admin - Dự án từ thiện')
@ApiBearerAuth()
@Controller('admin/charity-campaigns')
export class AdminCharityProjectController {
  public constructor(
    @Inject(ISetCharityLimitsUseCase)
    private readonly limitsUseCase: ISetCharityLimitsUseCase,
  ) {}

  @Patch(':id/limits')
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Ghi đè giới hạn của một dự án',
    description:
      '`maxBankAccounts`: số tài khoản nhận đang hiệu lực tối đa; `null` = theo `charity.max_bank_accounts_per_campaign`. Ghi audit log Admin.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    CharityCampaignNotFoundException,
  )
  public async limits(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityLimitsBodyDto,
  ) {
    return ok({
      limits: await this.limitsUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        maxBankAccounts: body.limits.maxBankAccounts ?? null,
        reason: body.limits.reason,
      }),
    });
  }
}
