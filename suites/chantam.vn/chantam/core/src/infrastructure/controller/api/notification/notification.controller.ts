import {
  IListNotificationsUseCase,
  IMarkNotificationsReadUseCase,
} from '@/application/contracts/notification';
import { NotificationPreferenceUseCases } from '@/application/implementations/notification/notification-preference.use-cases';
import {
  IListNotificationsResponseDto,
  IMarkNotificationsReadResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Body, Controller, Get, Inject, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListNotificationPreferencesResponseDto,
  ListNotificationsQueryDto,
  ListNotificationsResponseDto,
  MarkNotificationsReadBodyDto,
  MarkNotificationsReadResponseDto,
  SetNotificationPreferenceBodyDto,
} from '../../dto/notification';

@ApiTags('Thông báo')
@Controller('notifications')
export class NotificationController {
  public constructor(
    private readonly preferences: NotificationPreferenceUseCases,
    @Inject(IListNotificationsUseCase)
    private readonly listNotificationsUseCase: IListNotificationsUseCase,
    @Inject(IMarkNotificationsReadUseCase)
    private readonly markNotificationsReadUseCase: IMarkNotificationsReadUseCase,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Hộp thư thông báo của chính mình',
    description:
      '`unreadCount` là TỔNG số chưa đọc, không phụ thuộc trang hay bộ lọc đang xem — mở trang 2 không được làm badge tụt xuống.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListNotificationsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async listMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<ResponseDto<IListNotificationsResponseDto>> {
    const result = await this.listNotificationsUseCase.handle({
      ...query,
      userId: principal.userId,
    });

    return ResponseDto.create<IListNotificationsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Get('me/preferences')
  @ApiOperation({
    summary: 'Cài đặt thông báo theo nhóm',
    description:
      'Bốn nhóm: giao dịch, chat, bảng tin, hệ thống. Luôn trả đủ bốn kể cả khi người dùng chưa đụng tới cài đặt — bảng chỉ lưu ngoại lệ, nhưng màn hình cần đủ bốn công tắc. Mỗi nhóm kèm danh sách loại thuộc nó, để client khỏi tự đoán và khỏi lệch khi backend thêm loại mới.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ListNotificationPreferencesResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async listPreferences(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach({
        preferences: await this.preferences.list(principal.userId),
      })
      .build();
  }

  @Patch('me/preferences')
  @ApiOperation({
    summary: 'Tắt hoặc bật tiếng một nhóm thông báo',
    description:
      'Tắt một nhóm chỉ tắt TIẾNG CHUÔNG: thông báo vẫn được ghi vào hộp thư để người dùng tự vào xem. Bỏ luôn bản ghi thì họ mất hẳn thông tin, chứ không phải được yên tĩnh. Trước 29/09 là tất-cả-hoặc-không, nên người bị làm phiền sẽ tắt thông báo ở mức hệ điều hành và mất luôn `GIFT_REQUEST_ACCEPTED` — thứ thật sự quan trọng.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ListNotificationPreferencesResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async setPreference(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: SetNotificationPreferenceBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach({
        preferences: await this.preferences.set({
          userId: principal.userId,
          group: body.preference.group,
          muted: body.preference.muted,
        }),
      })
      .build();
  }

  @Patch('me/read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đánh dấu thông báo đã đọc',
    description:
      'Bỏ trống `notificationIds` thì đánh dấu tất cả. Id không thuộc người gọi đơn giản không khớp dòng nào — không báo lỗi, vì báo lỗi là nói cho họ biết id đó có thật.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(MarkNotificationsReadResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async markRead(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: MarkNotificationsReadBodyDto,
  ): Promise<ResponseDto<IMarkNotificationsReadResponseDto>> {
    const result = await this.markNotificationsReadUseCase.handle({
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IMarkNotificationsReadResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
