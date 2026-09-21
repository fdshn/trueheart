import {
  IListNotificationsUseCase,
  IMarkNotificationsReadUseCase,
} from '@/application/contracts/notification';
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
  ListNotificationsQueryDto,
  ListNotificationsResponseDto,
  MarkNotificationsReadBodyDto,
  MarkNotificationsReadResponseDto,
} from '../../dto/notification';

@ApiTags('Thông báo')
@Controller('notifications')
export class NotificationController {
  public constructor(
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
