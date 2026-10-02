import {
  ICreateHomeCampaignUseCase,
  IGetHomeCampaignUseCase,
  IGetHomeLayoutUseCase,
  IListHomeCampaignsUseCase,
  IUpdateHomeCampaignUseCase,
} from '@/application/contracts/home-campaign';
import { HomeCampaignNotFoundException } from '@/domain/exceptions';
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
  Inject,
  Param,
  ParseUUIDPipe,
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
  HomeCampaignMutationResponseDto,
  HomeCampaignResponseDto,
  HomeLayoutResponseDto,
  ListHomeCampaignsQueryDto,
  ListHomeCampaignsResponseDto,
  WriteHomeCampaignBodyDto,
} from '../../dto/home-campaign/home-campaign.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Chiến dịch & Home động')
@ApiBearerAuth()
@Controller('admin')
export class AdminCampaignController {
  public constructor(
    @Inject(IListHomeCampaignsUseCase)
    private readonly listUseCase: IListHomeCampaignsUseCase,
    @Inject(IGetHomeCampaignUseCase)
    private readonly getUseCase: IGetHomeCampaignUseCase,
    @Inject(ICreateHomeCampaignUseCase)
    private readonly createUseCase: ICreateHomeCampaignUseCase,
    @Inject(IUpdateHomeCampaignUseCase)
    private readonly updateUseCase: IUpdateHomeCampaignUseCase,
  ) {}

  @Get('campaigns')
  @RequiresPermission('campaign.read')
  @ApiOperation({
    summary: 'Danh sách chiến dịch & cấu hình Home',
    description:
      'Gồm cả bản nháp (`isActive: false`). Sắp theo `startTime` giảm dần.\n\n' +
      'Hai cờ KHÁC nhau và CMS phải hiện khác nhau: `isActive` là Admin đã bật, ' +
      '`isLive` là bố cục đang thật sự phục vụ. Một chiến dịch tháng sau có `isActive: ' +
      'true` mà `isLive: false` — nhập hai cái làm một thì Admin bật xong tưởng Home đã đổi.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListHomeCampaignsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListHomeCampaignsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Get('campaigns/:campaignId')
  @RequiresPermission('campaign.read')
  @ApiOperation({
    summary: 'Một chiến dịch, để mở ra sửa',
    description:
      'Trả bố cục ĐÃ CHUẨN HOÁ, không trả JSON thô trong cột: khối có `type` lạ đã bị ' +
      'loại và `order` đã đánh số lại. CMS phải hiển thị bản này — hiện giá trị thô sẽ ' +
      'cho Admin đọc một bố cục khác bố cục đang chạy.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(HomeCampaignResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [HomeCampaignNotFoundException],
  )
  public async getOne(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getUseCase.handle({
          actorUserId: principal.userId,
          campaignId,
        }),
      )
      .build();
  }

  @Post('campaigns')
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Tạo chiến dịch & bố cục Home mới',
    description:
      'Lưu xong thì XOÁ ngay khoá đệm `cache:home_layout_config` (UC-ADM-03 bước 5). ' +
      'Nếu Redis không trả lời, response vẫn thành công nhưng `cacheInvalidated` là ' +
      '`false` — nghĩa là bố cục cũ còn phục vụ tới một giờ. CMS phải nói rõ điều đó.\n\n' +
      '**Bản nháp lưu được dù thiếu gần hết.** Chỉ khi `isActive: true` mới đòi có ít ' +
      'nhất một khối đang bật — chặn lưu nháp là buộc Admin dựng xong cả chiến dịch ' +
      'trong một lần ngồi.\n\n' +
      'Giá trị sai KHÔNG trả 422 mà bị chuẩn hoá: màu không phải hex về màu mặc định, ' +
      'deep link sai giao thức về `null`, khối `type` lạ bị loại. Response trả lại bản ' +
      'đã chuẩn hoá nên Admin thấy ngay thứ mình gõ có được nhận không. Bắt 422 vì một ' +
      'ô màu sẽ làm mất cả bố cục vừa kéo thả.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(HomeCampaignMutationResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['endTime phải sau startTime']],
  )
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: WriteHomeCampaignBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createUseCase.handle({
          actorUserId: principal.userId,
          campaignName: body.campaign.campaignName,
          theme: body.campaign.theme,
          marqueeText: body.campaign.marqueeText ?? null,
          banners: body.campaign.banners,
          sectionsLayout: body.campaign.sectionsLayout,
          popup: body.campaign.popup,
          floatingBanner: body.campaign.floatingBanner,
          startTime: new Date(body.campaign.startTime),
          endTime: new Date(body.campaign.endTime),
          isActive: body.campaign.isActive,
        }),
      )
      .build();
  }

  @Put('campaigns/:campaignId')
  @RequiresPermission('campaign.manage')
  @ApiOperation({
    summary: 'Sửa chiến dịch & bố cục Home',
    description:
      'Thay toàn bộ cấu hình, không vá từng trường: một bố cục nửa cũ nửa mới là thứ ' +
      'không ai đọc được khi đi soát lại.\n\n' +
      'Bật một chiến dịch TRÙNG GIỜ với một chiến dịch đang bật khác bị Postgres từ ' +
      'chối qua `EXCL_home_campaign_configs_active_overlap` (BR_CAMP_01). Ràng buộc ' +
      'nằm ở database chứ không ở nhánh `if`: hai request song song cùng vượt qua được ' +
      'một nhánh kiểm.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(HomeCampaignMutationResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [HomeCampaignNotFoundException],
    [ValidationFailedException, ['endTime phải sau startTime']],
  )
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() body: WriteHomeCampaignBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.updateUseCase.handle({
          actorUserId: principal.userId,
          campaignId,
          campaignName: body.campaign.campaignName,
          theme: body.campaign.theme,
          marqueeText: body.campaign.marqueeText ?? null,
          banners: body.campaign.banners,
          sectionsLayout: body.campaign.sectionsLayout,
          popup: body.campaign.popup,
          floatingBanner: body.campaign.floatingBanner,
          startTime: new Date(body.campaign.startTime),
          endTime: new Date(body.campaign.endTime),
          isActive: body.campaign.isActive,
        }),
      )
      .build();
  }
}

@ApiTags('Cấu hình Home')
@Controller('config')
export class HomeLayoutController {
  public constructor(
    @Inject(IGetHomeLayoutUseCase)
    private readonly getLayoutUseCase: IGetHomeLayoutUseCase,
  ) {}

  @Get('home-layout')
  @Public()
  @ApiOperation({
    summary: 'Bố cục Home đang hoạt động',
    description:
      'Công khai, không cần token — đây là màn hình đầu tiên của app, kể cả với khách ' +
      'chưa đăng nhập. Đệm Redis TTL 1 giờ.\n\n' +
      '**Luôn trả về một bố cục dùng được.** Không chiến dịch nào tới hiệu lực thì trả ' +
      'bố cục mặc định với `campaignId: null` (BR_CAMP_02) — giữa hai chiến dịch là ' +
      'phần lớn thời gian của năm, trả rỗng ở đó nghĩa là app không có gì vẽ.\n\n' +
      'Hai khối `URGENT_CAMPAIGN_ITEMS` và `CAMPAIGN_TOP_GIVERS` **tắt** trong bố cục ' +
      'mặc định: cả hai đọc dữ liệu theo chiến dịch, nên bật chúng khi không có chiến ' +
      'dịch nào là hứa một danh sách rỗng.\n\n' +
      'Redis chết thì endpoint vẫn chạy, chỉ là mỗi lượt gọi đi một truy vấn.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(HomeLayoutResponseDto) })
  public async getHomeLayout() {
    const result = await this.getLayoutUseCase.handle({});

    return ResponseDto.create().succeed().attach(result.layout).build();
  }
}
