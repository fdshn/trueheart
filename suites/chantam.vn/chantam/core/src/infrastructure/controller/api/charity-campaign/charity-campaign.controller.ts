import {
  ICancelCharityParticipationUseCase,
  ICreateCharityCampaignUseCase,
  IDecideCharityApprovalUseCase,
  IJoinCharityCampaignUseCase,
  IListAdminCharityCampaignsUseCase,
  IListJoinedCharityCampaignsUseCase,
  IListMyCharityCampaignsUseCase,
  IReviewCharityCampaignUseCase,
  ISetCharityCampaignActiveUseCase,
  IUpdateCharityProgressUseCase,
} from '@/application/contracts/charity-campaign';
import {
  CharityAlreadyRegisteredException,
  CharityApprovalAlreadyDecidedException,
  CharityCampaignCreateNotAllowedException,
  CharityCampaignNotFoundException,
  CharityCancelTooLateException,
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
  CharityCampaignIdParamDto,
  CharityCampaignWrapperResponseDto,
  DecideCharityApprovalBodyDto,
  ListAdminCharityCampaignsQueryDto,
  ListCharityCampaignsQueryDto,
  ListCharityCampaignsResponseDto,
  ReviewCharityCampaignBodyDto,
  SetCharityCampaignActiveBodyDto,
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
      'xuống Vàng bằng `PUT /admin/entitlements/policy`, không cần deploy.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignCreateNotAllowedException,
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

  @Post()
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Admin tạo hoạt động trực tiếp',
    description:
      'BR-CHARITY-01: Admin tạo thì vào thẳng `APPROVED`, không qua bước duyệt. ' +
      '`approvedBy` ghi chính người tạo — một hàng đã duyệt mà không ai chịu trách nhiệm ' +
      'là một hàng không truy được.\n\n' +
      'Dùng CHUNG use case với đường thành viên, nên đúng bộ phép kiểm nội dung. Quyền ' +
      '`campaign.manage`.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['endTime phải sau startTime'],
  ])
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
