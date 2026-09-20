import {
  IGetNotificationChannelsUseCase,
  IUpdateNotificationChannelUseCase,
} from '@/application/contracts/admin-config';
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
import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetNotificationChannelsResponseDto,
  NotificationChannelParamsDto,
  UpdateNotificationChannelBodyDto,
  UpdateNotificationChannelResponseDto,
} from '../../dto/admin-config/notification-channel.dto';

@ApiTags('Admin - Kênh gửi')
@ApiBearerAuth()
@Controller('admin/notification-channels')
export class NotificationChannelController {
  public constructor(
    @Inject(IGetNotificationChannelsUseCase)
    private readonly getNotificationChannelsUseCase: IGetNotificationChannelsUseCase,
    @Inject(IUpdateNotificationChannelUseCase)
    private readonly updateNotificationChannelUseCase: IUpdateNotificationChannelUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Cấu hình các kênh gửi email/SMS/Zalo',
    description:
      'Chỉ trả cấu hình và trạng thái đã có secret hay chưa. Giá trị secret không bao giờ đọc ra được qua API.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(GetNotificationChannelsResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getNotificationChannels(
    @CurrentUser() principal: IAuthPrincipal,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getNotificationChannelsUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Put(':channel')
  @ApiOperation({
    summary: 'Đổi cấu hình một kênh gửi',
    description:
      'Secret gửi lên được mã hoá trước khi lưu. Bỏ trống secret để giữ nguyên, gửi null để xoá. Mọi thay đổi đều ghi audit kèm lý do.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(UpdateNotificationChannelResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['reason không được để trống']],
  )
  public async updateNotificationChannel(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: NotificationChannelParamsDto,
    @Body() body: UpdateNotificationChannelBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.updateNotificationChannelUseCase.handle({
          actorUserId: principal.userId,
          channel: params.channel,
          channelConfig: body.channelConfig,
        }),
      )
      .build();
  }
}
