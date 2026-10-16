import {
  ICancelCharityParticipationUseCase,
  ICloseCharityCampaignUseCase,
  ICreateCharityCampaignUseCase,
  IDecideCharityApprovalUseCase,
  IExtendCharityCampaignUseCase,
  IGetAdminCharityCampaignUseCase,
  IJoinCharityCampaignUseCase,
  IListAdminCharityCampaignsUseCase,
  IListCampaignContributionsUseCase,
  IListExternalContributionsUseCase,
  IListJoinedCharityCampaignsUseCase,
  IListMyCharityCampaignsUseCase,
  IManageCharityBeneficiaryUseCase,
  IManageCharityCoordinatorsUseCase,
  IRecordExternalContributionUseCase,
  IReplaceCharityMediaUseCase,
  IRequestCharityMediaUploadUseCase,
  IReviewCharityCampaignUseCase,
  ISetCharityCampaignActiveUseCase,
  ISubmitCharityContributionUseCase,
  IUpdateCharityProgressUseCase,
} from '@/application/contracts/charity-campaign';
import {
  CharityAlreadyRegisteredException,
  CharityApprovalAlreadyDecidedException,
  CharityBeneficiaryConsentRequiredException,
  CharityBeneficiaryNotApplicableException,
  CharityCampaignCreateNotAllowedException,
  CharityCampaignNotClosableException,
  CharityCampaignNotExtendableException,
  CharityCampaignNotFoundException,
  CharityCancelTooLateException,
  CharityCoordinatorNotAllowedException,
  CharityLinesInvalidException,
  CharityMediaInvalidException,
  CharityMediaNotEditableException,
  CharityNeedItemInvalidException,
  CharityNotAcceptingContributionsException,
  CharityNotOrganizerException,
  CharityNotRegisteredException,
  CharityParticipationClosedException,
  CharityReviewDuplicateException,
  CharityReviewNotPermittedException,
  CharityReviewTooEarlyException,
} from '@/domain/exceptions';
import { CharityApprovalStatus } from '@chantam.vn/chantam.core-lib/models';
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
  CharityBeneficiaryInputDto,
  CharityBeneficiaryResponseDto,
  CharityCampaignIdParamDto,
  CharityCampaignWrapperResponseDto,
  CharityContributionDto,
  CharityContributionPageDto,
  CharityCoordinatorListDto,
  CharityExternalContributionDto,
  CharityExternalContributionListDto,
  CloseCharityCampaignResponseDto,
  DecideCharityApprovalBodyDto,
  ExtendCharityCampaignBodyDto,
  ExtendCharityCampaignResponseDto,
  GrantCharityCoordinatorBodyDto,
  ListAdminCharityCampaignsQueryDto,
  ListCharityCampaignsQueryDto,
  ListCharityCampaignsResponseDto,
  ListContributionsQueryDto,
  RecordExternalContributionBodyDto,
  ReplaceCharityMediaBodyDto,
  RequestCharityMediaUploadBodyDto,
  RequestCharityMediaUploadResponseDto,
  ReviewCharityCampaignBodyDto,
  SetCharityCampaignActiveBodyDto,
  SubmitCharityContributionBodyDto,
  UpdateCharityProgressBodyDto,
  WriteCharityCampaignBodyDto,
} from '../../dto/charity-campaign/charity-campaign.dto';
import { RequiresPermission } from '../../guards';

/**
 * Đường CẦN token: tạo hồ sơ, đăng ký, huỷ, đánh giá, cập nhật tiến độ.
 *
 * ## Thứ tự route có nghĩa
 *
 * `mine` và `joined` phải khai TRƯỚC `:id/...`. Nest khớp theo thứ tự khai, nên đặt sau
 * thì `/charity-campaigns/mine` rơi vào `:id` và `@IsUUID()` trả 400 cho một đường hoàn
 * toàn đúng. `route-order-guard` canh điều này, nhưng chỗ dễ sai thì vẫn nên nói ra.
 */
@ApiTags('Hoạt động Từ thiện')
@ApiBearerAuth()
@Controller('charity-campaigns')
export class CharityCampaignController {
  public constructor(
    @Inject(ICreateCharityCampaignUseCase)
    private readonly createUseCase: ICreateCharityCampaignUseCase,
    @Inject(IListMyCharityCampaignsUseCase)
    private readonly listMineUseCase: IListMyCharityCampaignsUseCase,
    @Inject(IListJoinedCharityCampaignsUseCase)
    private readonly listJoinedUseCase: IListJoinedCharityCampaignsUseCase,
    @Inject(IJoinCharityCampaignUseCase)
    private readonly joinUseCase: IJoinCharityCampaignUseCase,
    @Inject(ICancelCharityParticipationUseCase)
    private readonly cancelUseCase: ICancelCharityParticipationUseCase,
    @Inject(IReviewCharityCampaignUseCase)
    private readonly reviewUseCase: IReviewCharityCampaignUseCase,
    @Inject(IUpdateCharityProgressUseCase)
    private readonly progressUseCase: IUpdateCharityProgressUseCase,
    @Inject(ISubmitCharityContributionUseCase)
    private readonly submitContributionUseCase: ISubmitCharityContributionUseCase,
    @Inject(IListCampaignContributionsUseCase)
    private readonly listContributionsUseCase: IListCampaignContributionsUseCase,
    @Inject(IRecordExternalContributionUseCase)
    private readonly recordExternalUseCase: IRecordExternalContributionUseCase,
    @Inject(IListExternalContributionsUseCase)
    private readonly listExternalUseCase: IListExternalContributionsUseCase,
    @Inject(ICloseCharityCampaignUseCase)
    private readonly closeUseCase: ICloseCharityCampaignUseCase,
    @Inject(IExtendCharityCampaignUseCase)
    private readonly extendUseCase: IExtendCharityCampaignUseCase,
    @Inject(IManageCharityCoordinatorsUseCase)
    private readonly coordinatorsUseCase: IManageCharityCoordinatorsUseCase,
    @Inject(IManageCharityBeneficiaryUseCase)
    private readonly beneficiaryUseCase: IManageCharityBeneficiaryUseCase,
    @Inject(IRequestCharityMediaUploadUseCase)
    private readonly mediaUploadUseCase: IRequestCharityMediaUploadUseCase,
    @Inject(IReplaceCharityMediaUseCase)
    private readonly replaceMediaUseCase: IReplaceCharityMediaUseCase,
  ) {}

  @Get('mine')
  @ApiOperation({
    summary: 'Hồ sơ hoạt động tôi đã gửi',
    description:
      'Mọi trạng thái duyệt, kể cả `PENDING_APPROVAL` và `REJECTED` kèm `approvalNote`. ' +
      'Đây là đường DUY NHẤT để người gửi biết hồ sơ của mình đang ở đâu — đường công ' +
      'khai cố tình không trả chúng.',
  })
  @ApiErrorResponses(...ApiTokenErrors)
  @ApiOkResponse({ type: ResponseDto.forApi(ListCharityCampaignsResponseDto) })
  public async listMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListCharityCampaignsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listMineUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Get('joined')
  @ApiOperation({
    summary: 'Hoạt động tôi đã đăng ký',
    description:
      'Chỉ lượt đăng ký còn hiệu lực — đã huỷ thì không còn ở đây. KHÔNG lọc theo trạng ' +
      'thái duyệt: một hoạt động bị Admin tắt sau khi đã có người đăng ký vẫn phải hiện ' +
      'trong lịch của họ, nếu không thì nó biến mất mà không ai nói gì.',
  })
  @ApiErrorResponses(...ApiTokenErrors)
  @ApiOkResponse({ type: ResponseDto.forApi(ListCharityCampaignsResponseDto) })
  public async listJoined(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListCharityCampaignsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listJoinedUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Post()
  @ApiOperation({
    summary: 'Gửi hồ sơ hoạt động từ thiện',
    description:
      'BR-CHARITY-01: thành viên đủ hạng gửi hồ sơ, và nó vào `PENDING_APPROVAL` — chỉ ' +
      'công khai sau khi Admin duyệt.\n\n' +
      'Quyền này là một dòng trong **Rank Config** (`SUBMIT_CHARITY_PROPOSAL`), không ' +
      'phải một phép so hạng trong mã nguồn. Mặc định chỉ Kim Cương được bật; Bên A hạ ' +
      'xuống Vàng bằng `PUT /admin/entitlements/policy`, không cần deploy.' +
      '\n\n**Media:** gửi `media` (1–5 key từ `POST /charity-campaigns/media/upload`) và `coverKey`. Không còn nhận `bannerUrl`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignCreateNotAllowedException,
    CharityMediaInvalidException,
    [ValidationFailedException, ['endTime phải sau startTime']],
  )
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: WriteCharityCampaignBodyDto,
  ) {
    const campaign = await this.createUseCase.handle({
      ...body.campaign,
      actorUserId: principal.userId,
      // Cờ do CONTROLLER đặt, không do body. Một cờ nhận từ body là một cờ người dùng tự
      // bật để bỏ qua bước duyệt.
      asAdmin: false,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }

  @Post('media/upload')
  @ApiOperation({
    summary: 'Xin URL tải ảnh/video cho hoạt động từ thiện',
    description:
      'Bước 1 của luồng "tải trước, tạo sau": xin URL, PUT file lên R2, rồi gửi `key` trong ' +
      '`POST /charity-campaigns` hoặc `PUT /charity-campaigns/:id/media`. Ảnh JPEG/PNG/WebP ' +
      'tối đa 5 MB; video MP4/QuickTime/WebM tối đa 25 MB. URL hết hạn sau `expiresInSeconds`. ' +
      'Object không được gắn vào hoạt động nào bị dọn sau 24 giờ.',
  })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    [
      'upload: Phương tiện hoạt động từ thiện chỉ nhận ảnh (image/jpeg, image/png, image/webp) hoặc video (video/mp4, video/quicktime, video/webm).',
    ],
  ])
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCharityMediaUploadResponseDto),
  })
  public async requestCharityMediaUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RequestCharityMediaUploadBodyDto,
  ) {
    const upload = await this.mediaUploadUseCase.handle({
      userId: principal.userId,
      contentType: body.upload.contentType,
      contentLength: body.upload.contentLength,
    });

    return ResponseDto.create().succeed().attach({ upload }).build();
  }

  @Post(':id/contributions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gửi đề nghị đóng góp vật phẩm (F65b §4)',
    description:
      'Một đề nghị gồm nhiều dòng; mỗi dòng trỏ vào một dòng nhu cầu của hoạt động và nói số lượng muốn tặng theo ĐƠN VỊ của dòng đó.\n\n' +
      'Đề nghị **không giữ chỗ**: nó không trừ vào `remainingQuantity` cho tới khi người tổ chức chấp nhận. Giữ chỗ ngay lúc gửi thì một loạt đề nghị không thực hiện sẽ làm hoạt động trông như đã đủ và chặn người tặng thật.\n\n' +
      'Hoạt động chưa duyệt trả cùng lỗi với hoạt động không tồn tại; đã đóng hoặc đang đình chỉ thì `409 CHARITY_NOT_ACCEPTING_CONTRIBUTIONS` — một mã cho cả ba, vì phân biệt chúng là cho người ngoài dò được trạng thái kiểm duyệt.\n\n' +
      '`contactNote` chỉ người tổ chức của hoạt động và chính bạn đọc được.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityContributionDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotAcceptingContributionsException,
    CharityNeedItemInvalidException,
  )
  public async submitContribution(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: SubmitCharityContributionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.submitContributionUseCase.handle({
          campaignId: id,
          contributorId: principal.userId,
          note: body.note,
          contactNote: body.contactNote,
          items: body.items,
        }),
      )
      .build();
  }

  @Get(':id/contributions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách đề nghị của một hoạt động (người tổ chức)',
    description:
      'Chỉ người tổ chức hoạt động đọc được: danh sách này mang `contactNote` của người tặng, và §9 nói response công khai không trả contact.\n\n' +
      'Lọc theo `status` để lấy riêng hàng chờ điều phối (`PENDING_REVIEW`).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityContributionPageDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
  )
  public async listContributions(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Query() query: ListContributionsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listContributionsUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
          status: query.status,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Post(':id/external-contributions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ghi nhận vật phẩm nhận NGOÀI APP (F65b §7)',
    description:
      'Cộng vào số đã nhận của dòng nhu cầu ngay. Không gắn tài khoản nào nên không sinh điểm cho ai. Không chặn vượt mục tiêu — đây là vật phẩm đã ở trong kho thật. Sửa sai bằng `PATCH /charity-external-contributions/:id`, không bao giờ bằng cách gõ lại một con số tổng.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityExternalContributionDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityNotAcceptingContributionsException,
    CharityNeedItemInvalidException,
    CharityLinesInvalidException,
  )
  public async recordExternal(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: RecordExternalContributionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.recordExternalUseCase.handle({
          campaignId: id,
          recordedBy: principal.userId,
          ...body,
        }),
      )
      .build();
  }

  @Get(':id/external-contributions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lịch sử đóng góp ngoài app (người tổ chức)',
    description:
      'Gồm cả bản đã huỷ: đọc chuỗi `replacesId` là đọc được toàn bộ lịch sử của một con số.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityExternalContributionListDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
  )
  public async listExternal(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listExternalUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post(':id/close')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đóng hoạt động (người tổ chức hoặc Admin) — F65b §8',
    description:
      'Chặn đề nghị mới, từ chối hàng loạt đề nghị đang chờ với lý do `CAMPAIGN_CLOSED`, và **giữ nguyên** lượt giao nhận đang chạy — chúng vẫn hoàn tất được. `approval_status` giữ `APPROVED`; trạng thái "đã đóng" là `is_active = false` cộng `end_time` đã qua. Chưa có đường gia hạn.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CloseCharityCampaignResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityCampaignNotClosableException,
  )
  public async close(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.closeUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post(':id/extend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gia hạn hoạt động đang mở (người tổ chức hoặc Admin) — F65b §8',
    description:
      'Chỉ DỜI mốc kết thúc ra sau, và chỉ khi hoạt động đang mở. Mỗi lần gia hạn ghi một hàng audit chỉ-ghi-thêm (mốc cũ, mốc mới, ai, vì sao).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ExtendCharityCampaignResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityCampaignNotExtendableException,
    CharityLinesInvalidException,
  )
  public async extend(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: ExtendCharityCampaignBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.extendUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
          endTime: body.endTime,
          reason: body.reason,
        }),
      )
      .build();
  }

  @Post(':id/coordinators')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Giao quyền coordinator (chỉ người tổ chức)',
    description:
      'Coordinator (F65b §2) xét đề nghị, hoàn tất/huỷ lượt giao nhận và ghi đóng góp ngoài app được — nhưng KHÔNG đóng, gia hạn hay giao quyền tiếp. Chỉ hoạt động có tổ chức mới có coordinator. Thu quyền có hiệu lực ngay ở lượt bấm kế tiếp, kể cả khi màn hình của coordinator còn mở.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityCoordinatorListDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityCoordinatorNotAllowedException,
  )
  public async grantCoordinator(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: GrantCharityCoordinatorBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.coordinatorsUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
          action: 'GRANT',
          userId: body.userId,
        }),
      )
      .build();
  }

  @Get(':id/coordinators')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách coordinator đang có hiệu lực' })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityCoordinatorListDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
  )
  public async listCoordinators(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.coordinatorsUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
          action: 'LIST',
        }),
      )
      .build();
  }

  @Delete(':id/coordinators/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thu quyền coordinator (chỉ người tổ chức)',
    description:
      'Đặt mốc thu quyền, KHÔNG xoá bản ghi: lượt giao nhận do coordinator đó xét vẫn phải truy được vì sao họ từng có quyền.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityCoordinatorListDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityCoordinatorNotAllowedException,
  )
  public async revokeCoordinator(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.coordinatorsUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
          action: 'REVOKE',
          userId,
        }),
      )
      .build();
  }

  @Get(':id/beneficiary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thông tin người thụ hưởng — RIÊNG TƯ (F65b §2)',
    description:
      'Chỉ người tổ chức, hoặc Admin có `campaign.manage` để xác minh trước khi duyệt. Chỉ có ở kêu gọi cá nhân cho NGƯỜI KHÁC.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityBeneficiaryResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityBeneficiaryNotApplicableException,
  )
  public async getBeneficiary(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.beneficiaryUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Put(':id/beneficiary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ghi thông tin người thụ hưởng (chỉ người tổ chức)',
    description:
      'Chuyển đồng ý về `PENDING` lúc hoạt động đang công khai thì hoạt động TỰ ẨN ngay trong cùng lượt ghi (`hidden: true`) — người thụ hưởng không còn đồng ý thì hoàn cảnh của họ không được tiếp tục hiện.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityBeneficiaryResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityBeneficiaryNotApplicableException,
  )
  public async putBeneficiary(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: CharityBeneficiaryInputDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.beneficiaryUseCase.handle({
          campaignId: id,
          actorUserId: principal.userId,
          beneficiary: body,
        }),
      )
      .build();
  }

  @Put(':id/media')
  @ApiOperation({
    summary: 'Thay cả bộ ảnh/video của hồ sơ đang chờ duyệt',
    description:
      'Gửi LẠI toàn bộ danh sách: key giữ nguyên thì gửi lại, key bỏ đi thì không gửi. ' +
      'Đổi thứ tự hoặc đổi ảnh bìa cũng đi đường này.\n\n' +
      'Chỉ người TẠO, chỉ khi `approvalStatus = PENDING_APPROVAL`. Đã duyệt thì khoá — ' +
      'Admin duyệt bộ ảnh nào thì công khai đúng bộ đó. Coordinator không gọi được.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityMediaNotEditableException,
    CharityMediaInvalidException,
    [
      ValidationFailedException,
      [
        'media: Không tìm thấy object — hãy tải lên qua URL đã xin trước khi gửi key',
      ],
    ],
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async replaceCharityMedia(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
    @Body() body: ReplaceCharityMediaBodyDto,
  ) {
    const campaign = await this.replaceMediaUseCase.handle({
      campaignId: param.id,
      actorUserId: principal.userId,
      media: body.media.keys,
      coverKey: body.media.coverKey,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }

  @Post(':id/participation')
  @ApiOperation({
    summary: 'Đăng ký tham gia',
    description:
      'Đóng theo `endTime`, KHÔNG theo `startTime`: một hoạt động trao quà kéo dài cả ' +
      'ngày vẫn nhận người đến giữa buổi, và BR-CHARITY-03 chỉ gắn `startTime` vào lượt ' +
      'HUỶ.\n\n' +
      'Đăng ký lại sau khi đã huỷ thì được — hàng cũ hồi về `REGISTERED`. Bấm hai lần ' +
      'liên tiếp thì lần thứ hai trả 409, không im lặng coi như thành công.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityParticipationClosedException,
    CharityAlreadyRegisteredException,
  )
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async join(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.joinUseCase.handle({
          actorUserId: principal.userId,
          campaignId: param.id,
        }),
      )
      .build();
  }

  @Post(':id/participation/cancel')
  @ApiOperation({
    summary: 'Huỷ đăng ký',
    description:
      'BR-CHARITY-03: chỉ huỷ được khi hoạt động CHƯA bắt đầu. Người tổ chức chốt số ' +
      'suất theo danh sách đăng ký trước giờ khai mạc, nên một lượt huỷ giữa buổi không ' +
      'trả lại được gì.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotRegisteredException,
    CharityCancelTooLateException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async cancel(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.cancelUseCase.handle({
          actorUserId: principal.userId,
          campaignId: param.id,
        }),
      )
      .build();
  }

  @Post(':id/reviews')
  @ApiOperation({
    summary: 'Đánh giá sau hoạt động',
    description:
      'BR-CHARITY-03, hai chiều: người tổ chức chấm người tham gia, người tham gia chấm ' +
      'người tổ chức. CHỈ hai chiều đó — hai người tham gia không chấm nhau được, nếu ' +
      'không thì một hoạt động thiện nguyện thành chỗ để hai người lạ hạ điểm nhau.\n\n' +
      'Chỉ mở SAU `endTime`. Mỗi người chấm mỗi người một lần cho mỗi hoạt động.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityReviewTooEarlyException,
    CharityReviewNotPermittedException,
    CharityReviewDuplicateException,
  )
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async review(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
    @Body() body: ReviewCharityCampaignBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.reviewUseCase.handle({
          actorUserId: principal.userId,
          campaignId: param.id,
          revieweeId: body.review.revieweeId,
          rating: body.review.rating,
          comment: body.review.comment,
        }),
      )
      .build();
  }

  @Patch(':id/progress')
  @ApiOperation({
    summary: 'Cập nhật số phần quà đã trao',
    description:
      'BR-CHARITY-02: con số này là **lời khai** của người tổ chức. Hệ thống KHÔNG đối ' +
      'soát nó với `gift_transactions` hay bất cứ bảng giao dịch nào, và không có hook ' +
      'nào tự tăng nó.\n\n' +
      'Lý do không tự động: một hoạt động trao 500 suất cơm nấu tại chỗ không sinh ra ' +
      '500 giao dịch nào, nên con số tự động sẽ hiện 0/500 giữa lúc hoạt động đã xong — ' +
      'tức hệ thống tự tạo ra một con số sai rồi trình bày nó như số đo.\n\n' +
      'Chỉ người TẠO hoạt động gọi được đường này. Admin dùng ' +
      '`PATCH /admin/charity-campaigns/:id/progress`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async updateProgress(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
    @Body() body: UpdateCharityProgressBodyDto,
  ) {
    const campaign = await this.progressUseCase.handle({
      actorUserId: principal.userId,
      campaignId: param.id,
      currentItemsCount: body.progress.currentItemsCount,
      asAdmin: false,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }
}

/**
 * Đường Admin.
 *
 * `/admin/charity-campaigns` chứ không `/admin/campaigns`: đường kia đã là cấu hình bố
 * cục Home của F63. Hai thứ khác nhau hoàn toàn mà SRS gọi chung một chữ "chiến dịch", và
 * một lượt trùng đường sẽ khiến Nest khớp vào controller khai trước.
 */
@ApiTags('Admin - Hoạt động Từ thiện')
@ApiBearerAuth()
@Controller('admin/charity-campaigns')
export class AdminCharityCampaignController {
  public constructor(
    @Inject(IListAdminCharityCampaignsUseCase)
    private readonly listUseCase: IListAdminCharityCampaignsUseCase,
    @Inject(ICreateCharityCampaignUseCase)
    private readonly createUseCase: ICreateCharityCampaignUseCase,
    @Inject(IDecideCharityApprovalUseCase)
    private readonly decideUseCase: IDecideCharityApprovalUseCase,
    @Inject(ISetCharityCampaignActiveUseCase)
    private readonly setActiveUseCase: ISetCharityCampaignActiveUseCase,
    @Inject(IUpdateCharityProgressUseCase)
    private readonly progressUseCase: IUpdateCharityProgressUseCase,
    @Inject(IGetAdminCharityCampaignUseCase)
    private readonly getUseCase: IGetAdminCharityCampaignUseCase,
  ) {}

  @Get()
  @RequiresPermission('campaign.read')
  @ApiOperation({
    summary: 'Danh sách hoạt động (mọi trạng thái)',
    description:
      'Lọc `approvalStatus=PENDING_APPROVAL` để ra hàng đợi duyệt, cũ nhất trước — ' +
      '`IDX_campaigns_pending` phục vụ đúng câu đó. Quyền `campaign.read`.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListCharityCampaignsResponseDto) })
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminCharityCampaignsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          approvalStatus: query.approvalStatus as
            CharityApprovalStatus | undefined,
        }),
      )
      .build();
  }

  @Get(':id')
  @RequiresPermission('campaign.read')
  @ApiOperation({
    summary: 'Một hoạt động cho CMS, mọi trạng thái duyệt',
    description:
      'Khác `GET /campaigns/:idOrSlug` (công khai): đọc được cả hồ sơ `PENDING_APPROVAL` ' +
      'và `REJECTED`, nên Admin mở được một dòng từ hàng đợi duyệt. Chỉ nhận id, không ' +
      'nhận slug.\n\n' +
      'KHÔNG kèm người thụ hưởng — dữ liệu riêng tư đó đọc ở ' +
      '`GET /charity-campaigns/:id/beneficiary`. `isJoined` luôn `null`. Quyền `campaign.read`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityCampaignNotFoundException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async getOne(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getUseCase.handle({
          actorUserId: principal.userId,
          campaignId: param.id,
        }),
      )
      .build();
  }

  @Post()
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Admin tạo hoạt động trực tiếp',
    description:
      'BR-CHARITY-01: Admin tạo thì vào thẳng `APPROVED`, không qua bước duyệt. ' +
      '`approvedBy` ghi chính người tạo — một hàng đã duyệt mà không ai chịu trách nhiệm ' +
      'là một hàng không truy được.\n\n' +
      'Dùng CHUNG use case với đường thành viên, nên đúng bộ phép kiểm nội dung. Quyền ' +
      '`campaign.manage`.' +
      '\n\n**Media:** gửi `media` (1–5 key từ `POST /charity-campaigns/media/upload`) và `coverKey`. Không còn nhận `bannerUrl`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityMediaInvalidException,
    [ValidationFailedException, ['endTime phải sau startTime']],
  )
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: WriteCharityCampaignBodyDto,
  ) {
    const campaign = await this.createUseCase.handle({
      ...body.campaign,
      actorUserId: principal.userId,
      asAdmin: true,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }

  @Patch(':id/approval')
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Duyệt hoặc từ chối hồ sơ',
    description:
      'Chỉ đổi được hồ sơ còn `PENDING_APPROVAL`. Hai Admin bấm cùng lúc thì người sau ' +
      'nhận 409 — phép kiểm đó nằm trong `WHERE` của chính câu `UPDATE`, không phải một ' +
      'lượt đọc trước đó, nên không ghi đè được quyết định người trước.\n\n' +
      '`REJECTED` giữ lại hồ sơ chứ không xoá: người gửi cần biết vì sao, và Admin cần ' +
      'thấy mình đã xử lý nó. Quyền `campaign.manage`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityCampaignNotFoundException,
    CharityApprovalAlreadyDecidedException,
    CharityBeneficiaryConsentRequiredException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async decide(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
    @Body() body: DecideCharityApprovalBodyDto,
  ) {
    const campaign = await this.decideUseCase.handle({
      actorUserId: principal.userId,
      campaignId: param.id,
      approve: body.approval.approve,
      note: body.approval.note,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }

  @Patch(':id/active')
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Bật hoặc tắt một hoạt động',
    description:
      'Tắt thì hoạt động rời khỏi đường công khai và không nhận đăng ký mới, nhưng vẫn ' +
      'hiện trong `GET /charity-campaigns/joined` của người đã đăng ký. Quyền ' +
      '`campaign.manage`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityCampaignNotFoundException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async setActive(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
    @Body() body: SetCharityCampaignActiveBodyDto,
  ) {
    const campaign = await this.setActiveUseCase.handle({
      actorUserId: principal.userId,
      campaignId: param.id,
      isActive: body.campaign.isActive,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }

  @Patch(':id/progress')
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Admin cập nhật số phần quà đã trao',
    description:
      'Cùng con số LỜI KHAI ở `PATCH /charity-campaigns/:id/progress`, chỉ khác người ' +
      'gọi. BR-CHARITY-02 cho cả người tổ chức và Admin cập nhật. Quyền `campaign.manage`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityCampaignNotFoundException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async updateProgress(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
    @Body() body: UpdateCharityProgressBodyDto,
  ) {
    const campaign = await this.progressUseCase.handle({
      actorUserId: principal.userId,
      campaignId: param.id,
      currentItemsCount: body.progress.currentItemsCount,
      asAdmin: true,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }
}
